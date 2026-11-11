import Fastify from "fastify";
import { openDatabase, closeDatabase } from "./database/connection.js";
import { runMigrations } from "./database/migrate.js";
// import { registerOnboardingRoutes } from "./modules/onboarding/routes.ts";
import { registerOnboardingRoutes } from "./modules/onboarding/routes.js";
import { registerAuthenticationRoutes } from "./modules/authentication/routes.js";

const server = Fastify({
  logger: true,
});

// Initialize the database before accepting requests.
const database = openDatabase();

runMigrations(database);

registerOnboardingRoutes(server, database);
registerAuthenticationRoutes(server, database);

server.get("/health", async () => {
  const result = database
    .prepare(
      `
    SELECT MAX(version) AS version
    FROM schema_migrations
  `,
    )
    .get() as { version: number | null };

  const businessCount = database
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM businesses
  `,
    )
    .get() as { count: number };

  return {
    status: "online",
    application: "Retaily",
    service: "Local Store Server",
    database: "connected",
    schemaVersion: result.version ?? 0,
    onboardingRequired: businessCount.count === 0,
    timestamp: new Date().toISOString(),
  };
});

const start = async () => {
  try {
    await server.listen({
      port: 4317,
      host: "127.0.0.1",
    });

    console.log("Retaily server running on port 4317.");
  } catch (error) {
    server.log.error(error);
    closeDatabase();
    process.exit(1);
  }
};

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;

  shuttingDown = true;

  try {
    await server.close();
    closeDatabase();
    process.exit(0);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
