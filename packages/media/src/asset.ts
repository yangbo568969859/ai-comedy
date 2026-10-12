import { z } from "zod";

import { assetIdSchema, contractVersion, isoUtcSchema, sha256HexSchema } from "@ai-manju/domain";

export const mediaKindSchema = z.enum(["image", "video", "audio", "document"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

const privateObjectKeySchema = z
  .string()
  .min(1)
  .max(1_024)
  .regex(/^(?!https?:\/\/).+$/i, "A private object key must not be a URL");

export const assetMetadataSchema = z.object({
  contractVersion: z.literal(contractVersion),
  assetId: assetIdSchema,
  kind: mediaKindSchema,
  mimeType: z.string().min(3).max(255).regex(/^[a-z]+\/[a-z0-9.+-]+$/i),
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: sha256HexSchema,
  // This opaque key is for a private object store only; it is never a public or signed URL.
  privateObjectKey: privateObjectKeySchema,
  createdAt: isoUtcSchema,
});
export type AssetMetadata = z.infer<typeof assetMetadataSchema>;

export function assertAssetMetadata(value: unknown): AssetMetadata {
  return assetMetadataSchema.parse(value);
}
