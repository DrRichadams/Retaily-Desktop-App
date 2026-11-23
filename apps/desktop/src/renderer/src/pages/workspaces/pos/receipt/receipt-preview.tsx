import { Fragment, useState } from "react";

import { formatReceiptDate, formatReceiptMoney, formatReceiptPaymentMethod, formatReceiptQuantity } from "./receipt-formatting";
import type { ReceiptViewModel } from "./receipt-mapper";
import styles from "./receipt-preview.module.scss";

interface ReceiptPreviewProps {
  receipt: ReceiptViewModel;
}

function BreakableIdentifier({ value }: { value: string }) {
  return (
    <>
      {value.split(/([/-])/).map((part, index) => (
        <Fragment key={index}>{part}{/^[/-]$/.test(part) && <wbr />}</Fragment>
      ))}
    </>
  );
}

export default function ReceiptPreview({ receipt }: ReceiptPreviewProps) {
  const [width, setWidth] = useState<"58mm" | "80mm">("80mm");

  return (
    <div className={styles.preview}>
      <div className={styles.toolbar}>
        <label htmlFor="receipt-preview-width">Preview width</label>
        <select
          id="receipt-preview-width"
          value={width}
          onChange={(event) => setWidth(event.target.value as "58mm" | "80mm")}
        >
          <option value="58mm">58mm</option>
          <option value="80mm">80mm</option>
        </select>
      </div>

      <div
        className={styles.stage}
        role="region"
        aria-label="Scrollable receipt preview"
        tabIndex={0}
      >
        <article
          className={`${styles.paper} ${width === "58mm" ? styles.paper58 : styles.paper80}`}
          aria-label={`Receipt ${receipt.receiptNumber} preview`}
        >
          <header className={styles.business}>
            <h2>{receipt.businessName}</h2>
            <p>{receipt.branchName}</p>
          </header>

          <section className={styles.metadata} aria-label="Transaction details">
            <div><span>Receipt</span><strong className={styles.identifier}><BreakableIdentifier value={receipt.receiptNumber} /></strong></div>
            <div><span>Sale</span><strong className={styles.identifier}><BreakableIdentifier value={receipt.saleNumber} /></strong></div>
            <div><span>Date</span><strong>{formatReceiptDate(receipt.completedAt)}</strong></div>
            <div><span>Cashier</span><strong>{receipt.cashierName}</strong></div>
          </section>

          <section className={styles.items} aria-label="Purchased items">
            <div className={styles.columnHead}><span>Item</span><span>Total</span></div>
            {receipt.items.map((item, index) => (
              <div className={styles.item} key={`${item.productName}-${index}`}>
                <div className={styles.itemTitle}>
                  <strong>{item.productName}</strong>
                  {item.sku && <small>SKU {item.sku}</small>}
                </div>
                <div className={styles.itemDetail}>
                  <span className={styles.itemMeasure}>
                    <span className={styles.quantity}>{formatReceiptQuantity(item.quantity)}</span>
                    <span>{item.unit}</span>
                    <span>×</span>
                    <span className={styles.money}>{formatReceiptMoney(item.unitPriceMinor, receipt.currency)}</span>
                  </span>
                  <strong className={styles.money}>{formatReceiptMoney(item.lineTotalMinor, receipt.currency)}</strong>
                </div>
                {item.discountAmountMinor > 0 && (
                  <small className={styles.discount}>Item discount <span className={styles.money}>{formatReceiptMoney(item.discountAmountMinor, receipt.currency)}</span></small>
                )}
              </div>
            ))}
          </section>

          <section className={styles.totals} aria-label="Sale totals">
            <div><span>Subtotal</span><strong className={styles.money}>{formatReceiptMoney(receipt.subtotalMinor, receipt.currency)}</strong></div>
            {receipt.overallDiscountMinor > 0 && (
              <div><span>Overall discount</span><strong className={styles.money}>−{formatReceiptMoney(receipt.overallDiscountMinor, receipt.currency)}</strong></div>
            )}
            <div className={styles.total}><span>Total payable</span><strong className={styles.money}>{formatReceiptMoney(receipt.totalMinor, receipt.currency)}</strong></div>
            <div><span>Amount paid</span><strong className={styles.money}>{formatReceiptMoney(receipt.amountPaidMinor, receipt.currency)}</strong></div>
            <div><span>Change due</span><strong className={styles.money}>{formatReceiptMoney(receipt.changeMinor, receipt.currency)}</strong></div>
          </section>

          <section className={styles.payments} aria-label="Payment information">
            <h3>Payment</h3>
            {receipt.payments.map((payment, index) => (
              <div className={styles.payment} key={`${payment.method}-${index}`}>
                <div>
                  <span>{formatReceiptPaymentMethod(payment.method)}</span>
                  {payment.reference && <small className={styles.reference}>Ref <BreakableIdentifier value={payment.reference} /></small>}
                </div>
                <strong className={styles.money}>{formatReceiptMoney(payment.amountMinor, receipt.currency)}</strong>
              </div>
            ))}
          </section>

          <footer className={styles.thanks}>Thank you for shopping with us.</footer>
        </article>
      </div>
    </div>
  );
}
