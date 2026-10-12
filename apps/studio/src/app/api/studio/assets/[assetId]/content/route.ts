import { createDatabaseConnection, findPrivatePreviewAsset } from "@ai-manju/db";
import { AliyunOssStorage, parseAliyunOssConfig } from "@ai-manju/storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) return NextResponse.json({ error: { code: "MEDIA_UNAVAILABLE" } }, { status: 503 });
  const database = createDatabaseConnection(databaseUrl);
  try {
    const { assetId } = await context.params;
    const asset = await findPrivatePreviewAsset(database.db, assetId);
    if (asset === null) return NextResponse.json({ error: { code: "MEDIA_NOT_FOUND" } }, { status: 404 });
    const storage = new AliyunOssStorage(parseAliyunOssConfig(process.env));
    const signed = await storage.signGetUrl({ key: asset.storageKey, expiresInSeconds: 300 });
    const range = request.headers.get("range");
    const upstream = await fetch(signed.url, { ...(range === null ? {} : { headers: { Range: range } }), cache: "no-store" });
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: { code: "MEDIA_FETCH_FAILED" } }, { status: 502 });
    const headers = new Headers({
      "Content-Type": asset.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } finally {
    await database.close();
  }
}
