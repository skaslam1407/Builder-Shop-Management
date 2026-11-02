import type { CurrencyCode, LanguageCode } from "@/lib/types";

let activeLanguage: LanguageCode = "en";
let activeCurrency: CurrencyCode = "INR";
let currencyFormatter = createCurrencyFormatter("en-IN", "INR");
let numberFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

function localeFor(language: LanguageCode): string {
  return language === "bn" ? "bn-IN" : "en-IN";
}

function createCurrencyFormatter(locale: string, currency: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

export function configureMoney(language: LanguageCode, currencyCode: CurrencyCode): void {
  if (language === activeLanguage && currencyCode === activeCurrency) return;
  activeLanguage = language;
  activeCurrency = currencyCode;
  const locale = localeFor(language);
  currencyFormatter = createCurrencyFormatter(locale, currencyCode);
  numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
}

export function activeLocale(): string {
  return localeFor(activeLanguage);
}

export function formatPaise(minor: number): string {
  return currencyFormatter.format((minor || 0) / 100);
}

export function rupeesToPaise(value: number | string): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(value || "0");
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function paiseToRupees(minor: number): number {
  return (minor || 0) / 100;
}

export function formatQuantityMilli(milli: number): string {
  if (!milli) return "0";
  return numberFormatter.format(milli / 1000);
}

export function formatTaxBps(bps: number): string {
  return `${numberFormatter.format(bps / 100)}%`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
