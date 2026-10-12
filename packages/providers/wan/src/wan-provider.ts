import {
  contractVersion,
  type GenerationProvider,
  type NormalizedGenerationRequest,
  type ProviderCapability,
  type ProviderCapabilityProfile,
  type ProviderPollResult,
  type ProviderSubmission,
} from "@ai-manju/domain";
import { z } from "zod";

const wanRegions = ["cn-beijing", "ap-southeast-1"] as const;
const wanConfigSchema = z.object({
  apiKey: z.string().min(1),
  workspaceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  region: z.enum(wanRegions),
  referenceModel: z.string().min(1).max(256).default("wan2.7-r2v"),
  signedUrlTtlSeconds: z.number().int().min(60).max(3_600).default(900),
});
export type WanConfig = z.infer<typeof wanConfigSchema>;

export function parseWanConfig(environment: Record<string, string | undefined>): WanConfig {
  return wanConfigSchema.parse({
    apiKey: environment.WAN_API_KEY,
    workspaceId: environment.WAN_WORKSPACE_ID,
    region: environment.WAN_REGION,
    referenceModel: environment.WAN_REFERENCE_MODEL,
    signedUrlTtlSeconds: environment.WAN_SIGNED_URL_TTL_SECONDS === undefined
      ? undefined
      : Number(environment.WAN_SIGNED_URL_TTL_SECONDS),
  });
}

function baseUrl(config: WanConfig): string {
  return `https://${config.workspaceId}.${config.region}.maas.aliyuncs.com/api/v1`;
}

const taskSchema = z.object({
  output: z.object({
    task_id: z.string().min(1).optional(),
    task_status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"]).optional(),
    video_url: z.string().url().optional(),
    code: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
  }).optional(),
  code: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  usage: z.object({ duration: z.number().int().nonnegative().optional() }).optional(),
}).passthrough();

const wanProviderOptionsSchema = z.object({
  wan: z.object({
    mediaRoles: z.array(z.object({
      assetId: z.string().uuid(),
      role: z.enum(["character_anchor", "scene_anchor", "style_reference", "prop_anchor", "first_frame"]),
    }).strict()).max(6),
  }).strict(),
}).passthrough();

export interface WanMediaResolver {
  resolve(assetIds: readonly string[], expiresInSeconds: number): Promise<readonly WanResolvedMedia[]>;
}

export interface WanResolvedMedia {
  readonly assetId: string;
  readonly contentType: string;
  readonly url: string;
}

export interface WanOutputIngestor {
  ingest(input: { runId: string; providerJobId: string; downloadUrl: string }): Promise<{ assetId: string; sha256: string }>;
}

export interface WanProviderOptions {
  readonly config: WanConfig;
  readonly mediaResolver: WanMediaResolver;
  readonly outputIngestor: WanOutputIngestor;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
}

function isVideo(contentType: string): boolean {
  return contentType.startsWith("video/");
}

function providerError(status: number, payload: z.infer<typeof taskSchema>): Error {
  const code = payload.code ?? payload.output?.code ?? `HTTP_${status}`;
  // Provider messages may contain user prompts or URLs; never persist or log them.
  return new Error(`Wan request failed (${code})`);
}

/**
 * Alibaba Cloud Model Studio Wan 2.7 reference-to-video adapter. It maps only
 * normalized contracts to vendor payloads; private asset URLs are resolved at
 * execution time and never written into a GenerationRun snapshot.
 */
export class WanProvider implements GenerationProvider {
  readonly id = "wan";
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly now: () => Date;
  private readonly runsByTaskId = new Map<string, string>();

  constructor(private readonly options: WanProviderOptions) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getCapabilities(): Promise<readonly ProviderCapability[]> {
    return [this.capability()];
  }

  async getCapabilityProfile(providerModel: string): Promise<ProviderCapabilityProfile> {
    if (providerModel !== this.options.config.referenceModel) {
      throw new Error(`Wan model is not configured: ${providerModel}`);
    }
    return {
      contractVersion,
      providerId: this.id,
      providerModel,
      capabilityProfileVersion: "wan2.7-r2v-2026-10-06",
      capabilities: [this.capability()],
      advanced: {
        referenceRoles: ["character_anchor", "scene_anchor", "style_reference", "prop_anchor", "first_frame"],
        maxReferenceImages: 5,
        supportsReferenceVideo: true,
        maxReferenceVideos: 5,
        supportsFirstFrame: true,
        supportsLastFrame: false,
        supportsVideoEdit: false,
        supportsVideoExtend: false,
        supportsNativeAudio: true,
        supportsAsyncCallback: true,
      },
    };
  }

  validate(request: NormalizedGenerationRequest, context?: { providerModel: string }): void {
    if (context?.providerModel !== undefined && context.providerModel !== this.options.config.referenceModel) {
      throw new Error("Wan run model does not match the configured model");
    }
    if (request.kind !== "i2v") throw new Error("Wan 2.7 reference-to-video supports i2v requests only");
    if (request.resolution !== "720p" && request.resolution !== "1080p") throw new Error("Wan 2.7 supports 720p or 1080p only");
    if (!["9:16", "16:9", "1:1", "4:3", "3:4"].includes(request.aspectRatio)) throw new Error("Wan 2.7 does not support this aspect ratio");
    if (request.durationSec < 2 || request.durationSec > 15) throw new Error("Wan 2.7 supports durations from 2 to 15 seconds");
    if (request.seed !== undefined && request.seed > 2_147_483_647) throw new Error("Wan seed must be at most 2147483647");
    if (request.audioAssetId !== undefined) throw new Error("Wan audio asset mapping is not enabled in this MVP adapter");
  }

