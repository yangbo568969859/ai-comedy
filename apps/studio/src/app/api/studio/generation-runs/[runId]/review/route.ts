import { createDatabaseConnection } from "@ai-manju/db";
import { NextResponse } from "next/server";

import {
  recordStudioReview,
  readLatestStudioReview,
  StudioReviewError,
  studioReviewSubmitSchema,
} from "../../../../../../server/studio-review";

export const dynamic = "force-dynamic";

function databaseUnavailable() {
  return NextResponse.json({ error: { code: "STUDIO_DATABASE_UNAVAILABLE", message: "Studio data is not configured." } }, { status: 503 });
}

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) return databaseUnavailable();
  const assetId = new URL(request.url).searchParams.get("assetId");
  if (assetId === null) return NextResponse.json({ error: { code: "REVIEW_ASSET_REQUIRED", message: "assetId is required." } }, { status: 400 });
  const { runId } = await context.params;
  const connection = createDatabaseConnection(databaseUrl);
  try {
    return NextResponse.json({ review: await readLatestStudioReview(connection.db, runId, assetId) });
  } catch (error) {
    if (error instanceof StudioReviewError) return NextResponse.json({ error: { code: "REVIEW_OUTPUT_UNAVAILABLE", message: error.message } }, { status: error.status });
    throw error;
  } finally {
    await connection.close();
  }
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) return databaseUnavailable();
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = studioReviewSubmitSchema.safeParse(body);
  const assetId = new URL(request.url).searchParams.get("assetId");
  if (!parsed.success || assetId === null) return NextResponse.json({ error: { code: "REVIEW_REQUEST_INVALID", message: "A valid output asset and all three review decisions are required." } }, { status: 400 });
  const { runId } = await context.params;
  const connection = createDatabaseConnection(databaseUrl);
  try {
    const reviewerId = process.env.STUDIO_REVIEWER_ID?.trim() || "local-studio-reviewer";
    return NextResponse.json({ review: await recordStudioReview({ runId, assetId, decision: parsed.data }, { db: connection.db, reviewerId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof StudioReviewError) return NextResponse.json({ error: { code: "REVIEW_OUTPUT_UNAVAILABLE", message: error.message } }, { status: error.status });
    throw error;
  } finally {
    await connection.close();
  }
}
