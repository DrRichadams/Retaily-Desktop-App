import { Check, Plus, Receipt } from "lucide-react";
import { useState } from "react";

import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { formatMinor } from "./checkout-calculations";
import ReceiptPreview from "./receipt/receipt-preview";
import { mapSaleToReceipt, type ReceiptViewModel } from "./receipt/receipt-mapper";
import styles from "./sale-confirmation.module.scss";

interface SaleConfirmationProps {
  sale: RetailySaleResponse;
  businessName: string;
  branchName: string;
  cashier: string;
  onNewSale: () => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SaleConfirmation({ sale, businessName, branchName, cashier, onNewSale }: SaleConfirmationProps) {
  const [showReceipt, setShowReceipt] = useState(false);
  const grossSubtotal = sale.items.reduce((total, item) => total + item.lineSubtotalMinor, 0);
  const itemDiscount = sale.items.reduce((total, item) => total + item.discountAmountMinor, 0);
  let receipt: ReceiptViewModel | null = null;
  let receiptError = "";
  if (showReceipt) {
    try {
      receipt = mapSaleToReceipt(sale, { businessName, branchName, cashierName: cashier });
    } catch (error) {
      receiptError = error instanceof Error
        ? error.message
        : "This receipt could not be displayed safely.";
    }
  }

  return (
    <Modal
      isOpen
      onClose={() => undefined}
      title={showReceipt ? "Receipt preview" : "Sale completed"}
      description={showReceipt ? "Preview only. No receipt has been printed." : "The server confirmed this sale."}
      size="large"
      closeOnOverlayClick={false}
      showCloseButton={false}
      footer={(
        <div className={styles.footer}>
          {showReceipt && <Button variant="outline" onClick={() => setShowReceipt(false)}>Back to sale confirmation</Button>}
          {!showReceipt && <Button variant="outline" onClick={() => setShowReceipt(true)} leftIcon={<Receipt size={16} />}>View Receipt</Button>}
          <Button onClick={onNewSale} leftIcon={<Plus size={16} />}>Start a new sale</Button>
        </div>
      )}
    >
      {showReceipt ? (
        receipt ? <ReceiptPreview receipt={receipt} /> : <div className={styles.receiptError} role="alert">{receiptError}</div>
      ) : <>
        <div className={styles.confirmed}>
          <span className={styles.check}><Check size={22} /></span>
          <div><strong>{sale.saleNumber}</strong><span>Receipt {sale.receiptNumber}</span></div>
        </div>
        <div className={styles.meta}>
        <div><span>Branch</span><strong>{branchName}</strong></div>
        <div><span>Cashier</span><strong>{cashier}</strong></div>
        <div><span>Completed</span><strong>{formatDate(sale.completedAt)}</strong></div>
        </div>
        <div className={styles.sectionTitle}><h3>Items</h3><span>{sale.items.length} lines</span></div>
        <div className={styles.items}>
        {sale.items.map((item) => (
          <div className={styles.item} key={item.id}>
            <div><strong>{item.productName}</strong><span>{item.quantity} {item.productUnit} × {formatMinor(item.unitPriceMinor, sale.currency)}</span>
              {item.discountAmountMinor > 0 && <small>Item discount −{formatMinor(item.discountAmountMinor, sale.currency)}</small>}
            </div>
            <b>{formatMinor(item.lineTotalMinor, sale.currency)}</b>
          </div>
        ))}
        </div>
        <div className={styles.paymentList}>
        <h3>Payments</h3>
        {sale.payments.map((payment) => (
          <div key={payment.id}><span>{payment.paymentMethod.replaceAll("_", " ")}</span><strong>{formatMinor(payment.amountMinor, sale.currency)}</strong></div>
        ))}
        </div>
        <div className={styles.totals}>
        <div><span>Subtotal</span><strong>{formatMinor(grossSubtotal, sale.currency)}</strong></div>
        {itemDiscount > 0 && <div><span>Item discounts</span><strong>−{formatMinor(itemDiscount, sale.currency)}</strong></div>}
        <div><span>Overall discount</span><strong>−{formatMinor(sale.discountAmountMinor, sale.currency)}</strong></div>
        <div className={styles.grandTotal}><span>Total</span><strong>{formatMinor(sale.totalMinor, sale.currency)}</strong></div>
        <div><span>Amount paid</span><strong>{formatMinor(sale.amountPaidMinor, sale.currency)}</strong></div>
        <div><span>Change due</span><strong>{formatMinor(sale.changeMinor, sale.currency)}</strong></div>
        </div>
      </>}
    </Modal>
  );
}
