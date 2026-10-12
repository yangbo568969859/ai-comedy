import { createDatabaseConnection } from "@ai-manju/db";
import { AliyunOssStorage, parseAliyunOssConfig } from "@ai-manju/storage";
import { NextResponse } from "next/server";

import {
  createPostgresStudioReferenceAssetRepository,
  parseStudioReferenceAssetMultipartRequest,
  StudioAssetUploadError,
  uploadStudioReferenceAsset,
} from "../../../../../../server/studio-asset-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableResponse() {
  return NextResponse.json(
    { error: { code: "STUDIO_UPLOAD_UNAVAILABLE", message: "Studio asset upload is not configured." } },
    { status: 503 },
  );
}

export async function POST(request: Request, context: { params: Promise<{ shotId: string }> }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return unavailableResponse();
  }

  let storage: AliyunOssStorage;
  try {
    storage = new AliyunOssStorage(parseAliyunOssConfig(process.env));
  } catch {
    return unavailableResponse();
  }

  const { shotId } = await context.params;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "STUDIO_ASSET_INVALID", message: "Provide one valid multipart file upload." } },
      { status: 400 },
    );
  }

  const connection = createDatabaseConnection(databaseUrl);
  try {
    const input = await parseStudioReferenceAssetMultipartRequest(shotId, formData);
    const response = await uploadStudioReferenceAsset(input, {
      storage,
      repository: createPostgresStudioReferenceAssetRepository(connection.db),
    });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof StudioAssetUploadError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json(
      { error: { code: "STUDIO_ASSET_REQUEST_FAILED", message: "The asset request could not be completed." } },
      { status: 500 },
    );
  } finally {
    await connection.close();
  }
}
