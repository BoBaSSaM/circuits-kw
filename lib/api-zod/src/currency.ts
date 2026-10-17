export const USD_PER_KWD = 3.3;

export type MoneyCurrency = "KWD" | "USD";

export function currencyMinorUnitScale(currency: MoneyCurrency): number {
  return currency === "KWD" ? 1_000 : 100;
}

export function roundMoneyAmount(amount: number, currency: MoneyCurrency): number {
  const scale = currencyMinorUnitScale(currency);
  const scaledAmount = amount * scale;
  const roundingTolerance = Number.EPSILON * Math.max(1, Math.abs(scaledAmount));
  return Math.round(scaledAmount + roundingTolerance) / scale;
}

export function convertKwdToCurrency(amountKwd: number, currency: MoneyCurrency): number {
  return roundMoneyAmount(currency === "USD" ? amountKwd * USD_PER_KWD : amountKwd, currency);
}

export function convertUsdToKwd(amountUsd: number): number {
  return roundMoneyAmount(amountUsd / USD_PER_KWD, "KWD");
}

export function toStripeMinorUnits(amount: number, currency: MoneyCurrency): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`A positive ${currency} amount is required.`);
  }
  const scale = currencyMinorUnitScale(currency);
  const minorUnits = Math.round((amount + Number.EPSILON) * scale);
  if (minorUnits < 1 || Math.abs(amount - minorUnits / scale) > 1e-7) {
    throw new Error(`${currency} prices use no more than ${currency === "KWD" ? 3 : 2} decimal places.`);
  }
  return minorUnits;
}

export function formatMoney(amount: number, currency: MoneyCurrency): string {
  return `${Number(amount || 0).toFixed(currency === "KWD" ? 3 : 2)} ${currency}`;
}
