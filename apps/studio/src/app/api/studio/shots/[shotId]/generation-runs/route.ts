import { createDatabaseConnection } from "@ai-manju/db";
import { NextResponse } from "next/server";

import {
  readLatestStudioGenerationRun,
  studioGenerationSubmitSchema,
  StudioGenerationError,
  submitStudioGenerationRun,
} from "../../../../../../server/studio-generation";
import { createStudioGenerationRuntime, resolveRedisUrl } from "../../../../../../server/studio-generation-runtime";

export const dynamic = "force-dynamic";

function configuration() {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = resolveRedisUrl(process.env);
  const providerModel = process.env.WAN_REFERENCE_MODEL;
  const providerRegion = process.env.WAN_REGION;
  return { databaseUrl, redisUrl, providerModel, providerRegion };
}

export async function GET(_request: Request, context: { params: Promise<{ shotId: string }> }) {
  const { databaseUrl } = configuration();
  if (databaseUrl === undefined) return NextResponse.json({ error: { code: "GENERATION_UNAVAILABLE", message: "Generation storage is not configured." } }, { status: 503 });
  const { shotId } = await context.params;
  const database = createDatabaseConnection(databaseUrl);
  try {
    return NextResponse.json({ run: await readLatestStudioGenerationRun(database.db, shotId) });
  } finally {
    await database.close();
  }
}

export async function POST(request: Request, context: { params: Promise<{ shotId: string }> }) {
  const { databaseUrl, redisUrl, providerModel, providerRegion } = configuration();
  if ([databaseUrl, redisUrl, providerModel, providerRegion].some((value) => value === undefined || value.length === 0)) {
    return NextResponse.json({ error: { code: "GENERATION_UNAVAILABLE", message: "Wan generation is not fully configured." } }, { status: 503 });
  }
  const parsed = studioGenerationSubmitSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "GENERATION_INVALID", message: "Confirm the estimated charge before submitting." } }, { status: 400 });
  const { shotId } = await context.params;
  const database = createDatabaseConnection(databaseUrl!);
  const runtime = createStudioGenerationRuntime(databaseUrl!, redisUrl!);
  try {
    const run = await submitStudioGenerationRun({
      shotId,
      idempotencyKey: parsed.data.idempotencyKey,
      referenceAssetIds: parsed.data.referenceAssetIds,
      providerModel: providerModel!,
      providerRegion: providerRegion!,
    }, { db: database.db, orchestrator: runtime.orchestrator });
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    if (error instanceof StudioGenerationError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "GENERATION_SUBMIT_FAILED", message: "The generation run could not be submitted." } }, { status: 500 });
  } finally {
    await runtime.close();
    await database.close();
  }
}
