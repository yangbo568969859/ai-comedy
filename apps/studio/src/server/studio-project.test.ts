import { describe, expect, it } from "vitest";

import { studioProjectResponseSchema } from "./studio-project";

describe("studio project response contract", () => {
  it("represents an explicitly empty production plan", () => {
    expect(studioProjectResponseSchema.parse({ project: null })).toEqual({ project: null });
  });

  it("rejects storage keys and signed URLs from client DTOs", () => {
    expect(() => studioProjectResponseSchema.parse({
      project: {
        id: "ed5a65a0-cb9e-460d-a7e3-0d62589e52b5",
        title: "Demo",
        logline: null,
        episodes: [{
          id: "4e982e63-d790-4d44-8171-4af68148fd15",
          sequence: 1,
          title: "Episode 1",
          synopsis: null,
          shots: [{
            id: "8f37754e-7799-4c73-91cc-bb81c062d3fb",
            sequence: 1,
            title: "Shot 1",
            script: "Script",
            visualPrompt: null,
            durationSec: 3,
            referenceAssets: [{
              id: "e3aa5031-dd70-4d71-89ba-a79bce8b9148",
              kind: "image",
              label: "reference",
              contentType: "image/png",
              byteSize: "10",
              note: null,
              sequence: 1,
              storageKey: "private/key.png",
            }],
          }],
        }],
      },
    })).toThrow();
  });
});
