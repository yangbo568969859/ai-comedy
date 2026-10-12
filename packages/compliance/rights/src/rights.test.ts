import { describe, expect, it } from "vitest";

import { assetRightsRecordSchema, evaluateCommercialRights, type AssetRightsRecord } from "./index.js";

const base: AssetRightsRecord = {
  contractVersion: "v1",
  assetId: "c0a0fcf3-3a8c-4fe5-a9a0-cfe8fceb36d0",
  status: "verified",
  commercialUse: "allowed",
  licenseType: "owned",
  evidenceHashes: ["a".repeat(64)],
  recordedAt: "2026-10-04T12:00:00.000Z",
  recordedBy: "reviewer@example.test",
};

describe("commercial rights gate", () => {
  it("allows only current, verified, commercially authorized assets", () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    expect(evaluateCommercialRights(base, now)).toEqual({ allowed: true, reasonCode: "rights_verified_for_commercial_use" });
    expect(evaluateCommercialRights({ ...base, status: "unknown", commercialUse: "unknown" }, now)).toEqual({ allowed: false, reasonCode: "rights_unknown" });
    expect(evaluateCommercialRights({ ...base, status: "pending_verification" }, now)).toEqual({ allowed: false, reasonCode: "rights_pending_verification" });
    expect(evaluateCommercialRights({ ...base, commercialUse: "not_allowed" }, now)).toEqual({ allowed: false, reasonCode: "commercial_use_not_allowed" });
    expect(evaluateCommercialRights({ ...base, expiresAt: "2026-10-04T11:59:59.000Z" }, now)).toEqual({ allowed: false, reasonCode: "rights_expired" });
  });

  it("rejects a verified record without evidence", () => {
    expect(assetRightsRecordSchema.safeParse({ ...base, evidenceHashes: [] }).success).toBe(false);
  });
});
