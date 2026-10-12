import { describe, expect, it } from "vitest";

import {
  defaultReferenceAssetRole,
  referenceAssetRoleItems,
  referenceAssetRoles,
  referenceAssetRoleLabel,
} from "./reference-asset-roles";

describe("reference asset roles", () => {
  it("exposes every supported reference role to the Studio selector", () => {
    expect(referenceAssetRoles).toEqual([
      "character_anchor",
      "scene_anchor",
      "style_reference",
      "first_frame",
      "last_frame",
      "prop_anchor",
    ]);
    expect(referenceAssetRoleItems.map((item) => item.value)).toEqual(referenceAssetRoles);
  });

  it("uses a character anchor as the initial upload role", () => {
    expect(defaultReferenceAssetRole).toBe("character_anchor");
    expect(referenceAssetRoleLabel("last_frame")).toBe("尾帧");
  });
});
