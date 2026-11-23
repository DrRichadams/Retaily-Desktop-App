import assert from "node:assert/strict";

import {
  formatReceiptMoney,
  formatReceiptQuantity,
} from "../desktop/src/renderer/src/pages/workspaces/pos/receipt/receipt-formatting.ts";
import {
  mapSaleToReceipt,
  ReceiptMappingError,
} from "../desktop/src/renderer/src/pages/workspaces/pos/receipt/receipt-mapper.ts";

const sale: RetailySaleResponse = {
  id: "9d286efa-9577-43b5-9f85-73c4899232e2",
  businessId: "38f650d4-94d5-43db-860e-486279af63ef",
  branchId: "7cf8f43d-fae2-43f1-acf9-b7abc27dc6ae",
  employeeId: "e65b15bd-ed72-4ddc-b7fc-bfd93024f497",
  customerId: null,
  saleNumber: "SAL-20301112-0007",
  receiptNumber: "RCT-20301112-0007",
  status: "completed",
  currency: "USD",
  // Intentionally not reconstructed from the item data: receipt mapping must preserve server totals.
  subtotalMinor: 4567,
  discountType: "fixed",
  discountValue: 123,
  discountAmountMinor: 123,
  totalMinor: 4444,
  amountPaidMinor: 5000,
  changeMinor: 556,
  notes: null,
  completedAt: "2030-11-12T10:15:00.000Z",
  createdAt: "2030-11-12T10:15:00.000Z",
  items: [
    {
      id: "e831af18-1b38-42d8-bccd-3892d7374a95",
      productId: "0ae830fd-07b0-47a7-aeed-5f193290cbaf",
      productName: "Tea",
      productSku: "TEA-01",
      productUnit: "box",
      quantity: 2,
      unitCostMinor: 100,
      unitPriceMinor: 1000,
      lineSubtotalMinor: 2000,
      discountType: "fixed",
      discountValue: 100,
      discountAmountMinor: 100,
      lineTotalMinor: 1900,
    },
    {
      id: "787d9a3d-899a-4aaa-93aa-84d7040bff53",
      productId: "f51dd8b2-6a92-4e65-897f-a2acbb4d3495",
      productName: "Rice",
      productSku: "RICE-02",
      productUnit: "kg",
      quantity: 1,
      unitCostMinor: 500,
      unitPriceMinor: 2500,
      lineSubtotalMinor: 2500,
      discountType: "none",
      discountValue: 0,
      discountAmountMinor: 0,
      lineTotalMinor: 2500,
    },
  ],
  payments: [
    {
      id: "96d292cc-29c5-46e9-a9ee-39fcd364e800",
      paymentMethod: "cash",
      amountMinor: 3000,
      reference: null,
      notes: null,
      createdAt: "2030-11-12T10:15:00.000Z",
    },
    {
      id: "fd009e3b-5b6a-4130-877d-6ef8d7c5fe84",
      paymentMethod: "ecocash",
      amountMinor: 2000,
      reference: "PAY-184",
      notes: null,
      createdAt: "2030-11-12T10:15:00.000Z",
    },
  ],
};

