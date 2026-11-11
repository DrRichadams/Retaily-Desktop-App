import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const defaultDataDirectory = resolve(
  currentDirectory,
  "../../../../.retaily-data",
);

const dataDirectory = process.env.RETAILY_DATA_DIR || defaultDataDirectory;

const databasePath = resolve(dataDirectory, "retaily.sqlite");

let database: Database.Database | null = null;

export function openDatabase() {
  if (database) {
    return database;
  }

  mkdirSync(dataDirectory, {
    recursive: true,
  });

  database = new Database(databasePath);

  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("synchronous = NORMAL");

  console.log("Retaily database connected.");

  return database;
}

export function closeDatabase() {
  if (!database) {
    return;
  }

  database.close();
  database = null;

  console.log("Retaily database connection closed.");
}
