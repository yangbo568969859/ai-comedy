import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  assets,
  episodes,
  series,
  shotReferenceAssets,
  shots,
} from "./schema.js";
import type { DatabaseConnection } from "./client.js";

type DbClient = DatabaseConnection["db"];

export interface StudioProjectDatabaseRecord {
  id: string;
  title: string;
  logline: string | null;
  episodes: Array<{
    id: string;
    sequence: number;
    title: string;
    synopsis: string | null;
    shots: Array<{
      id: string;
      sequence: number;
      title: string;
      script: string;
      visualPrompt: string | null;
      durationSec: number;
      referenceAssets: Array<{
        id: string;
        kind: "image" | "video" | "audio" | "subtitle" | "document";
        contentType: string;
        byteSize: bigint;
        role: "character_anchor" | "scene_anchor" | "style_reference" | "first_frame" | "last_frame" | "prop_anchor";
        note: string | null;
        sequence: number;
      }>;
    }>;
  }>;
}

/** Reads storage metadata only; public DTO shaping belongs to the app boundary. */
export async function findNewestStudioProject(
  db: DbClient,
): Promise<StudioProjectDatabaseRecord | null> {
  const newestSeries = await db
    .select({ id: series.id, title: series.title, logline: series.logline })
    .from(series)
    .orderBy(desc(series.createdAt), desc(series.id))
    .limit(1);

  const project = newestSeries[0];
  if (project === undefined) {
    return null;
  }

  const episodeRows = await db
    .select({
      id: episodes.id,
      sequence: episodes.sequence,
      title: episodes.title,
      synopsis: episodes.synopsis,
    })
    .from(episodes)
    .where(eq(episodes.seriesId, project.id))
    .orderBy(asc(episodes.sequence), asc(episodes.id));

  const episodeIds = episodeRows.map((episode) => episode.id);
  const shotRows = episodeIds.length === 0
    ? []
    : await db
      .select({
        id: shots.id,
        episodeId: shots.episodeId,
        sequence: shots.sequence,
        title: shots.title,
        script: shots.script,
        visualPrompt: shots.visualPrompt,
        durationSec: shots.durationSec,
      })
      .from(shots)
      .where(inArray(shots.episodeId, episodeIds))
      .orderBy(asc(shots.sequence), asc(shots.id));

  const shotIds = shotRows.map((shot) => shot.id);
  const referenceRows = shotIds.length === 0
    ? []
    : await db
      .select({
        shotId: shotReferenceAssets.shotId,
        assetId: assets.id,
        kind: assets.kind,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        role: shotReferenceAssets.role,
        note: shotReferenceAssets.note,
        sequence: shotReferenceAssets.sequence,
      })
      .from(shotReferenceAssets)
      .innerJoin(assets, eq(shotReferenceAssets.assetId, assets.id))
      .where(and(inArray(shotReferenceAssets.shotId, shotIds)))
      .orderBy(asc(shotReferenceAssets.sequence), asc(assets.id));

  const assetsByShot = new Map<string, StudioProjectDatabaseRecord["episodes"][number]["shots"][number]["referenceAssets"]>();
  for (const reference of referenceRows) {
    const current = assetsByShot.get(reference.shotId) ?? [];
    current.push({
      id: reference.assetId,
      kind: reference.kind,
      contentType: reference.contentType,
      byteSize: reference.byteSize,
      role: reference.role,
      note: reference.note,
      sequence: reference.sequence,
    });
    assetsByShot.set(reference.shotId, current);
  }

  const shotsByEpisode = new Map<string, StudioProjectDatabaseRecord["episodes"][number]["shots"]>();
  for (const shot of shotRows) {
    const current = shotsByEpisode.get(shot.episodeId) ?? [];
    current.push({
      id: shot.id,
      sequence: shot.sequence,
      title: shot.title,
      script: shot.script,
      visualPrompt: shot.visualPrompt,
      durationSec: shot.durationSec,
      referenceAssets: assetsByShot.get(shot.id) ?? [],
    });
    shotsByEpisode.set(shot.episodeId, current);
  }

  return {
    id: project.id,
    title: project.title,
    logline: project.logline,
    episodes: episodeRows.map((episode) => ({
      id: episode.id,
      sequence: episode.sequence,
      title: episode.title,
      synopsis: episode.synopsis,
      shots: shotsByEpisode.get(episode.id) ?? [],
    })),
  };
}