  async submit(request: NormalizedGenerationRequest, context?: { providerModel: string }): Promise<ProviderSubmission> {
    this.validate(request, context);
    const assetIds = [...new Set([...request.inputAssetIds, ...(request.referenceAssetIds ?? [])])];
    const media = await this.options.mediaResolver.resolve(assetIds, this.options.config.signedUrlTtlSeconds);
    const parsedOptions = request.providerOptions === undefined ? undefined : wanProviderOptionsSchema.safeParse(request.providerOptions);
    if (parsedOptions !== undefined && !parsedOptions.success) throw new Error("Wan provider options are invalid");
    const roles = new Map(parsedOptions?.data.wan.mediaRoles.map((item) => [item.assetId, item.role]) ?? []);
    const firstFrameCount = media.filter((item) => roles.get(item.assetId) === "first_frame").length;
    const referenceCount = media.length - firstFrameCount;
    if (referenceCount < 1 || referenceCount > 5 || firstFrameCount > 1) {
      throw new Error("Wan requires one to five references and at most one first frame");
    }
    const videoCount = media.filter((item) => isVideo(item.contentType)).length;
    if (request.durationSec > 10 && videoCount > 0) throw new Error("Wan supports at most 10 seconds when a reference video is supplied");

    const response = await this.fetchImplementation(`${baseUrl(this.options.config)}/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.options.config.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: this.options.config.referenceModel,
        input: {
          prompt: request.prompt,
          ...(request.negativePrompt === undefined ? {} : { negative_prompt: request.negativePrompt }),
          media: media.map((item) => ({
            type: roles.get(item.assetId) === "first_frame"
              ? "first_frame"
              : isVideo(item.contentType)
                ? "reference_video"
                : "reference_image",
            url: item.url,
          })),
        },
        parameters: {
          resolution: request.resolution.toUpperCase(),
          ratio: request.aspectRatio,
          duration: request.durationSec,
          prompt_extend: false,
          watermark: true,
          ...(request.seed === undefined ? {} : { seed: request.seed }),
        },
      }),
    });
    const payload = taskSchema.parse(await response.json());
    if (!response.ok) throw providerError(response.status, payload);
    const providerJobId = payload.output?.task_id;
    if (providerJobId === undefined) throw new Error("Wan submission did not return a task id");
    this.runsByTaskId.set(providerJobId, request.runId);
    return { contractVersion, providerJobId, acceptedAt: this.now().toISOString() };
  }

  async poll(providerJobId: string, context?: { runId: string }): Promise<ProviderPollResult> {
    const response = await this.fetchImplementation(`${baseUrl(this.options.config)}/tasks/${encodeURIComponent(providerJobId)}`, {
      headers: { "Authorization": `Bearer ${this.options.config.apiKey}` },
    });
    const payload = taskSchema.parse(await response.json());
    if (!response.ok) return this.failedFrom(payload, response.status);
    const status = payload.output?.task_status;
    if (status === "PENDING") return { state: "queued", progressPercent: 0 };
    if (status === "RUNNING") return { state: "running" };
    if (status === "SUCCEEDED") {
      const downloadUrl = payload.output?.video_url;
      const runId = context?.runId ?? this.runsByTaskId.get(providerJobId);
      if (downloadUrl === undefined || runId === undefined) {
        return { state: "failed", retryable: false, errorKind: "unknown_outcome", message: "Wan completed without recoverable output context" };
      }
      const output = await this.options.outputIngestor.ingest({ runId, providerJobId, downloadUrl });
      return { state: "succeeded", outputAssetId: output.assetId, outputHash: output.sha256 };
    }
    return this.failedFrom(payload, response.status);
  }

  private capability(): ProviderCapability {
    return {
      contractVersion,
      kind: "i2v",
      resolutions: ["720p", "1080p"],
      aspectRatios: ["9:16", "16:9", "1:1", "4:3", "3:4"],
      durationSec: { min: 2, max: 15 },
      supportsSeed: true,
      supportsReferenceImages: true,
      supportsAudio: false,
    };
  }

  private failedFrom(payload: z.infer<typeof taskSchema>, status: number): ProviderPollResult {
    const code = payload.code ?? payload.output?.code ?? payload.output?.task_status ?? `HTTP_${status}`;
    if (payload.output?.task_status === "CANCELED") return { state: "failed", retryable: false, errorKind: "permanent", message: "Wan task was canceled" };
    if (payload.output?.task_status === "UNKNOWN") return { state: "failed", retryable: false, errorKind: "unknown_outcome", message: "Wan task is no longer available" };
    const retryable = status === 429 || status >= 500;
    const errorKind = status === 401 || status === 403
      ? "auth"
      : status === 429
        ? "rate_limited"
        : retryable
          ? "temporary"
          : "permanent";
    return { state: "failed", retryable, errorKind, message: `Wan task failed (${code})` };
  }
}
