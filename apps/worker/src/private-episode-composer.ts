import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  assets,
  episodeExports,
  findApprovedEpisodeExportInputs,
  type ApprovedEpisodeExportInput,
  type DatabaseConnection,
} from "@ai-manju/db";
import { contractVersion, episodeExportRecordSchema, episodeExportRequestSchema } from "@ai-manju/domain";
import { AliyunOssStorage, parseAliyunOssConfig, type StoragePort } from "@ai-manju/storage";

const maximumInputBytes = 500 * 1024 * 1024;
const maximumOutputBytes = 1_024 * 1024 * 1024;

export type EpisodeExportPersistence = {
  findApprovedInputs(inputAssetIds: readonly string[]): Promise<ApprovedEpisodeExportInput[]>;
  record(input: {
    exportId: string;
    episodeId: string;
    inputAssetIds: readonly string[];
    outputAssetId: string;
    outputStorageKey: string;
    outputSha256: string;
    outputByteSize: number;
    createdBy: string;
    createdAt: string;
  }): Promise<void>;
};

export type CommandResult = { readonly stdout: string; readonly stderr: string };
export interface CommandRunner {
  run(command: string, args: readonly string[]): Promise<CommandResult>;
}

export class EpisodeCompositionError extends Error {
  constructor(
    readonly code: "input_download_failed" | "input_hash_mismatch" | "ffmpeg_failed" | "invalid_output",
    diagnostic?: string,
  ) {
    super(`Episode composition failed (${code})${diagnostic === undefined ? "" : `: ${diagnostic}`}`);
    this.name = "EpisodeCompositionError";
  }
}

export function createEpisodeCompositionStorageKey(exportId: string): string {
  return `exports/${exportId}/master.mp4`;
}

export function resolveFfmpegPaths(environment: Record<string, string | undefined>): { ffmpegPath: string; ffprobePath: string } {
  const configuredFfmpeg = environment.FFMPEG_PATH?.trim();
  const configuredFfprobe = environment.FFPROBE_PATH?.trim();
  return {
    ffmpegPath: configuredFfmpeg === undefined || configuredFfmpeg.length === 0 ? "ffmpeg" : configuredFfmpeg,
    ffprobePath: configuredFfprobe === undefined || configuredFfprobe.length === 0 ? "ffprobe" : configuredFfprobe,
  };
}

/** Production persistence adapter. Export provenance and output asset commit atomically. */
export class PostgresEpisodeExportPersistence implements EpisodeExportPersistence {
  constructor(private readonly database: DatabaseConnection) {}

  findApprovedInputs(inputAssetIds: readonly string[]) {
    return findApprovedEpisodeExportInputs(this.database.db, inputAssetIds);
  }

  async record(input: Parameters<EpisodeExportPersistence["record"]>[0]): Promise<void> {
    const record = episodeExportRecordSchema.parse({
      contractVersion,
      id: input.exportId,
      episodeId: input.episodeId,
      outputAssetId: input.outputAssetId,
      inputAssetIds: [...input.inputAssetIds],
      createdBy: input.createdBy,
      createdAt: input.createdAt,
    });
    await this.database.db.transaction(async (transaction) => {
      await transaction.insert(assets).values({
        id: record.outputAssetId,
        kind: "video",
        storageKey: input.outputStorageKey,
        sha256: input.outputSha256,
        contentType: "video/mp4",
        byteSize: BigInt(input.outputByteSize),
      });
      await transaction.insert(episodeExports).values({
        id: record.id,
        episodeId: record.episodeId,
        outputAssetId: record.outputAssetId,
        inputAssetIds: [...record.inputAssetIds],
        createdBy: record.createdBy,
        createdAt: record.createdAt,
      });
    });
  }
}

/** Uses direct process spawning: no shell, prompt, URL, or storage secret is passed to FFmpeg. */
export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: readonly string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], { shell: false, windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`${command} exited with ${code ?? "unknown"}`));
      });
    });
  }
}

export type PrivateEpisodeComposerOptions = {
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly fetchImplementation?: typeof globalThis.fetch;
  readonly commandRunner?: CommandRunner;
};

/**
 * Composes already-approved source videos into one private, silent H.264 MP4.
 * Audio remains a separate later-stage asset by design; this prevents accidental
 * mixing of unreviewed narration or music into the master.
 */
export class PrivateEpisodeComposer {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly commandRunner: CommandRunner;

  constructor(
    private readonly persistence: EpisodeExportPersistence,
    private readonly storage: StoragePort,
    options: PrivateEpisodeComposerOptions = {},
  ) {
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? "ffprobe";
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.commandRunner = options.commandRunner ?? new NodeCommandRunner();
  }

