import type { ExecutionStatus } from "@ai-manju/domain";

export type ReviewDecision = "approved" | "rejected" | "needs_changes";
export type ShotPlanStatus = "draft" | "ready" | "review";
export type ReferenceAssetRole = "character_anchor" | "scene_anchor" | "style_reference" | "first_frame" | "last_frame" | "prop_anchor";

export interface StudioAssetDto {
  id: string;
  label: string;
  kind: "reference" | "character" | "output";
  previewKind: "image" | "video";
  source: "mock" | "oss";
  state: "ready" | "processing";
  role: ReferenceAssetRole;
}

export interface StudioShotDto {
  id: string;
  code: string;
  location: string;
  title: string;
  script: string;
  visualPrompt: string;
  durationSec: number;
  aspectRatio: "9:16";
  resolution: "720p";
  planStatus: ShotPlanStatus;
  runStatus?: ExecutionStatus;
  version: string;
  referenceAssets: StudioAssetDto[];
}

export interface StudioEpisodeDto {
  id: string;
  code: string;
  title: string;
  shots: StudioShotDto[];
}

export interface StudioProjectDto {
  id: string;
  title: string;
  label: string;
  episodes: StudioEpisodeDto[];
}

export interface StudioGenerationEventDto {
  sequence: number;
  from: ExecutionStatus;
  to: ExecutionStatus;
  occurredAt: string;
  reasonCode: string | null;
}

export interface StudioGenerationRunDto {
  runId: string;
  providerId: "wan";
  providerModel: string;
  status: ExecutionStatus;
  estimatedCostMinorUnits: number;
  currency: "CNY";
  createdAt: string;
  outputAssetId?: string | undefined;
  outputContentPath?: string | undefined;
  events: StudioGenerationEventDto[];
}

export interface StudioReviewDto {
  contractVersion: "v1";
  assetId: string;
  sourceRunId: string;
  content: ReviewDecision;
  rights: ReviewDecision;
  labeling: ReviewDecision;
  decidedBy: string;
  decidedAt: string;
  note?: string | undefined;
  status: "pending" | "approved" | "rejected";
}

export interface StudioEpisodeExportStatusDto {
  eligible: boolean;
  inputCount: number;
  reason?: "ready" | "missing_output" | "review_required" | undefined;
  export: { id: string; outputContentPath: string; createdAt: string } | null;
}
