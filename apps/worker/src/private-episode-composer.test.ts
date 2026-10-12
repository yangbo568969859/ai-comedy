import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  EpisodeCompositionError,
  PrivateEpisodeComposer,
  resolveFfmpegPaths,
  type CommandRunner,
  type EpisodeExportPersistence,
} from "./private-episode-composer.js";

const episodeId = "3f4ecb3d-a7c1-415c-af83-bd4b11b4d391";
const exportId = "4f4ecb3d-a7c1-415c-af83-bd4b11b4d391";
const assetId = "5f4ecb3d-a7c1-415c-af83-bd4b11b4d391";
const source = new TextEncoder().encode("private source video");
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const master = new TextEncoder().encode("private composed master");

function storage() {
  return {
    head: vi.fn(async () => null),
    signGetUrl: vi.fn(async () => ({ key: "generated/run/video.mp4", url: "https://private.example/video", expiresAt: "2026-10-09T00:00:00.000Z" })),
    put: vi.fn(async () => ({ key: "exports/output/master.mp4", byteSize: master.byteLength, contentType: "video/mp4", sha256: createHash("sha256").update(master).digest("hex") })),
    remove: vi.fn(async () => undefined),
  };
}

function persistence(options: { approved?: boolean } = {}) {
  return {
    findApprovedInputs: vi.fn(async () => {
      if (!options.approved) throw new Error("review gate blocked");
      return [{ id: assetId, storageKey: "generated/run/video.mp4", sha256: sourceSha256, contentType: "video/mp4" }];
    }),
    record: vi.fn(async () => undefined),
  } satisfies EpisodeExportPersistence;
}

const runner: CommandRunner = {
  async run(command, args) {
    if (command === "ffprobe") return { stdout: "4.04\n", stderr: "" };
    const output = args.at(-1);
    if (output === undefined) throw new Error("output path missing");
    await writeFile(output, master);
    return { stdout: "", stderr: "" };
  },
};

describe("PrivateEpisodeComposer", () => {
  it("allows an explicit FFmpeg location when the worker PATH is not inherited", () => {
    expect(resolveFfmpegPaths({
      FFMPEG_PATH: "C:\\tools\\ffmpeg.exe",
      FFPROBE_PATH: "C:\\tools\\ffprobe.exe",
    })).toEqual({ ffmpegPath: "C:\\tools\\ffmpeg.exe", ffprobePath: "C:\\tools\\ffprobe.exe" });
  });

  it("does not sign, download, or invoke FFmpeg when an input is not human-approved", async () => {
    const privateStorage = storage();
    const exports = persistence({ approved: false });
    const commandRunner = { run: vi.fn() } satisfies CommandRunner;
    const composer = new PrivateEpisodeComposer(exports, privateStorage, { commandRunner });

    await expect(composer.compose({ exportId, episodeId, inputAssetIds: [assetId], requestedBy: "reviewer@example.test" })).rejects.toThrow("review gate blocked");
    expect(privateStorage.signGetUrl).not.toHaveBeenCalled();
    expect(commandRunner.run).not.toHaveBeenCalled();
  });

  it("writes a private master and immutable provenance only after the review gate passes", async () => {
    const privateStorage = storage();
    const exports = persistence({ approved: true });
    const composer = new PrivateEpisodeComposer(exports, privateStorage, {
      commandRunner: runner,
      fetchImplementation: async () => new Response(source, { status: 200 }),
      now: () => new Date("2026-10-09T01:02:03.000Z"),
      createId: () => "6f4ecb3d-a7c1-415c-af83-bd4b11b4d391",
    });

    await expect(composer.compose({ exportId, episodeId, inputAssetIds: [assetId], requestedBy: "reviewer@example.test" })).resolves.toEqual({
      exportId,
      outputAssetId: "6f4ecb3d-a7c1-415c-af83-bd4b11b4d391",
    });
    expect(privateStorage.put).toHaveBeenCalledWith(expect.objectContaining({ key: `exports/${exportId}/master.mp4`, contentType: "video/mp4" }));
    expect(exports.record).toHaveBeenCalledWith(expect.objectContaining({
      exportId,
      episodeId,
      inputAssetIds: [assetId],
      createdBy: "reviewer@example.test",
    }));
  });

  it("refuses a signed private input whose bytes do not match recorded provenance", async () => {
    const privateStorage = storage();
    const exports = persistence({ approved: true });
    const composer = new PrivateEpisodeComposer(exports, privateStorage, {
      commandRunner: runner,
      fetchImplementation: async () => new Response(new TextEncoder().encode("tampered"), { status: 200 }),
    });

    await expect(composer.compose({ exportId, episodeId, inputAssetIds: [assetId], requestedBy: "reviewer@example.test" })).rejects.toMatchObject({
      code: "input_hash_mismatch",
    } satisfies Partial<EpisodeCompositionError>);
    expect(privateStorage.put).not.toHaveBeenCalled();
  });

  it("removes the private object when immutable provenance persistence fails", async () => {
    const privateStorage = storage();
    const exports = persistence({ approved: true });
    exports.record.mockRejectedValueOnce(new Error("database unavailable"));
    const composer = new PrivateEpisodeComposer(exports, privateStorage, {
      commandRunner: runner,
      fetchImplementation: async () => new Response(source, { status: 200 }),
    });

    await expect(composer.compose({ exportId, episodeId, inputAssetIds: [assetId], requestedBy: "reviewer@example.test" })).rejects.toThrow("database unavailable");
    expect(privateStorage.remove).toHaveBeenCalledWith(`exports/${exportId}/master.mp4`);
  });
});
