import { describe, expect, it } from "vitest";

import { maximumReferenceAssetBytes, validateReferenceAssetFile } from "./reference-assets-panel";

describe("validateReferenceAssetFile", () => {
  it("accepts a supported non-empty file within the size limit", () => {
    expect(validateReferenceAssetFile({ type: "image/png", size: 1024 } as File)).toBeUndefined();
  });

  it("rejects unsupported content types before requesting the upload endpoint", () => {
    expect(validateReferenceAssetFile({ type: "image/svg+xml", size: 1024 } as File)).toContain("JPEG");
  });

  it("rejects an empty or oversized file", () => {
    expect(validateReferenceAssetFile({ type: "video/mp4", size: 0 } as File)).toContain("非空");
    expect(validateReferenceAssetFile({ type: "video/mp4", size: maximumReferenceAssetBytes + 1 } as File)).toContain("25 MB");
  });
});
