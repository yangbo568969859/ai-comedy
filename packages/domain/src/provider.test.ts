import { describe, expect, it } from "vitest";

import {
  preflightGenerationRequest,
  providerCapabilityProfileSchema,
  providerPreflightResultSchema,
} from "./index.js";

const runId = "1b5ec25c-c85d-4178-9250-0fae03e5600e";
const assetId = "c0a0fcf3-3a8c-4fe5-a9a0-cfe8fceb36d0";

const profile = {
  contractVersion: "v1" as const,
  providerId: "seedance",
  providerModel: "seedance-2.5-pro",
  capabilityProfileVersion: "2026-10-05",
  capabilities: [{
    contractVersion: "v1" as const,
    kind: "i2v" as const,
    resolutions: ["720p", "1080p"] as const,
    aspectRatios: ["16:9", "21:9", "9:16"] as const,
    durationSec: { min: 2, max: 10 },
    supportsSeed: true,
    supportsReferenceImages: true,
    supportsAudio: false,
  }],
  advanced: {
    referenceRoles: ["character_anchor", "scene_anchor", "style_reference", "first_frame", "last_frame"],
    maxReferenceImages: 50,
    supportsReferenceVideo: true,
    maxReferenceVideos: 1,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    supportsVideoEdit: true,
    supportsVideoExtend: true,
    supportsNativeAudio: true,
    supportsAsyncCallback: true,
  },
};

const request = {
  contractVersion: "v1" as const,
  runId,
  kind: "i2v" as const,
  prompt: "A character turns toward the camera.",
  durationSec: 5,
  resolution: "720p" as const,
  aspectRatio: "21:9" as const,
  inputAssetIds: [assetId],
};

describe("provider capability contracts", () => {
  it("accepts a versioned profile with 21:9, reference roles, video, and callbacks", () => {
    expect(providerCapabilityProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("preflights a supported request without provider-specific payloads", () => {
    const result = preflightGenerationRequest({ contractVersion: "v1", profile, request });

    expect(result).toEqual({
      supported: true,
      providerId: "seedance",
      providerModel: "seedance-2.5-pro",
      capabilityProfileVersion: "2026-10-05",
    });
    expect(providerPreflightResultSchema.safeParse(result).success).toBe(true);
  });

  it("reports all unsupported normalized request constraints", () => {
    const result = preflightGenerationRequest({
      contractVersion: "v1",
      profile: {
        ...profile,
        capabilities: [{
          ...profile.capabilities[0],
          aspectRatios: ["9:16"],
          durationSec: { min: 2, max: 4 },
          supportsSeed: false,
          supportsReferenceImages: false,
        }],
      },
      request: {
        ...request,
        durationSec: 5,
        seed: 42,
        referenceAssetIds: [assetId],
      },
    });

    expect(result.supported).toBe(false);
    if (!result.supported) {
      expect(result.issues.map((issue) => issue.code)).toEqual([
        "aspect_ratio_unsupported",
        "duration_out_of_range",
        "seed_unsupported",
        "reference_images_unsupported",
      ]);
    }
  });
});
