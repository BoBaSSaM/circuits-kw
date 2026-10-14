export type CartLine = {
  id: string;
  name?: string;
  price: number;
  qty: number;
  kind?: string;
  sku?: string;
  priceSource?: 'catalog' | 'supplier-list';
  cartAddBaseQty?: number;
  cartAddOperations?: Record<string, number>;
};

let fallbackOperationId = 0;

function createAddOperationId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  fallbackOperationId += 1;
  return `${Date.now()}-${fallbackOperationId}-${Math.random().toString(36).slice(2)}`;
}

function readAddOperations(item: CartLine): { baseQty: number; operations: Record<string, number> } {
  const baseQty = item.cartAddBaseQty;
  const operations = item.cartAddOperations;
  if (!Number.isFinite(baseQty) || (baseQty as number) < 0 || !operations || typeof operations !== 'object') {
    return { baseQty: item.qty, operations: {} };
  }
  const validOperations = Object.fromEntries(
    Object.entries(operations).filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0),
  );
  const total = Object.values(validOperations).reduce((sum, quantity) => sum + quantity, baseQty as number);
  return total === item.qty
    ? { baseQty: baseQty as number, operations: validOperations }
    : { baseQty: item.qty, operations: {} };
}

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
    const { baseQty, operations } = readAddOperations(existing);
    const operationId = createAddOperationId();
    return items.map((line) =>
      line.id === item.id
        ? {
            ...line,
            qty: line.qty + quantity,
            cartAddBaseQty: baseQty,
            cartAddOperations: { ...operations, [operationId]: quantity },
          } as T
        : line,
    );
  }

  return [...items, {
    ...item,
    qty: quantity,
    cartAddBaseQty: 0,
    cartAddOperations: { [createAddOperationId()]: quantity },
  } as T];
}

export function setCartItemQuantity<T extends CartLine>(items: readonly T[], id: string, qty: number): T[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const { cartAddBaseQty: _baseQty, cartAddOperations: _operations, ...withoutAddMetadata } = item;
    return { ...withoutAddMetadata, qty } as T;
  });
}

function sameCartItem(left: CartLine | undefined, right: CartLine | undefined): boolean {
  if (!left || !right) return left === right;
  return left.id === right.id
    && left.name === right.name
    && left.price === right.price
    && left.kind === right.kind
    && left.sku === right.sku
    && left.priceSource === right.priceSource
    && left.qty === right.qty;
}

export function sameCartItemList(left: CartLine[], right: CartLine[]): boolean {
  return left.length === right.length && left.every((item, index) => sameCartItem(item, right[index]));
}

function additiveDetails(item: CartLine | undefined, baseItem: CartLine | undefined) {
  if (!item || !Number.isFinite(item.cartAddBaseQty) || !item.cartAddOperations || typeof item.cartAddOperations !== 'object') {
    return null;
  }
  const expectedBaseQty = baseItem
    ? Number.isFinite(baseItem.cartAddBaseQty) ? baseItem.cartAddBaseQty as number : baseItem.qty
    : 0;
  if (item.cartAddBaseQty !== expectedBaseQty) return null;

  const operations = Object.entries(item.cartAddOperations);
  if (operations.some(([, quantity]) => !Number.isFinite(quantity) || quantity <= 0)) return null;
  const baseOperations = baseItem?.cartAddOperations ?? {};
  if (Object.entries(baseOperations).some(([id, quantity]) => item.cartAddOperations?.[id] !== quantity)) return null;
  const calculatedQty = operations.reduce((sum, [, quantity]) => sum + quantity, expectedBaseQty);
  return calculatedQty === item.qty ? { baseQty: expectedBaseQty, operations: item.cartAddOperations } : null;
}

export function mergeConcurrentCartChanges<T extends CartLine>(base: T[], local: T[], remote: T[]): T[] {
  const baseById = new Map(base.map(item => [item.id, item]));
  const localById = new Map(local.map(item => [item.id, item]));
  const remoteById = new Map(remote.map(item => [item.id, item]));
  const mergedById = new Map<string, T>();

  for (const id of new Set([...remoteById.keys(), ...localById.keys(), ...baseById.keys()])) {
    const baseItem = baseById.get(id);
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);
    const localChanged = !sameCartItem(localItem, baseItem);
    const remoteChanged = !sameCartItem(remoteItem, baseItem);

    if (localChanged && remoteChanged) {
      const localAdd = additiveDetails(localItem, baseItem);
      const remoteAdd = additiveDetails(remoteItem, baseItem);
      if (localItem && remoteItem && localAdd && remoteAdd && localAdd.baseQty === remoteAdd.baseQty) {
        const operations = { ...remoteAdd.operations, ...localAdd.operations };
        const merged = {
          ...remoteItem,
          qty: localAdd.baseQty + Object.values(operations).reduce((sum, quantity) => sum + quantity, 0),
          cartAddBaseQty: localAdd.baseQty,
          cartAddOperations: operations,
        };
        mergedById.set(id, merged);
        continue;
      }
    }

    // The latest value already committed to storage wins explicit same-line conflicts.
    const chosen = localChanged && !remoteChanged ? localItem : remoteItem;
    if (chosen) mergedById.set(id, chosen);
  }

  const orderedIds = [...remote.map(item => item.id), ...local.map(item => item.id), ...base.map(item => item.id)];
  const seen = new Set<string>();
  return orderedIds.flatMap(id => {
    const item = mergedById.get(id);
    if (!item || seen.has(id)) return [];
    seen.add(id);
    return [item];
  });
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
