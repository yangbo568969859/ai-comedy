import { describe, expect, it, vi } from "vitest";

import type { NormalizedGenerationRequest } from "@ai-manju/domain";

import { parseWanConfig, WanProvider } from "./wan-provider.js";

const runId = "7b2b9021-7d22-4c9a-ae54-b24c38f0852d";
const assetId = "d372397b-23f2-48f0-8d4f-b2cd0121b330";
const secondAssetId = "7ea2b740-56aa-4147-af82-31ef8da9de7f";
const request: NormalizedGenerationRequest = {
  contractVersion: "v1",
  runId,
  kind: "i2v",
  prompt: "Image 1 turns toward the camera.",
  durationSec: 5,
  resolution: "720p",
  aspectRatio: "9:16",
  inputAssetIds: [assetId],
};

function createProvider(fetch: typeof globalThis.fetch) {
  return new WanProvider({
    config: parseWanConfig({
      WAN_API_KEY: "not-a-real-key",
      WAN_WORKSPACE_ID: "workspace_123",
      WAN_REGION: "cn-beijing",
      WAN_REFERENCE_MODEL: "wan2.7-r2v",
    }),
    mediaResolver: { resolve: vi.fn().mockImplementation(async (assetIds: readonly string[]) => assetIds.map((id, index) => ({ assetId: id, contentType: "image/png", url: `https://private.example.test/input-${index + 1}.png` }))) },
    outputIngestor: { ingest: vi.fn().mockResolvedValue({ assetId, sha256: "a".repeat(64) }) },
    fetch,
    now: () => new Date("2026-10-06T00:00:00.000Z"),
  });
}

describe("WanProvider", () => {
  it("maps a normalized request to the asynchronous Wan 2.7 protocol without exposing credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { task_id: "wan-task-1", task_status: "PENDING" } }), { status: 200 }));
    const provider = createProvider(fetch);

    await expect(provider.submit(request)).resolves.toEqual({ contractVersion: "v1", providerJobId: "wan-task-1", acceptedAt: "2026-10-06T00:00:00.000Z" });
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://workspace_123.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis");
    expect(options.headers).toMatchObject({ "X-DashScope-Async": "enable", Authorization: "Bearer not-a-real-key" });
    expect(JSON.parse(String(options.body))).toMatchObject({
      model: "wan2.7-r2v",
      input: { media: [{ type: "reference_image", url: "https://private.example.test/input-1.png" }] },
      parameters: { resolution: "720P", ratio: "9:16", duration: 5, watermark: true },
    });
  });

  it("ingests a completed task through the runtime boundary and never returns the temporary output URL", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: "wan-task-1", task_status: "PENDING" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: "wan-task-1", task_status: "SUCCEEDED", video_url: "https://temporary.example.test/video.mp4" } }), { status: 200 }));
    const provider = createProvider(fetch);
    await provider.submit(request);

    await expect(provider.poll("wan-task-1", { runId })).resolves.toEqual({
      state: "succeeded",
      outputAssetId: assetId,
      outputHash: "a".repeat(64),
    });
  });

  it("maps expired or unknown tasks to a non-retryable provider result", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { task_status: "UNKNOWN" } }), { status: 200 }));
    const provider = createProvider(fetch);
    await expect(provider.poll("wan-task-expired", { runId })).resolves.toEqual({
      state: "failed",
      retryable: false,
      errorKind: "unknown_outcome",
      message: "Wan task is no longer available",
    });
  });

  it("rejects a frozen run that names a different Wan model", () => {
    const provider = createProvider(vi.fn());
    expect(() => provider.validate(request, { providerModel: "wan2.7-r2v-other" })).toThrow("does not match");
  });

  it("maps a persisted first-frame role to the Wan media type", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { task_id: "wan-task-frame", task_status: "PENDING" } }), { status: 200 }));
    const provider = createProvider(fetch);
    await provider.submit({
      ...request,
      inputAssetIds: [assetId, secondAssetId],
      providerOptions: { wan: { mediaRoles: [{ assetId, role: "first_frame" }, { assetId: secondAssetId, role: "character_anchor" }] } },
    });
    const body = JSON.parse(String((fetch.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.input.media).toEqual([
      { type: "first_frame", url: "https://private.example.test/input-1.png" },
      { type: "reference_image", url: "https://private.example.test/input-2.png" },
    ]);
  });
});
