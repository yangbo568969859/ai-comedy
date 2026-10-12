import { describe, expect, it } from "vitest";

import { parseShenjinDemoAssets, shenjinDemoPlan } from "./shenjin-demo";

describe("Shenjin validation project plan", () => {
  it("has three low-cost, single-character validation shots", () => {
    expect(shenjinDemoPlan.shots).toHaveLength(3);
    expect(shenjinDemoPlan.shots.map((shot) => shot.durationSec)).toEqual([5, 4, 4]);
  });

  it("requires three distinct persisted asset IDs", () => {
    expect(parseShenjinDemoAssets({
      SHENJIN_CHARACTER_ANCHOR_ASSET_ID: "85cf3e86-8b29-4e13-8f10-b91b7d9986e4",
      SHENJIN_FACE_ANCHOR_ASSET_ID: "d659cec1-cf02-457c-b1dc-7d2b532b3cab",
      SHENJIN_STYLE_REFERENCE_ASSET_ID: "488dfd37-3f1a-48de-8a76-22ccba1648f1",
    })).toBeDefined();
    expect(() => parseShenjinDemoAssets({
      SHENJIN_CHARACTER_ANCHOR_ASSET_ID: "85cf3e86-8b29-4e13-8f10-b91b7d9986e4",
      SHENJIN_FACE_ANCHOR_ASSET_ID: "85cf3e86-8b29-4e13-8f10-b91b7d9986e4",
      SHENJIN_STYLE_REFERENCE_ASSET_ID: "488dfd37-3f1a-48de-8a76-22ccba1648f1",
    })).toThrow("distinct");
  });
});
