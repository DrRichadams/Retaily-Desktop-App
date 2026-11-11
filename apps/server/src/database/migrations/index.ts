import { initialMigration } from "./001_initial.js";
import { identityMigration } from "./002_identity_access.js";

export const migrations = [initialMigration, identityMigration];
