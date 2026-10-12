import type { SelectItem } from "../../components/ui/select";
import type { ReferenceAssetRole } from "../studio/types";

export const referenceAssetRoles = [
  "character_anchor",
  "scene_anchor",
  "style_reference",
  "first_frame",
  "last_frame",
  "prop_anchor",
] as const satisfies readonly ReferenceAssetRole[];

export const defaultReferenceAssetRole: ReferenceAssetRole = "character_anchor";

const referenceAssetRoleLabels: Record<ReferenceAssetRole, string> = {
  character_anchor: "角色锚点",
  scene_anchor: "场景锚点",
  style_reference: "风格参考",
  first_frame: "首帧",
  last_frame: "尾帧",
  prop_anchor: "道具锚点",
};

export const referenceAssetRoleItems: readonly SelectItem[] = referenceAssetRoles.map((role) => ({
  value: role,
  label: referenceAssetRoleLabels[role],
}));

export function referenceAssetRoleLabel(role: ReferenceAssetRole): string {
  return referenceAssetRoleLabels[role];
}
