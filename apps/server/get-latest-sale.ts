import Database from "better-sqlite3";

const db = new Database(".retaily-data/retaily.sqlite", {
  readonly: true,
});

try {
  const sale = db
    .prepare(
      `
      SELECT
        id,
        sale_number,
        receipt_number,
        total_minor,
        created_at
      FROM sales
      WHERE sale_number = ?
    `,
    )
    .get("SAL-20261118195109-0F5BD2") as
    | {
        id: string;
        sale_number: string;
        receipt_number: string;
        total_minor: number;
        created_at: string;
      }
    | undefined;

  if (!sale) {
    console.log("Sale not found.");
  } else {
    console.log("\nSALE DETAILS:\n");
    console.table([sale]);

    const validUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sale.id,
      );

    console.log("Valid UUID:", validUUID);
    console.log("\nCopy this Sale ID:", sale.id);
  }
} finally {
  db.close();
}
