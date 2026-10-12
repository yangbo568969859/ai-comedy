import { createDatabaseConnection } from "@ai-manju/db";
import { NextResponse } from "next/server";

import { requestStudioEpisodeExport, readStudioEpisodeExportStatus, StudioEpisodeExportError } from "../../../../../../server/studio-episode-export";
import { createStudioEpisodeExportRuntime } from "../../../../../../server/studio-episode-export-runtime";
import { resolveRedisUrl } from "../../../../../../server/studio-generation-runtime";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: { code: "EPISODE_EXPORT_UNAVAILABLE", message: "Rough-cut export is not configured." } }, { status: 503 });
}

export async function GET(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) return unavailable();
  const { episodeId } = await context.params;
  const database = createDatabaseConnection(databaseUrl);
  try {
    return NextResponse.json({ status: await readStudioEpisodeExportStatus(database.db, episodeId) });
  } finally {
    await database.close();
  }
}

export async function POST(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = resolveRedisUrl(process.env);
  if (databaseUrl === undefined || databaseUrl.length === 0 || redisUrl === undefined) return unavailable();
  const { episodeId } = await context.params;
  const database = createDatabaseConnection(databaseUrl);
  const runtime = createStudioEpisodeExportRuntime(redisUrl);
  try {
    const requestedBy = process.env.STUDIO_REVIEWER_ID?.trim() || "local-studio-reviewer";
    const request = await requestStudioEpisodeExport({ episodeId, requestedBy }, { db: database.db, enqueue: runtime.enqueue });
    return NextResponse.json({ exportId: request.exportId }, { status: 202 });
  } catch (error) {
    if (error instanceof StudioEpisodeExportError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: "EPISODE_EXPORT_REQUEST_FAILED", message: "The rough-cut request could not be submitted." } }, { status: 500 });
  } finally {
    await runtime.close();
    await database.close();
  }
}
