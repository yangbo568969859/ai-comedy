import { createHash, randomUUID } from "node:crypto";

import { assets, shotReferenceAssets, shots, type DatabaseConnection } from "@ai-manju/db";
import { providerReferenceRoleSchema } from "@ai-manju/domain";
import { type StoragePort } from "@ai-manju/storage";
import { z } from "zod";

export const maximumStudioReferenceAssetBytes = 25 * 1024 * 1024;

const allowedStudioReferenceAssetContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

const uploadFileMetadataSchema = z.object({
  shotId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.enum(allowedStudioReferenceAssetContentTypes),
  byteSize: z.number().int().positive().max(maximumStudioReferenceAssetBytes),
  role: providerReferenceRoleSchema,
}).strict();

export const studioReferenceAssetUploadResponseSchema = z.object({
  asset: z.object({
    id: z.string().uuid(),
    kind: z.enum(["image", "video"]),
    label: z.string().min(1).max(255),
    contentType: z.string().min(3).max(255),
    byteSize: z.string().regex(/^\d+$/),
  }).strict(),
}).strict();

export type StudioReferenceAssetUploadResponse = z.infer<typeof studioReferenceAssetUploadResponseSchema>;

export class StudioAssetUploadError extends Error {
  constructor(
    readonly code: "STUDIO_ASSET_INVALID" | "STUDIO_SHOT_NOT_FOUND" | "STUDIO_ASSET_UPLOAD_FAILED" | "STUDIO_ASSET_PERSIST_FAILED",
    readonly status: 400 | 404 | 500,
    message: string,
  ) {
    super(message);
  }
}

export interface StudioReferenceAssetRepository {
  shotExists(shotId: string): Promise<boolean>;
  createReferenceAsset(input: {
    assetId: string;
    shotId: string;
    kind: "image" | "video";
    storageKey: string;
    sha256: string;
    contentType: string;
    byteSize: bigint;
    label: string;
    role: z.infer<typeof providerReferenceRoleSchema>;
  }): Promise<void>;
}

export interface StudioReferenceAssetUploadDependencies {
  storage: StoragePort;
  repository: StudioReferenceAssetRepository;
  createAssetId?: () => string;
  digest?: (content: Uint8Array) => string;
}

export interface StudioReferenceAssetUploadInput {
  shotId: string;
  fileName: string;
  contentType: string;
  content: Uint8Array<ArrayBuffer>;
  role: z.infer<typeof providerReferenceRoleSchema>;
}

function normalizeFileName(fileName: string): string {
  const normalized = fileName.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return normalized.length === 0 ? "reference-asset" : normalized.slice(0, 255);
}

function fileExtensionFor(contentType: string): string {
  const knownExtensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return knownExtensions[contentType] ?? "bin";
}

function matchesBytes(content: Uint8Array<ArrayBuffer>, expected: number[], offset = 0): boolean {
  return expected.every((byte, index) => content[offset + index] === byte);
}

function matchesAscii(content: Uint8Array<ArrayBuffer>, expected: string, offset: number): boolean {
  return matchesBytes(content, Array.from(expected, (character) => character.charCodeAt(0)), offset);
}

function hasIsoBaseMediaFileType(content: Uint8Array<ArrayBuffer>): boolean {
  return content.byteLength >= 12 && matchesAscii(content, "ftyp", 4);
}

function hasAvifBrand(content: Uint8Array<ArrayBuffer>): boolean {
  if (!hasIsoBaseMediaFileType(content)) return false;
  const searchable = new TextDecoder().decode(content.slice(8, Math.min(content.byteLength, 64)));
  return searchable.includes("avif") || searchable.includes("avis");
}

function hasQuickTimeBrand(content: Uint8Array<ArrayBuffer>): boolean {
  return hasIsoBaseMediaFileType(content) && matchesAscii(content, "qt  ", 8);
}

