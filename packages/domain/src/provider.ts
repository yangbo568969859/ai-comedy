import { z } from "zod";

import { contractVersion, isoUtcSchema, providerJobIdSchema } from "./ids.js";
import {
  aspectRatioSchema,
  generationKindSchema,
  normalizedGenerationRequestSchema,
  providerPollResultSchema,
  resolutionSchema,
} from "./generation.js";

const providerIdSchema = z.string().min(1).max(128);
const providerModelSchema = z.string().min(1).max(256);
const capabilityProfileVersionSchema = z.string().min(1).max(256);

export const providerCapabilitySchema = z.object({
  contractVersion: z.literal(contractVersion),
  kind: generationKindSchema,
  resolutions: z.array(resolutionSchema).min(1),
  aspectRatios: z.array(aspectRatioSchema).min(1),
  durationSec: z.object({ min: z.number().positive(), max: z.number().positive() }),
  supportsSeed: z.boolean(),
  supportsReferenceImages: z.boolean(),
  supportsAudio: z.boolean(),
});
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerReferenceRoleSchema = z.enum([
  "character_anchor",
  "scene_anchor",
  "style_reference",
  "prop_anchor",
  "first_frame",
  "last_frame",
]);
export type ProviderReferenceRole = z.infer<typeof providerReferenceRoleSchema>;

/**
 * Features that vary materially across video-generation APIs but are stable
 * enough to expose as product-level capabilities. Provider payload details
 * remain inside the adapter.
 */
export const providerAdvancedCapabilitySchema = z.object({
  referenceRoles: z.array(providerReferenceRoleSchema),
  maxReferenceImages: z.number().int().nonnegative(),
  supportsReferenceVideo: z.boolean(),
  maxReferenceVideos: z.number().int().nonnegative(),
  supportsFirstFrame: z.boolean(),
  supportsLastFrame: z.boolean(),
  supportsVideoEdit: z.boolean(),
  supportsVideoExtend: z.boolean(),
  supportsNativeAudio: z.boolean(),
  supportsAsyncCallback: z.boolean(),
});
export type ProviderAdvancedCapability = z.infer<typeof providerAdvancedCapabilitySchema>;

/**
 * A versioned description of one provider model's usable API surface. It is
 * deliberately provider-neutral so Studio can preflight a request without
 * importing a provider SDK or inspecting a provider-specific payload.
 */
export const providerCapabilityProfileSchema = z.object({
  contractVersion: z.literal(contractVersion),
  providerId: providerIdSchema,
  providerModel: providerModelSchema,
  capabilityProfileVersion: capabilityProfileVersionSchema,
  capabilities: z.array(providerCapabilitySchema).min(1),
  advanced: providerAdvancedCapabilitySchema,
});
export type ProviderCapabilityProfile = z.infer<typeof providerCapabilityProfileSchema>;

export const providerPreflightIssueCodeSchema = z.enum([
  "generation_kind_unsupported",
  "resolution_unsupported",
  "aspect_ratio_unsupported",
  "duration_out_of_range",
  "seed_unsupported",
  "reference_images_unsupported",
  "audio_unsupported",
]);
export type ProviderPreflightIssueCode = z.infer<typeof providerPreflightIssueCodeSchema>;

export const providerPreflightIssueSchema = z.object({
  code: providerPreflightIssueCodeSchema,
  message: z.string().min(1).max(1_000),
});
export type ProviderPreflightIssue = z.infer<typeof providerPreflightIssueSchema>;

export const providerPreflightRequestSchema = z.object({
  contractVersion: z.literal(contractVersion),
  profile: providerCapabilityProfileSchema,
  request: normalizedGenerationRequestSchema,
});
export type ProviderPreflightRequest = z.infer<typeof providerPreflightRequestSchema>;