function main() {
  const receipt = mapSaleToReceipt(sale, {
    businessName: "Retaily Market",
    branchName: "Central",
    cashierName: "A. Cashier",
  });

  assert.equal(receipt.businessName, "Retaily Market");
  assert.equal(receipt.branchName, "Central");
  assert.equal(receipt.cashierName, "A. Cashier");
  assert.equal(receipt.receiptNumber, sale.receiptNumber);
  assert.equal(receipt.saleNumber, sale.saleNumber);
  assert.equal(receipt.items.length, 2);
  assert.equal(receipt.items[0].productName, "Tea");
  assert.equal(receipt.items[0].quantity, 2);
  assert.equal(receipt.items[0].sku, "TEA-01");
  assert.equal(receipt.items[0].discountAmountMinor, 100);
  assert.equal(receipt.items[0].lineTotalMinor, 1900);
  assert.equal(receipt.items[1].productName, "Rice");
  assert.equal(receipt.items[1].discountAmountMinor, 0);
  assert.equal(receipt.overallDiscountMinor, 123);
  assert.equal(receipt.payments.length, 2);
  assert.equal(receipt.payments[1].method, "ecocash");
  assert.equal(receipt.payments[1].reference, "PAY-184");
  assert.equal(receipt.subtotalMinor, 4567);
  assert.equal(receipt.totalMinor, 4444);
  assert.equal(receipt.amountPaidMinor, 5000);
  assert.equal(receipt.changeMinor, 556);
  assert.equal("businessAddress" in receipt, false);
  assert.equal("businessPhone" in receipt, false);

  assert.match(formatReceiptMoney(12345, "USD"), /123\.45/);
  assert.match(formatReceiptMoney(12345, "JPY"), /12,345/);
  assert.doesNotMatch(formatReceiptMoney(12345, "JPY"), /\.\d/);
  assert.match(formatReceiptMoney(12345, "BHD"), /12\.345/);
  assert.equal(formatReceiptQuantity(2), "2");
  assert.equal(formatReceiptQuantity(1.5), "1.5");
  assert.equal(formatReceiptQuantity(1.23456), "1.23456");
  assert.equal(formatReceiptQuantity(1.2345678910123), "1.2345678910123");
  assert.equal(formatReceiptQuantity(1_000_000), new Intl.NumberFormat().format(1_000_000));
  assert.throws(() => formatReceiptQuantity(1_000_001), /quantity is invalid/);
  assert.throws(() => formatReceiptQuantity(Number.MAX_VALUE), /quantity is invalid/);
  assert.equal(formatReceiptQuantity(1e-8), "0.00000001");
  assert.equal(formatReceiptQuantity(1e-100), "1e-100");
  const fractionalSale = {
    ...sale,
    items: [{ ...sale.items[0], quantity: 1.2345678910123 }],
  };
  const fractionalReceipt = mapSaleToReceipt(fractionalSale, {
    businessName: "Retaily Market",
    branchName: "Central",
    cashierName: "A. Cashier",
  });
  assert.equal(fractionalReceipt.items[0].quantity, 1.2345678910123);
  assert.equal(sale.items[0].quantity, 2);
  assert.throws(() => formatReceiptQuantity(-1), /quantity is invalid/);
  assert.throws(() => formatReceiptQuantity(Number.NaN), /quantity is invalid/);
  assert.throws(() => formatReceiptQuantity(Number.POSITIVE_INFINITY), /quantity is invalid/);
  assert.throws(() => formatReceiptQuantity(Number.NEGATIVE_INFINITY), /quantity is invalid/);
  assert.throws(() => formatReceiptQuantity(0), /quantity is invalid/);
  assert.throws(() => formatReceiptQuantity(1_000_000.1), /quantity is invalid/);
  for (const invalidQuantity of [
    1_000_001,
    Number.MAX_VALUE,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    -1,
  ]) {
    const invalidQuantitySale = {
      ...sale,
      items: [{ ...sale.items[0], quantity: invalidQuantity }],
    };
    assert.throws(
      () => mapSaleToReceipt(invalidQuantitySale, {
        businessName: "Retaily Market",
        branchName: "Central",
        cashierName: "A. Cashier",
      }),
      (error: unknown) => error instanceof ReceiptMappingError && /quantity is invalid/.test(error.message),
    );
  }
  assert.throws(
    () => mapSaleToReceipt({ ...sale, currency: "!!!" }, {
      businessName: "Retaily Market",
      branchName: "Central",
      cashierName: "A. Cashier",
    }),
    (error: unknown) => error instanceof ReceiptMappingError && /currency is invalid/.test(error.message),
  );
  assert.throws(() => formatReceiptMoney(100, "!!!"), /currency is invalid/);

  console.log("PASS: receipt mapping and formatting tests");
}

main();