export function hasExpectedStudioReferenceAssetSignature(
  contentType: typeof allowedStudioReferenceAssetContentTypes[number],
  content: Uint8Array<ArrayBuffer>,
): boolean {
  switch (contentType) {
    case "image/jpeg":
      return matchesBytes(content, [0xff, 0xd8, 0xff]);
    case "image/png":
      return matchesBytes(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return matchesAscii(content, "RIFF", 0) && matchesAscii(content, "WEBP", 8);
    case "image/gif":
      return matchesAscii(content, "GIF87a", 0) || matchesAscii(content, "GIF89a", 0);
    case "image/avif":
      return hasAvifBrand(content);
    case "video/mp4":
      return hasIsoBaseMediaFileType(content) && !hasQuickTimeBrand(content);
    case "video/webm":
      return matchesBytes(content, [0x1a, 0x45, 0xdf, 0xa3]);
    case "video/quicktime":
      return hasQuickTimeBrand(content);
  }
}

export function createStudioReferenceAssetStorageKey(shotId: string, assetId: string, contentType: string): string {
  return `uploads/${shotId}/${assetId}.${fileExtensionFor(contentType)}`;
}

export function validateStudioReferenceAssetUpload(input: StudioReferenceAssetUploadInput): {
  shotId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  kind: "image" | "video";
  role: z.infer<typeof providerReferenceRoleSchema>;
} {
  const contentType = input.contentType.toLowerCase();
  const parsed = uploadFileMetadataSchema.safeParse({
    shotId: input.shotId,
    fileName: normalizeFileName(input.fileName),
    contentType,
    byteSize: input.content.byteLength,
    role: input.role,
  });
  if (!parsed.success) {
    throw new StudioAssetUploadError("STUDIO_ASSET_INVALID", 400, "Upload one non-empty image or video no larger than 25 MB.");
  }
  if (!hasExpectedStudioReferenceAssetSignature(parsed.data.contentType, input.content)) {
    throw new StudioAssetUploadError("STUDIO_ASSET_INVALID", 400, "The file content does not match its declared media type.");
  }

  return {
    ...parsed.data,
    kind: contentType.startsWith("image/") ? "image" : "video",
  };
}

export async function uploadStudioReferenceAsset(
  input: StudioReferenceAssetUploadInput,
  dependencies: StudioReferenceAssetUploadDependencies,
): Promise<StudioReferenceAssetUploadResponse> {
  const metadata = validateStudioReferenceAssetUpload(input);
  const shotExists = await dependencies.repository.shotExists(metadata.shotId);
  if (!shotExists) {
    throw new StudioAssetUploadError("STUDIO_SHOT_NOT_FOUND", 404, "The selected shot does not exist.");
  }

  const assetId = (dependencies.createAssetId ?? randomUUID)();
  const storageKey = createStudioReferenceAssetStorageKey(metadata.shotId, assetId, metadata.contentType);
  const sha256 = (dependencies.digest ?? ((content) => createHash("sha256").update(content).digest("hex")))(input.content);

  try {
    await dependencies.storage.put({
      key: storageKey,
      content: input.content,
      contentType: metadata.contentType,
      expectedSha256: sha256,
    });
  } catch {
    throw new StudioAssetUploadError("STUDIO_ASSET_UPLOAD_FAILED", 500, "The private asset upload could not be completed.");
  }

  try {
    await dependencies.repository.createReferenceAsset({
      assetId,
      shotId: metadata.shotId,
      kind: metadata.kind,
      storageKey,
      sha256,
      contentType: metadata.contentType,
      byteSize: BigInt(metadata.byteSize),
      label: metadata.fileName,
      role: metadata.role,
    });
  } catch {
    await dependencies.storage.remove(storageKey).catch(() => undefined);
    throw new StudioAssetUploadError("STUDIO_ASSET_PERSIST_FAILED", 500, "The uploaded asset could not be recorded.");
  }

  return studioReferenceAssetUploadResponseSchema.parse({
    asset: {
      id: assetId,
      kind: metadata.kind,
      label: metadata.fileName,
      contentType: metadata.contentType,
      byteSize: String(metadata.byteSize),
    },
  });
}

type DbClient = DatabaseConnection["db"];

export function createPostgresStudioReferenceAssetRepository(db: DbClient): StudioReferenceAssetRepository {
  return {
    async shotExists(shotId) {
      const shot = await db.query.shots.findFirst({
        columns: { id: true },
        where: (table, { eq }) => eq(table.id, shotId),
      });
      return shot !== undefined;
    },
    async createReferenceAsset(input) {
      await db.transaction(async (transaction) => {
        const shot = await transaction.query.shots.findFirst({
          columns: { id: true },
          where: (table, { eq }) => eq(table.id, input.shotId),
        });
        if (shot === undefined) {
          throw new Error("Shot no longer exists");
        }

        const latestReference = await transaction.query.shotReferenceAssets.findFirst({
          columns: { sequence: true },
          where: (table, { eq }) => eq(table.shotId, input.shotId),
          orderBy: (table, { desc }) => desc(table.sequence),
        });
        const sequence = (latestReference?.sequence ?? 0) + 1;

        await transaction.insert(assets).values({
          id: input.assetId,
          kind: input.kind,
          storageKey: input.storageKey,
          sha256: input.sha256,
          contentType: input.contentType,
          byteSize: input.byteSize,
        });
        await transaction.insert(shotReferenceAssets).values({
          shotId: input.shotId,
          assetId: input.assetId,
          sequence,
          note: input.label,
          role: input.role,
          // Temporary, centralized development identity until application auth is introduced.
          attachedBy: "studio-development-user",
        });
      });
    },
  };
}

function isMultipartUploadFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string"
    && typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && typeof value.arrayBuffer === "function";
}

export async function parseStudioReferenceAssetMultipartRequest(
  shotId: string,
  formData: FormData,
): Promise<StudioReferenceAssetUploadInput> {
  const files = formData.getAll("file");
  const entry = files[0];
  if (files.length !== 1 || entry === undefined || !isMultipartUploadFile(entry)) {
    throw new StudioAssetUploadError("STUDIO_ASSET_INVALID", 400, "Provide exactly one file field.");
  }

  const file = entry;
  const parsedRole = providerReferenceRoleSchema.safeParse(formData.get("role"));
  if (!parsedRole.success) {
    throw new StudioAssetUploadError("STUDIO_ASSET_INVALID", 400, "Choose a valid reference asset role.");
  }
  if (file.size > maximumStudioReferenceAssetBytes) {
    throw new StudioAssetUploadError("STUDIO_ASSET_INVALID", 400, "Upload one non-empty image or video no larger than 25 MB.");
  }

  return {
    shotId,
    fileName: file.name,
    contentType: file.type,
    content: new Uint8Array(await file.arrayBuffer()),
    role: parsedRole.data,
  };
}
