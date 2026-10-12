import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import type { ReviewDecision, StudioAssetDto, StudioEpisodeExportStatusDto, StudioGenerationRunDto, StudioProjectDto, StudioReviewDto } from "./types";

const apiAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["image", "video", "audio", "subtitle", "document"]),
  label: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.string().regex(/^\d+$/),
  role: z.enum(["character_anchor", "scene_anchor", "style_reference", "first_frame", "last_frame", "prop_anchor"]),
  note: z.string().nullable(),
  sequence: z.number().int().positive(),
}).strict();

const apiProjectResponseSchema = z.object({
  project: z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    logline: z.string().nullable(),
    episodes: z.array(z.object({
      id: z.string().uuid(),
      sequence: z.number().int().positive(),
      title: z.string().min(1),
      synopsis: z.string().nullable(),
      shots: z.array(z.object({
        id: z.string().uuid(),
        sequence: z.number().int().positive(),
        title: z.string().min(1),
        script: z.string(),
        visualPrompt: z.string().nullable(),
        durationSec: z.number().int().min(1).max(60),
        referenceAssets: z.array(apiAssetSchema),
      })),
    })),
  }).nullable(),
}).strict();

const uploadAssetResponseSchema = z.object({
  asset: z.object({
    id: z.string().uuid(),
    kind: z.enum(["image", "video"]),
    label: z.string().min(1),
    contentType: z.string().min(1),
    byteSize: z.string().regex(/^\d+$/),
  }).strict(),
}).strict();

const uploadErrorResponseSchema = z.object({
  error: z.object({ message: z.string().min(1) }).strict(),
}).strict();

const executionStatusSchema = z.enum(["draft", "queued", "submitting", "provider_queued", "running", "cancel_requested", "succeeded", "failed", "canceled"]);
const generationRunSchema = z.object({
  runId: z.string().uuid(),
  providerId: z.literal("wan"),
  providerModel: z.string().min(1),
  status: executionStatusSchema,
  estimatedCostMinorUnits: z.number().int().nonnegative(),
  currency: z.literal("CNY"),
  createdAt: z.string().datetime({ offset: true }),
  outputAssetId: z.string().uuid().optional(),
  outputContentPath: z.string().startsWith("/api/studio/assets/").optional(),
  events: z.array(z.object({
    sequence: z.number().int().positive(),
    from: executionStatusSchema,
    to: executionStatusSchema,
    occurredAt: z.string().datetime({ offset: true }),
    reasonCode: z.string().nullable(),
  }).strict()),
}).strict();
const generationRunResponseSchema = z.object({ run: generationRunSchema.nullable() }).strict();
const studioReviewSchema = z.object({
  contractVersion: z.literal("v1"),
  assetId: z.string().uuid(), sourceRunId: z.string().uuid(),
  content: z.enum(["approved", "rejected", "needs_changes"]),
  rights: z.enum(["approved", "rejected", "needs_changes"]),
  labeling: z.enum(["approved", "rejected", "needs_changes"]),
  decidedBy: z.string().min(1), decidedAt: z.string().datetime({ offset: true }), note: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]),
}).strict();
const reviewResponseSchema = z.object({ review: studioReviewSchema.nullable() }).strict();
const episodeExportStatusSchema = z.object({
  eligible: z.boolean(), inputCount: z.number().int().nonnegative(),
  reason: z.enum(["ready", "missing_output", "review_required"]).optional(),
  export: z.object({ id: z.string().uuid(), outputContentPath: z.string().startsWith("/api/studio/assets/"), createdAt: z.string().datetime({ offset: true }) }).nullable(),
}).strict();
const episodeExportStatusResponseSchema = z.object({ status: episodeExportStatusSchema }).strict();
const episodeExportSubmitResponseSchema = z.object({ exportId: z.string().uuid() }).strict();
const generationErrorResponseSchema = z.object({ error: z.object({ message: z.string().min(1) }).passthrough() }).passthrough();

export const studioQueryKeys = {
  project: () => ["studio", "project"] as const,
  generationRun: (shotId: string) => ["studio", "shots", shotId, "generation-run"] as const,
  review: (runId: string, assetId: string) => ["studio", "generation-runs", runId, "review", assetId] as const,
  episodeExport: (episodeId: string) => ["studio", "episodes", episodeId, "rough-cut"] as const,
};

