import { describe, expect, it, vi } from "vitest";

import {
  createStudioReferenceAssetStorageKey,
  maximumStudioReferenceAssetBytes,
  StudioAssetUploadError,
  uploadStudioReferenceAsset,
  validateStudioReferenceAssetUpload,
} from "./studio-asset-upload";

const shotId = "8f37754e-7799-4c73-91cc-bb81c062d3fb";
const assetId = "e3aa5031-dd70-4d71-89ba-a79bce8b9148";

function createDependencies(options: { shotExists?: boolean; persistenceFails?: boolean } = {}) {
  const storage = {
    put: vi.fn().mockResolvedValue({}),
    head: vi.fn().mockResolvedValue(null),
    signGetUrl: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    shotExists: vi.fn().mockResolvedValue(options.shotExists ?? true),
    createReferenceAsset: options.persistenceFails
      ? vi.fn().mockRejectedValue(new Error("database unavailable"))
      : vi.fn().mockResolvedValue(undefined),
  };
  return { storage, repository };
}

const pngContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("studio reference asset upload", () => {
  it("uses opaque, path-safe object keys derived from IDs and media type", () => {
    expect(createStudioReferenceAssetStorageKey(shotId, assetId, "image/jpeg"))
      .toBe(`uploads/${shotId}/${assetId}.jpg`);
  });

  it("rejects unsupported files and oversized uploads before storage", () => {
    expect(() => validateStudioReferenceAssetUpload({
      shotId,
      fileName: "notes.txt",
      contentType: "text/plain",
      content: new Uint8Array([1]),
      role: "character_anchor",
    })).toThrow(StudioAssetUploadError);
    expect(() => validateStudioReferenceAssetUpload({
      shotId,
      fileName: "large.png",
      contentType: "image/png",
      content: new Uint8Array(maximumStudioReferenceAssetBytes + 1),
      role: "character_anchor",
    })).toThrow(StudioAssetUploadError);
  });

  it("rejects SVG and a forged image MIME type before storage", () => {
    expect(() => validateStudioReferenceAssetUpload({
      shotId,
      fileName: "unsafe.svg",
      contentType: "image/svg+xml",
      content: new Uint8Array([60, 115, 118, 103, 62]),
      role: "character_anchor",
    })).toThrow(StudioAssetUploadError);
    expect(() => validateStudioReferenceAssetUpload({
      shotId,
      fileName: "not-an-image.png",
      contentType: "image/png",
      content: new Uint8Array([60, 115, 118, 103, 62]),
      role: "character_anchor",
    })).toThrow("does not match");
  });

  it("persists an image reference without exposing its private storage key", async () => {
    const { storage, repository } = createDependencies();
    const response = await uploadStudioReferenceAsset({
      shotId,
      fileName: "character.png",
      contentType: "image/png",
      content: pngContent,
      role: "character_anchor",
    }, { storage, repository, createAssetId: () => assetId });

    expect(storage.put).toHaveBeenCalledWith(expect.objectContaining({
      key: `uploads/${shotId}/${assetId}.png`,
      contentType: "image/png",
    }));
    expect(repository.createReferenceAsset).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: `uploads/${shotId}/${assetId}.png`,
      byteSize: 12n,
    }));
    expect(response).toEqual({ asset: {
      id: assetId,
      kind: "image",
      label: "character.png",
      contentType: "image/png",
      byteSize: "12",
    } });
    expect(JSON.stringify(response)).not.toContain("storageKey");
  });

  it("does not upload when the shot is absent", async () => {
    const { storage, repository } = createDependencies({ shotExists: false });
    await expect(uploadStudioReferenceAsset({
      shotId,
      fileName: "character.png",
      contentType: "image/png",
      content: pngContent,
      role: "character_anchor",
    }, { storage, repository, createAssetId: () => assetId })).rejects.toMatchObject({
      code: "STUDIO_SHOT_NOT_FOUND",
      status: 404,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("attempts private-object cleanup when database persistence fails", async () => {
    const { storage, repository } = createDependencies({ persistenceFails: true });
    await expect(uploadStudioReferenceAsset({
      shotId,
      fileName: "character.png",
      contentType: "image/png",
      content: pngContent,
      role: "character_anchor",
    }, { storage, repository, createAssetId: () => assetId })).rejects.toMatchObject({
      code: "STUDIO_ASSET_PERSIST_FAILED",
      status: 500,
    });
    expect(storage.remove).toHaveBeenCalledWith(`uploads/${shotId}/${assetId}.png`);
  });
});
