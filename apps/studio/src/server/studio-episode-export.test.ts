import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  findEpisodeSucceededOutputAssets: vi.fn(),
  findApprovedEpisodeExportInputs: vi.fn(),
}));

vi.mock("@ai-manju/db", () => ({
  EpisodeExportEligibilityError: class EpisodeExportEligibilityError extends Error {},
  findApprovedEpisodeExportInputs: databaseMocks.findApprovedEpisodeExportInputs,
  findEpisodeSucceededOutputAssets: databaseMocks.findEpisodeSucceededOutputAssets,
  findLatestEpisodeExport: vi.fn(),
}));

import { requestStudioEpisodeExport, StudioEpisodeExportError } from "./studio-episode-export";

const episodeId = "b27c8f35-6f9f-4d49-b96c-4b59a0d59f1c";
const outputIds = [
  "e144891c-b0cf-4137-b743-dbd9b485d308",
  "340201cc-6a50-457a-91b5-17d07761aae2",
  "4ca93b43-d8d9-4eed-a9b9-75d5c20b6850",
];

describe("studio episode export request", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    databaseMocks.findEpisodeSucceededOutputAssets.mockResolvedValue(outputIds.map((id, index) => ({
      shotId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      sequence: index + 1,
      output: { id, sourceRunId: `00000000-0000-4000-8000-00000000001${index + 1}` },
    })));
  });

  it("enqueues the ordered successful outputs only after the server review gate passes", async () => {
    databaseMocks.findApprovedEpisodeExportInputs.mockResolvedValue([]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const request = await requestStudioEpisodeExport({ episodeId, requestedBy: "local-studio-reviewer" }, { db: {} as never, enqueue });

    expect(databaseMocks.findApprovedEpisodeExportInputs).toHaveBeenCalledWith({}, outputIds);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ episodeId, inputAssetIds: outputIds, requestedBy: "local-studio-reviewer" }));
    expect(request.inputAssetIds).toEqual(outputIds);
  });

  it("does not enqueue when a shot lacks a completed output", async () => {
    databaseMocks.findEpisodeSucceededOutputAssets.mockResolvedValue([{ shotId: "00000000-0000-4000-8000-000000000001", sequence: 1, output: null }]);
    const enqueue = vi.fn();

    await expect(requestStudioEpisodeExport({ episodeId, requestedBy: "local-studio-reviewer" }, { db: {} as never, enqueue })).rejects.toBeInstanceOf(StudioEpisodeExportError);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
