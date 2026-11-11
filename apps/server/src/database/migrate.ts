import type Database from "better-sqlite3";
import { migrations } from "./migrations/index.js";

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
    );
  `);

  const getAppliedMigrations = db.prepare(
    "SELECT version FROM schema_migrations",
  );

  const recordMigration = db.prepare(`
    INSERT INTO schema_migrations (version, name)
    VALUES (?, ?)
  `);

  const applied = new Set(
    (getAppliedMigrations.all() as Array<{ version: number }>).map(
      (migration) => migration.version,
    ),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    const apply = db.transaction(() => {
      migration.up(db);

      recordMigration.run(migration.version, migration.name);
    });

    apply();

    console.log(`Database migration applied: ${migration.name}`);
  }

  console.log("Database migrations are up to date.");
}
