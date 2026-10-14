export type CartLine = {
  id: string;
  price: number;
  qty: number;
  kind?: string;
  sku?: string;
  priceSource?: 'catalog' | 'supplier-list';
};

export function addCartItem<T extends CartLine>(
  items: readonly T[],
  item: Omit<T, 'qty'> & { qty?: number },
): T[] {
  const requestedQuantity = Number(item.qty);
  const quantity = Number.isFinite(requestedQuantity)
    ? Math.max(1, Math.trunc(requestedQuantity))
    : 1;
  const existing = items.find((line) => line.id === item.id);

  if (existing) {
    return items.map((line) =>
      line.id === item.id ? { ...line, qty: line.qty + quantity } : line,
    );
  }

  return [...items, { ...item, qty: quantity } as T];
}

export function calculateCartSubtotal(items: readonly CartLine[]): number {
  return items.reduce((subtotal, item) => subtotal + item.price * item.qty, 0);
}

export function removeSupplierPricedBomItems<T extends CartLine>(
  items: readonly T[],
  pricesBySku: Readonly<Record<string, number>>,
): T[] {
  const supplierPrices = new Map(
    Object.entries(pricesBySku).map(([sku, price]) => [sku.trim().toLocaleUpperCase('en-US'), price]),
  );

  return items.filter((item) => {
    if (item.kind !== 'bom') return true;
    if (item.priceSource === 'supplier-list') return false;
    if (item.priceSource === 'catalog' || !item.sku) return true;

    // Older saved cart lines predate price-source tracking. Remove them only
    // when both their SKU and copied price match the list being removed.
    const supplierPrice = supplierPrices.get(item.sku.trim().toLocaleUpperCase('en-US'));
    return supplierPrice === undefined || supplierPrice !== item.price;
  });
}
