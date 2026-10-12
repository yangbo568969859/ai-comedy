import { createDatabaseConnection } from "@ai-manju/db";
import { NextResponse } from "next/server";

import { readNewestStudioProject } from "../../../../server/studio-project";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return NextResponse.json(
      { error: { code: "STUDIO_DATABASE_UNAVAILABLE", message: "Studio data is not configured." } },
      { status: 503 },
    );
  }

  const connection = createDatabaseConnection(databaseUrl);
  try {
    return NextResponse.json(await readNewestStudioProject(connection.db));
  } finally {
    await connection.close();
  }
}
