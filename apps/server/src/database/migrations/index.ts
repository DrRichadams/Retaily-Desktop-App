import { initialMigration } from "./001_initial.js";
import { identityMigration } from "./002_identity_access.js";
import { productsInventoryMigration } from "./003_products_inventory.js";
import { inventoryTransfersMigration } from "./004_inventory_transfers.js";
import { employeeAccountStatusMigration } from "./005_employee_account_status.js";
import { customersMigration } from "./006_customers.js";
import { salesTransactionsMigration } from "./007_sales_transactions.js";
import { supervisorSalesPermissionsMigration } from "./008_supervisor_sales_permissions.js";
import { salesIdempotencyMigration } from "./009_sales_idempotency.js";
import { checkoutAttemptsMigration } from "./010_checkout_attempts.js";

export const migrations = [
  initialMigration,
  identityMigration,
  productsInventoryMigration,
  inventoryTransfersMigration,
  employeeAccountStatusMigration,
  customersMigration,
  salesTransactionsMigration,
  supervisorSalesPermissionsMigration,
  salesIdempotencyMigration,
  checkoutAttemptsMigration,
];