  async compose(input: unknown): Promise<{ exportId: string; outputAssetId: string }> {
    const request = episodeExportRequestSchema.parse(input);
    // This eligibility gate intentionally runs before signing/downloading media or invoking FFmpeg.
    const approvedInputs = await this.persistence.findApprovedInputs(request.inputAssetIds);
    if (approvedInputs.length !== request.inputAssetIds.length) throw new EpisodeCompositionError("invalid_output");

    const workingDirectory = await mkdtemp(join(tmpdir(), "ai-manju-export-"));
    const outputAssetId = this.createId();
    const outputStorageKey = createEpisodeCompositionStorageKey(request.exportId);
    try {
      const normalizedPaths: string[] = [];
      for (let index = 0; index < approvedInputs.length; index += 1) {
        const sourcePath = join(workingDirectory, `source-${index + 1}.mp4`);
        const normalizedPath = join(workingDirectory, `normalized-${index + 1}.mp4`);
        await this.downloadPrivateInput(approvedInputs[index]!, sourcePath);
        await this.normalizeVideo(sourcePath, normalizedPath);
        normalizedPaths.push(normalizedPath);
      }
      const concatManifest = join(workingDirectory, "concat.txt");
      await writeFile(concatManifest, normalizedPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
      const masterPath = join(workingDirectory, "master.mp4");
      await this.concatenate(concatManifest, masterPath);
      await this.assertPlayable(masterPath);

      const master = new Uint8Array(await readFile(masterPath));
      if (master.byteLength === 0 || master.byteLength > maximumOutputBytes) throw new EpisodeCompositionError("invalid_output");
      const outputSha256 = createHash("sha256").update(master).digest("hex");
      await this.storage.put({ key: outputStorageKey, content: master, contentType: "video/mp4", expectedSha256: outputSha256 });
      try {
        await this.persistence.record({
          exportId: request.exportId,
          episodeId: request.episodeId,
          inputAssetIds: request.inputAssetIds,
          outputAssetId,
          outputStorageKey,
          outputSha256,
          outputByteSize: master.byteLength,
          createdBy: request.requestedBy,
          createdAt: this.now().toISOString(),
        });
      } catch (error) {
        await this.storage.remove(outputStorageKey).catch(() => undefined);
        throw error;
      }
      return { exportId: request.exportId, outputAssetId };
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }

  private async downloadPrivateInput(input: ApprovedEpisodeExportInput, destination: string): Promise<void> {
    const signed = await this.storage.signGetUrl({ key: input.storageKey, expiresInSeconds: 900 });
    const response = await this.fetchImplementation(signed.url, { redirect: "error" });
    if (!response.ok) throw new EpisodeCompositionError("input_download_failed");
    const advertisedSize = response.headers.get("content-length");
    if (advertisedSize !== null && Number(advertisedSize) > maximumInputBytes) throw new EpisodeCompositionError("input_download_failed");
    const content = new Uint8Array(await response.arrayBuffer());
    if (content.byteLength === 0 || content.byteLength > maximumInputBytes) throw new EpisodeCompositionError("input_download_failed");
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (sha256.toLowerCase() !== input.sha256.toLowerCase()) throw new EpisodeCompositionError("input_hash_mismatch");
    await writeFile(destination, content);
  }

  private async normalizeVideo(sourcePath: string, destination: string): Promise<void> {
    try {
      await this.commandRunner.run(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath,
        "-map", "0:v:0", "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
        "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", destination,
      ]);
    } catch (error) {
      throw new EpisodeCompositionError("ffmpeg_failed", ffmpegDiagnostic(error, "FFMPEG_PATH"));
    }
  }

  private async concatenate(manifestPath: string, destination: string): Promise<void> {
    try {
      await this.commandRunner.run(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", manifestPath,
        "-map", "0:v:0", "-c", "copy", "-movflags", "+faststart", destination,
      ]);
    } catch (error) {
      throw new EpisodeCompositionError("ffmpeg_failed", ffmpegDiagnostic(error, "FFMPEG_PATH"));
    }
  }

  private async assertPlayable(path: string): Promise<void> {
    try {
      const result = await this.commandRunner.run(this.ffprobePath, [
        "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path,
      ]);
      if (!Number.isFinite(Number(result.stdout.trim())) || Number(result.stdout.trim()) <= 0) {
        throw new EpisodeCompositionError("invalid_output");
      }
    } catch (error) {
      if (error instanceof EpisodeCompositionError) throw error;
      throw new EpisodeCompositionError("invalid_output", ffmpegDiagnostic(error, "FFPROBE_PATH"));
    }
  }
}

function ffmpegDiagnostic(error: unknown, variable: "FFMPEG_PATH" | "FFPROBE_PATH"): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  if (code === "ENOENT") return `${variable} executable was not found; set ${variable} to its absolute path`;
  return `verify ${variable} and inspect the worker process logs`;
}

/** Creates the production composer from explicit process owner configuration. */
export function createPrivateEpisodeComposer(environment: Record<string, string | undefined>, database: DatabaseConnection): PrivateEpisodeComposer {
  const storage = new AliyunOssStorage(parseAliyunOssConfig(environment));
  const paths = resolveFfmpegPaths(environment);
  return new PrivateEpisodeComposer(new PostgresEpisodeExportPersistence(database), storage, paths);
}
