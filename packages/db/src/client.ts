import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type DatabaseConnection = ReturnType<typeof createDatabaseConnection>;

/**
 * Creates a database boundary from an explicit URL. Environment access stays
 * with the application that owns configuration, never in this package.
 */
export function createDatabaseConnection(databaseUrl: string) {
  if (databaseUrl.length === 0) {
    throw new Error("DATABASE_URL must be provided explicitly.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  return {
    db,
    close: () => pool.end(),
  };
}
