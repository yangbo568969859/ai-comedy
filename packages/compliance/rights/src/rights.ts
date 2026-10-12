import { z } from "zod";

import { assetIdSchema, contractVersion, isoUtcSchema, sha256HexSchema } from "@ai-manju/domain";

export const rightsStatusSchema = z.enum(["unknown", "pending_verification", "verified", "expired", "revoked"]);
export const commercialUseSchema = z.enum(["unknown", "allowed", "not_allowed"]);
export const licenseTypeSchema = z.enum(["owned", "licensed", "provider_authorized", "public_domain", "unknown"]);

export const assetRightsRecordSchema = z
  .object({
    contractVersion: z.literal(contractVersion),
    assetId: assetIdSchema,
    status: rightsStatusSchema,
    commercialUse: commercialUseSchema,
    licenseType: licenseTypeSchema,
    // Evidence is represented only by immutable content digests, never by the authorization original.
    evidenceHashes: z.array(sha256HexSchema).max(32),
    effectiveAt: isoUtcSchema.optional(),
    expiresAt: isoUtcSchema.optional(),
    recordedAt: isoUtcSchema,
    recordedBy: z.string().min(1).max(256),
  })
  .superRefine((record, context) => {
    if (record.status === "verified" && record.evidenceHashes.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceHashes"], message: "Verified rights require evidence hashes" });
    }
    if (record.effectiveAt && record.expiresAt && Date.parse(record.effectiveAt) > Date.parse(record.expiresAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "Rights cannot expire before they become effective" });
    }
  });
export type AssetRightsRecord = z.infer<typeof assetRightsRecordSchema>;

export type RightsGateResult =
  | { allowed: true; reasonCode: "rights_verified_for_commercial_use" }
  | { allowed: false; reasonCode: "rights_unknown" | "rights_pending_verification" | "rights_expired" | "rights_revoked" | "commercial_use_not_allowed" | "commercial_use_unknown" };

/**
 * This only determines whether an asset may enter a commercial generation request.
 * It is not an approval for publication: the separate human rights review remains required.
 */
export function evaluateCommercialRights(recordInput: unknown, now: Date = new Date()): RightsGateResult {
  const record = assetRightsRecordSchema.parse(recordInput);

  if (record.status === "unknown") return { allowed: false, reasonCode: "rights_unknown" };
  if (record.status === "pending_verification") return { allowed: false, reasonCode: "rights_pending_verification" };
  if (record.status === "expired" || (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime())) {
    return { allowed: false, reasonCode: "rights_expired" };
  }
  if (record.status === "revoked") return { allowed: false, reasonCode: "rights_revoked" };
  if (record.commercialUse === "not_allowed") return { allowed: false, reasonCode: "commercial_use_not_allowed" };
  if (record.commercialUse === "unknown") return { allowed: false, reasonCode: "commercial_use_unknown" };

  return { allowed: true, reasonCode: "rights_verified_for_commercial_use" };
}
