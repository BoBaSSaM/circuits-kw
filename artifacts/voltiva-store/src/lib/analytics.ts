type AnalyticsData = Record<string, string | number | boolean>;

const CHECKOUT_SAVE_ERROR_CATEGORIES = [
  'invalid_order',
  'catalog_item_unavailable',
  'invalid_catalog_price',
  'order_number_conflict',
  'order_storage_unavailable',
] as const;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never interfere with the storefront.
  }
}

export function trackCheckoutSaveFailure(
  errorCode: unknown,
  lineCount: number,
  subtotalKwd: number,
): void {
  const errorCategory =
    typeof errorCode === 'string' &&
    CHECKOUT_SAVE_ERROR_CATEGORIES.some((category) => category === errorCode)
      ? errorCode
      : 'other';

  trackEvent('demo_order_save_failed', {
    error_category: errorCategory,
    line_count: Number.isSafeInteger(lineCount) ? Math.max(0, lineCount) : 0,
    subtotal_kwd: Number.isFinite(subtotalKwd)
      ? Math.max(0, Number(subtotalKwd.toFixed(3)))
      : 0,
  });
}
