import { z } from "zod";

export const contractVersion = "v1" as const;

export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest");
export const isoUtcSchema = z.string().datetime({ offset: true });
export const moneyMinorUnitsSchema = z.number().int().nonnegative();

export const runIdSchema = z.string().uuid();
export const assetIdSchema = z.string().uuid();
export const seriesIdSchema = z.string().uuid();
export const episodeIdSchema = z.string().uuid();
export const shotIdSchema = z.string().uuid();
export const providerJobIdSchema = z.string().min(1).max(256);
