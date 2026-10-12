import { z } from "zod";

import { sha256HexSchema } from "@ai-manju/domain";

/** Opaque location inside a private object store. It is never a URL. */
export const storageObjectKeySchema = z
  .string()
  .min(1)
  .max(1_024)
  .regex(/^(?!https?:\/\/)(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9][A-Za-z0-9!_.*'()\-/]{0,1023}$/i, "Invalid private object key");

export const storageMimeTypeSchema = z.string().min(3).max(255).regex(/^[a-z]+\/[a-z0-9.+-]+$/i);

export const storagePutRequestSchema = z.object({
  key: storageObjectKeySchema,
  content: z.instanceof(Uint8Array).refine((value) => value.byteLength > 0, "Object content must not be empty"),
  contentType: storageMimeTypeSchema,
  expectedSha256: sha256HexSchema,
});
export type StoragePutRequest = z.infer<typeof storagePutRequestSchema>;

export const storedObjectSchema = z.object({
  key: storageObjectKeySchema,
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contentType: storageMimeTypeSchema,
  sha256: sha256HexSchema,
  eTag: z.string().min(1).max(512).optional(),
});
export type StoredObject = z.infer<typeof storedObjectSchema>;

export const signedGetUrlSchema = z.object({
  key: storageObjectKeySchema,
  url: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
});
export type SignedGetUrl = z.infer<typeof signedGetUrlSchema>;

export const signGetRequestSchema = z.object({
  key: storageObjectKeySchema,
  expiresInSeconds: z.number().int().min(1).max(3_600),
});
export type SignGetRequest = z.infer<typeof signGetRequestSchema>;

/** Provider-neutral boundary used by application and worker code. */
export interface StoragePort {
  put(request: StoragePutRequest): Promise<StoredObject>;
  head(key: string): Promise<StoredObject | null>;
  signGetUrl(request: SignGetRequest): Promise<SignedGetUrl>;
  remove(key: string): Promise<void>;
}