export const providerPreflightResultSchema = z.discriminatedUnion("supported", [
  z.object({
    supported: z.literal(true),
    providerId: providerIdSchema,
    providerModel: providerModelSchema,
    capabilityProfileVersion: capabilityProfileVersionSchema,
  }),
  z.object({
    supported: z.literal(false),
    providerId: providerIdSchema,
    providerModel: providerModelSchema,
    capabilityProfileVersion: capabilityProfileVersionSchema,
    issues: z.array(providerPreflightIssueSchema).min(1),
  }),
]);
export type ProviderPreflightResult = z.infer<typeof providerPreflightResultSchema>;

/**
 * Evaluates only normalized, provider-neutral constraints. Adapters retain
 * responsibility for provider-specific validation and cost estimation.
 */
export function preflightGenerationRequest(input: ProviderPreflightRequest): ProviderPreflightResult {
  const { profile, request } = providerPreflightRequestSchema.parse(input);
  const issues: ProviderPreflightIssue[] = [];
  const capability = profile.capabilities.find((candidate) => candidate.kind === request.kind);

  if (capability === undefined) {
    issues.push({
      code: "generation_kind_unsupported",
      message: `Model ${profile.providerModel} does not support ${request.kind}`,
    });
  } else {
    if (!capability.resolutions.includes(request.resolution)) {
      issues.push({
        code: "resolution_unsupported",
        message: `Model ${profile.providerModel} does not support ${request.resolution}`,
      });
    }
    if (!capability.aspectRatios.includes(request.aspectRatio)) {
      issues.push({
        code: "aspect_ratio_unsupported",
        message: `Model ${profile.providerModel} does not support ${request.aspectRatio}`,
      });
    }
    if (request.durationSec < capability.durationSec.min || request.durationSec > capability.durationSec.max) {
      issues.push({
        code: "duration_out_of_range",
        message: `Model ${profile.providerModel} supports durations from ${capability.durationSec.min} to ${capability.durationSec.max} seconds`,
      });
    }
    if (request.seed !== undefined && !capability.supportsSeed) {
      issues.push({ code: "seed_unsupported", message: `Model ${profile.providerModel} does not support seeds` });
    }
    if (request.referenceAssetIds !== undefined && !capability.supportsReferenceImages) {
      issues.push({
        code: "reference_images_unsupported",
        message: `Model ${profile.providerModel} does not support reference images`,
      });
    }
    if (request.audioAssetId !== undefined && !capability.supportsAudio) {
      issues.push({ code: "audio_unsupported", message: `Model ${profile.providerModel} does not support audio` });
    }
  }

  const identity = {
    providerId: profile.providerId,
    providerModel: profile.providerModel,
    capabilityProfileVersion: profile.capabilityProfileVersion,
  };
  return issues.length === 0 ? { supported: true, ...identity } : { supported: false, ...identity, issues };
}

export const providerSubmissionSchema = z.object({
  contractVersion: z.literal(contractVersion),
  providerJobId: providerJobIdSchema,
  acceptedAt: isoUtcSchema,
});
export type ProviderSubmission = z.infer<typeof providerSubmissionSchema>;

export interface GenerationProvider {
  readonly id: string;
  getCapabilities(): Promise<readonly ProviderCapability[]>;
  /**
   * Optional while existing adapters migrate. New adapters should expose a
   * versioned profile so callers can preflight before submitting work.
   */
  getCapabilityProfile?(providerModel: string): Promise<ProviderCapabilityProfile>;
  validate(request: z.infer<typeof normalizedGenerationRequestSchema>, context?: { providerModel: string }): void;
  submit(request: z.infer<typeof normalizedGenerationRequestSchema>, context?: { providerModel: string }): Promise<ProviderSubmission>;
  /** Runtime context is not persisted in a provider payload; it lets adapters
   * ingest a completed temporary output against the immutable run that owns it. */
  poll(providerJobId: string, context?: { runId: string }): Promise<z.infer<typeof providerPollResultSchema>>;
  cancel?(providerJobId: string): Promise<void>;
}
