import { initialMigration } from "./001_initial.js";
import { identityMigration } from "./002_identity_access.js";
import { productsInventoryMigration } from "./003_products_inventory.js";
import { inventoryTransfersMigration } from "./004_inventory_transfers.js";
import { employeeAccountStatusMigration } from "./005_employee_account_status.js";

export const migrations = [
  initialMigration,
  identityMigration,
  productsInventoryMigration,
  inventoryTransfersMigration,
  employeeAccountStatusMigration,
];
