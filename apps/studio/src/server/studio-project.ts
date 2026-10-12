import {
  findNewestStudioProject,
  type DatabaseConnection,
} from "@ai-manju/db";
import { z } from "zod";

const studioReferenceAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["image", "video", "audio", "subtitle", "document"]),
  label: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.string().regex(/^\d+$/),
  role: z.enum(["character_anchor", "scene_anchor", "style_reference", "first_frame", "last_frame", "prop_anchor"]),
  note: z.string().nullable(),
  sequence: z.number().int().positive(),
}).strict();

const studioShotSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  script: z.string(),
  visualPrompt: z.string().nullable(),
  durationSec: z.number().int().min(1).max(60),
  referenceAssets: z.array(studioReferenceAssetSchema),
});

const studioEpisodeSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  synopsis: z.string().nullable(),
  shots: z.array(studioShotSchema),
});

export const studioProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  logline: z.string().nullable(),
  episodes: z.array(studioEpisodeSchema),
});

export const studioProjectResponseSchema = z.object({
  project: studioProjectSchema.nullable(),
});

export type StudioProjectResponse = z.infer<typeof studioProjectResponseSchema>;

type DbClient = DatabaseConnection["db"];

/**
 * Reads the newest production plan and projects it into the only shape the
 * Studio client may receive. Private object keys stay inside the server.
 */
export async function readNewestStudioProject(db: DbClient): Promise<StudioProjectResponse> {
  const project = await findNewestStudioProject(db);
  if (project === null) {
    return studioProjectResponseSchema.parse({ project: null });
  }

  return studioProjectResponseSchema.parse({
    project: {
      id: project.id,
      title: project.title,
      logline: project.logline,
      episodes: project.episodes.map((episode) => ({
        id: episode.id,
        sequence: episode.sequence,
        title: episode.title,
        synopsis: episode.synopsis,
        shots: episode.shots.map((shot) => ({
          ...shot,
          referenceAssets: shot.referenceAssets.map((asset) => ({
            ...asset,
            label: asset.note ?? `${asset.kind} reference`,
            byteSize: asset.byteSize.toString(),
          })),
        })),
      })),
    },
  });
}
