export type CartLine = {
  id: string;
  price: number;
  qty: number;
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
