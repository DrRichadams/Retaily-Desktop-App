import { currencyFractionDigits, formatMinor } from "../checkout-calculations";

export class ReceiptFormattingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptFormattingError";
  }
}

export function formatReceiptMoney(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new ReceiptFormattingError("A receipt amount is invalid.");
  }
  if (currencyFractionDigits(currency) === null) {
    throw new ReceiptFormattingError("The receipt currency is invalid.");
  }
  const formatted = formatMinor(amountMinor, currency);
  if (formatted === "Invalid currency") {
    throw new ReceiptFormattingError("The receipt currency is invalid.");
  }
  return formatted;
}

export function formatReceiptQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new ReceiptFormattingError("A receipt quantity is invalid.");
  }

  const representation = quantity.toString();
  const decimal = representation.includes("e") || representation.includes("E")
    ? expandExponent(representation)
    : representation;
  // Extremely small IEEE-754 values have hundreds of leading zeroes; scientific notation is
  // clearer for those values, while ordinary fractional quantities stay in decimal notation.
  if (decimal.length > 32) return representation;

  const [wholeDigits, fractionDigits] = decimal.split(".");
  const integerFormatter = new Intl.NumberFormat(undefined, {
    useGrouping: true,
    maximumFractionDigits: 0,
  });
  const whole = integerFormatter.format(BigInt(wholeDigits));
  if (fractionDigits === undefined) return whole;

  const decimalSeparator = new Intl.NumberFormat(undefined)
    .formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
  const digitFormatter = new Intl.NumberFormat(undefined, {
    useGrouping: false,
    maximumFractionDigits: 0,
  });
  const localizedDigits = Array.from({ length: 10 }, (_, digit) => digitFormatter.format(digit));
  const fraction = [...fractionDigits]
    .map((digit) => localizedDigits[Number(digit)])
    .join("");

  return `${whole}${decimalSeparator}${fraction}`;
}

function expandExponent(value: string): string {
  const [mantissa, exponentText] = value.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const decimalPosition = mantissa.indexOf(".") < 0
    ? mantissa.length
    : mantissa.indexOf(".");
  const digits = mantissa.replace(".", "");
  const shiftedPosition = decimalPosition + exponent;

  if (shiftedPosition <= 0) {
    return `0.${"0".repeat(-shiftedPosition)}${digits}`;
  }
  if (shiftedPosition >= digits.length) {
    return `${digits}${"0".repeat(shiftedPosition - digits.length)}`;
  }
  return `${digits.slice(0, shiftedPosition)}.${digits.slice(shiftedPosition)}`;
}

export function formatReceiptDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatReceiptPaymentMethod(method: RetailyPaymentMethod): string {
  return method.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
