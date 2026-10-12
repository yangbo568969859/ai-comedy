import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadStudioReview, studioProjectQueryOptions, studioQueryKeys, submitStudioGenerationRun, uploadStudioShotAsset } from "./studio-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("studio query ownership", () => {
  it("uses one stable key for the persisted Studio project tree", () => {
    expect(studioProjectQueryOptions.queryKey).toEqual(["studio", "project"]);
    expect(studioProjectQueryOptions.queryKey).toEqual(studioQueryKeys.project());
  });

  it("invalidates the Studio project cache without invalidating unrelated client state", async () => {
    const queryClient = new QueryClient();
    const unrelatedKey = ["workspace", "layout"] as const;
    queryClient.setQueryData(studioQueryKeys.project(), { project: "cached" });
    queryClient.setQueryData(unrelatedKey, { panel: "open" });

    await queryClient.invalidateQueries({ queryKey: studioQueryKeys.project() });

    expect(queryClient.getQueryState(studioQueryKeys.project())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });

  it("sends the selected persisted reference role with an asset upload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      asset: {
        id: "3d5d912f-9286-4e31-805f-2b30b07ef6f7",
        kind: "image",
        label: "anchor.png",
        contentType: "image/png",
        byteSize: "1",
      },
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadStudioShotAsset(
      "8f37754e-7799-4c73-91cc-bb81c062d3fb",
      new File(["x"], "anchor.png", { type: "image/png" }),
      "last_frame",
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = request.body as FormData;
    expect(formData.get("role")).toBe("last_frame");
    expect(formData.get("file")).toBeInstanceOf(File);
  });

  it("submits a charge-confirmed idempotent Wan run", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run: {
        runId: "7b2b9021-7d22-4c9a-ae54-b24c38f0852d",
        providerId: "wan",
        providerModel: "wan2.7-r2v",
        status: "queued",
        estimatedCostMinorUnits: 240,
        currency: "CNY",
        createdAt: "2026-10-06T00:00:00.000Z",
        events: [{ sequence: 1, from: "draft", to: "queued", occurredAt: "2026-10-06T00:00:00.000Z", reasonCode: null }],
      },
    }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await submitStudioGenerationRun(
      "8f37754e-7799-4c73-91cc-bb81c062d3fb",
      "5345d7b2-706e-4ef6-aec4-d7929c9a8ef5",
      ["3d5d912f-9286-4e31-805f-2b30b07ef6f7"],
    );

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/generation-runs");
    expect(JSON.parse(String(request.body))).toEqual({
      idempotencyKey: "5345d7b2-706e-4ef6-aec4-d7929c9a8ef5",
      chargeConfirmed: true,
      referenceAssetIds: ["3d5d912f-9286-4e31-805f-2b30b07ef6f7"],
    });
  });

  it("accepts the shared v1 contract returned by the review API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      review: {
        contractVersion: "v1",
        assetId: "4ca93b43-d8d9-4eed-a9b9-75d5c20b6850",
        sourceRunId: "83131d0e-c301-466d-be0d-42f7c730dcb9",
        content: "approved",
        rights: "approved",
        labeling: "approved",
        decidedBy: "local-studio-reviewer",
        decidedAt: "2026-10-09T00:00:00.000Z",
        status: "approved",
      },
    }), { status: 200 })));

    const review = await loadStudioReview(
      "83131d0e-c301-466d-be0d-42f7c730dcb9",
      "4ca93b43-d8d9-4eed-a9b9-75d5c20b6850",
    );

    expect(review?.contractVersion).toBe("v1");
  });
});