export async function loadStudioProject(signal: AbortSignal): Promise<StudioProjectDto | null> {
  const response = await fetch("/api/studio/project", { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Studio project request failed with ${response.status}`);
  const result = apiProjectResponseSchema.parse(await response.json());
  if (result.project === null) return null;

  return {
    id: result.project.id,
    title: result.project.title,
    label: "PostgreSQL 已连接",
    episodes: result.project.episodes.map((episode) => ({
      id: episode.id,
      code: `EP${String(episode.sequence).padStart(2, "0")}`,
      title: episode.title,
      shots: episode.shots.map((shot) => ({
        id: shot.id,
        code: `${String(episode.sequence).padStart(2, "0")}-${String(shot.sequence).padStart(2, "0")}`,
        location: "未填写场景",
        title: shot.title,
        script: shot.script,
        visualPrompt: shot.visualPrompt ?? "尚未填写视觉提示词。",
        durationSec: shot.durationSec,
        aspectRatio: "9:16",
        resolution: "720p",
        planStatus: shot.referenceAssets.length > 0 ? "ready" : "draft",
        version: "v1.0",
        referenceAssets: shot.referenceAssets.map((asset) => ({
          id: asset.id,
          label: asset.label,
          kind: "reference",
          previewKind: asset.kind === "video" ? "video" : "image",
          source: "oss",
          state: "ready",
          role: asset.role,
        })),
      })),
    })),
  };
}

export const studioProjectQueryOptions = queryOptions({
  queryKey: studioQueryKeys.project(),
  queryFn: ({ signal }) => loadStudioProject(signal),
});

export async function uploadStudioShotAsset(shotId: string, file: File, role: StudioAssetDto["role"]): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("role", role);
  const response = await fetch(`/api/studio/shots/${shotId}/assets`, { method: "POST", body: formData });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsedError = uploadErrorResponseSchema.safeParse(body);
    throw new Error(parsedError.success ? parsedError.data.error.message : "参考资产上传失败，请稍后重试。");
  }
  uploadAssetResponseSchema.parse(body);
}

export async function loadStudioGenerationRun(shotId: string, signal?: AbortSignal): Promise<StudioGenerationRunDto | null> {
  const response = await fetch(`/api/studio/shots/${shotId}/generation-runs`, { ...(signal === undefined ? {} : { signal }), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Generation status request failed with ${response.status}`);
  return generationRunResponseSchema.parse(await response.json()).run;
}

export async function submitStudioGenerationRun(shotId: string, idempotencyKey: string, referenceAssetIds: readonly string[]): Promise<StudioGenerationRunDto> {
  const response = await fetch(`/api/studio/shots/${shotId}/generation-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ idempotencyKey, chargeConfirmed: true, referenceAssetIds }),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = generationErrorResponseSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : "生成任务提交失败，请稍后重试。");
  }
  const parsed = generationRunResponseSchema.parse(body).run;
  if (parsed === null) throw new Error("生成任务没有返回运行记录。");
  return parsed;
}

export async function loadStudioReview(runId: string, assetId: string, signal?: AbortSignal): Promise<StudioReviewDto | null> {
  const response = await fetch(`/api/studio/generation-runs/${runId}/review?assetId=${encodeURIComponent(assetId)}`, { ...(signal === undefined ? {} : { signal }), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Review request failed with ${response.status}`);
  return reviewResponseSchema.parse(await response.json()).review;
}

export async function recordStudioReview(runId: string, assetId: string, decisions: Record<"content" | "rights" | "labeling", ReviewDecision>): Promise<StudioReviewDto> {
  const response = await fetch(`/api/studio/generation-runs/${runId}/review?assetId=${encodeURIComponent(assetId)}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(decisions) });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error("审核记录写入失败，请稍后重试。");
  return reviewResponseSchema.extend({ review: studioReviewSchema }).parse(body).review;
}

export async function loadStudioEpisodeExport(episodeId: string, signal?: AbortSignal): Promise<StudioEpisodeExportStatusDto> {
  const response = await fetch(`/api/studio/episodes/${episodeId}/rough-cut`, { ...(signal === undefined ? {} : { signal }), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("粗剪状态读取失败，请稍后重试。");
  return episodeExportStatusResponseSchema.parse(await response.json()).status;
}

export async function submitStudioEpisodeExport(episodeId: string): Promise<string> {
  const response = await fetch(`/api/studio/episodes/${episodeId}/rough-cut`, { method: "POST", headers: { Accept: "application/json" } });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = generationErrorResponseSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : "粗剪提交失败，请稍后重试。");
  }
  return episodeExportSubmitResponseSchema.parse(body).exportId;
}
