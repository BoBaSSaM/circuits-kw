import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBomCartItems,
  buildPlanFromPrompt,
  calculateBomLineTotal,
  calculateBomTotal,
  inferAssemblyCount,
  inferPartQuantity,
  isPriceListStale,
  parseAuthorizedPriceCsv,
  PRICE_LIST_FRESHNESS_DAYS,
} from './build-assist-model.ts';
import {
  addCartItem,
  calculateCartSubtotal,
  mergeConcurrentCartChanges,
  mergeGuestCartItems,
  replaceSupplierPricedBomItems,
  removeSupplierPricedBomItems,
  setCartItemQuantity,
} from './cart-model.ts';

const catalog = [
  { id: 'esp32', name: 'ESP32-WROOM-32D', sku: 'ESP32-WRM-32D', price: 2.85, category: 'Microcontrollers' },
  { id: 'bme280', name: 'BME280 Sensor Module', sku: 'SNS-BME280-I2C', price: 1.95, category: 'Sensors' },
  { id: 'hcsr04', name: 'HC-SR04 Ultrasonic Sensor', sku: 'SNS-HCSR04-5V', price: 0.85, category: 'Sensors' },
  { id: 'soil', name: 'Capacitive Soil Moisture Sensor', sku: 'SNS-SOIL-CAP-12', price: 1.2, category: 'Sensors' },
  { id: 'level', name: 'Logic Level Converter', sku: 'MOD-LLC-4CH-BI', price: 0.65, category: 'ICs & Logic Translators' },
  { id: 'lcd', name: '16x2 I2C Character LCD', sku: 'DIS-LCD-1602I2C', price: 1.45, category: 'Displays' },
];

test('marks a price list stale at the documented calendar-day threshold', () => {
  const now = new Date('2026-10-11T16:00:00Z');
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dateDaysAgo = (days) => new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  assert.equal(PRICE_LIST_FRESHNESS_DAYS, 90);
  assert.equal(isPriceListStale(dateDaysAgo(PRICE_LIST_FRESHNESS_DAYS - 1), now), false);
  assert.equal(isPriceListStale(dateDaysAgo(PRICE_LIST_FRESHNESS_DAYS), now), true);
  assert.equal(isPriceListStale(dateDaysAgo(PRICE_LIST_FRESHNESS_DAYS + 1), now), true);
  assert.equal(isPriceListStale('2026-10-12', now), false);
  assert.equal(isPriceListStale('2026-02-30', now), false);
  assert.equal(isPriceListStale('not-a-date', now), false);
});

test('infers English assembly and per-part quantities independently', () => {
  const prompt = 'Build three devices with two ESP32 controllers and four soil sensors';
  assert.equal(inferAssemblyCount(prompt), 3);
  assert.equal(inferPartQuantity(prompt, catalog[0]), 2);
  assert.equal(inferPartQuantity(prompt, catalog[3]), 4);
  assert.equal(inferPartQuantity('Build five devices with 3 sensors', catalog[1]), 3);
});

test('reads Arabic-Indic digits and Arabic quantity words', () => {
  assert.equal(inferAssemblyCount('أريد ٣ وحدات مع ٢ مستشعرات'), 3);
  assert.equal(inferPartQuantity('أريد ٣ وحدات مع ٢ مستشعرات', catalog[2]), 2);
  assert.equal(inferAssemblyCount('أحتاج ثلاثة أجهزة'), 3);
  assert.equal(inferPartQuantity('أحتاج ثلاثة أجهزة واثنين مستشعرات', catalog[1]), 2);
});

test('calculates edited per-part quantities across multiple assemblies in fils', () => {
  const lines = [
    { unitPrice: 2.85, quantityPerAssembly: 2 },
    { unitPrice: 0.65, quantityPerAssembly: 3 },
  ];
  assert.equal(calculateBomLineTotal(2.85, 2, 4), 22.8);
  assert.equal(calculateBomTotal(lines, 4), 30.6);
});

test('keeps soil-only monitors from adding a climate sensor', () => {
  const englishSoilMonitor = buildPlanFromPrompt('ESP32 soil moisture monitor', '3.3V', catalog);
  assert.deepEqual(englishSoilMonitor.parts.map((part) => part.id).sort(), ['esp32', 'soil']);

  const arabicSoilMonitor = buildPlanFromPrompt('مراقبة رطوبة التربة', '3.3V', catalog);
  assert.deepEqual(arabicSoilMonitor.parts.map((part) => part.id).sort(), ['esp32', 'soil']);
});

test('selects a level converter according to the requested logic voltage', () => {
  const esp32AtFiveVolts = buildPlanFromPrompt('ESP32 weather monitor', '5V', catalog);
  assert.ok(esp32AtFiveVolts.parts.some((part) => part.id === 'level'));

  const ultrasonicAt3v3 = buildPlanFromPrompt('HC-SR04 parking distance sensor', '3.3V', catalog);
  assert.ok(ultrasonicAt3v3.parts.some((part) => part.id === 'level'));

  const esp32AtNativeVoltage = buildPlanFromPrompt('ESP32 weather monitor', '3.3V', catalog);
  assert.ok(!esp32AtNativeVoltage.parts.some((part) => part.id === 'level'));

  const lcdAt3v3 = buildPlanFromPrompt('ESP32 weather display with 16x2 LCD', '3.3V', catalog);
  assert.ok(lcdAt3v3.parts.some((part) => part.id === 'level'));
});

test('keeps requested parts without catalog prices out of the estimate', () => {
  const plan = buildPlanFromPrompt(
    'Solar greenhouse monitor with soil moisture, water pump and WhatsApp alerts',
    '12V',
    catalog,
  );
  assert.ok(plan.unpricedRequirements.includes('Solar panel'));
  assert.ok(plan.unpricedRequirements.includes('Water pump and relay'));
  assert.ok(plan.unpricedRequirements.includes('WhatsApp alert service'));
  assert.ok(plan.unpricedRequirements.includes('12V power converter'));
  assert.ok(plan.parts.every((part) => catalog.some((listed) => listed.id === part.id)));
  assert.ok(!plan.parts.some((part) => /panel|pump|relay|whatsapp|converter/i.test(part.name)));
});

test('adds estimate lines with their full quantities and matching subtotal', () => {
  const estimateParts = [catalog[0], catalog[4]];
  const perAssemblyQuantity = new Map([['esp32', 2], ['level', 3]]);
  const assemblies = 4;
  const estimateItems = buildBomCartItems(
    estimateParts,
    (part) => perAssemblyQuantity.get(part.id),
    assemblies,
  );
  assert.deepEqual(estimateItems.map(({ id, qty }) => ({ id, qty })), [
    { id: 'bom-esp32', qty: 8 },
    { id: 'bom-level', qty: 12 },
  ]);

  const cart = estimateItems.reduce((items, item) => addCartItem(items, item), []);
  assert.equal(calculateCartSubtotal(cart), calculateBomTotal(
    estimateParts.map((part) => ({
      unitPrice: part.price,
      quantityPerAssembly: perAssemblyQuantity.get(part.id),
    })),
    assemblies,
  ));
  assert.equal(calculateCartSubtotal(cart), 30.6);
});

test('imports KWD price rows by normalized SKU and never falls back for missing prices', () => {
  const priceList = parseAuthorizedPriceCsv('\uFEFFSKU,unit_price,currency\r\nesp32-wrm-32d,3.125,KWD\r\nSNS-BME280-I2C,0.000,KWD\r\n');
  assert.deepEqual(priceList.pricesBySku, {
    'ESP32-WRM-32D': 3.125,
    'SNS-BME280-I2C': 0,
  });

  const parts = [
    { ...catalog[0], price: priceList.pricesBySku[catalog[0].sku] ?? null },
    { ...catalog[1], price: priceList.pricesBySku[catalog[1].sku] ?? null },
    { ...catalog[2], price: priceList.pricesBySku[catalog[2].sku] ?? null },
  ];
  assert.equal(parts[0].price, 3.125);
  assert.equal(parts[1].price, 0);
  assert.equal(parts[2].price, null);
  assert.deepEqual(buildBomCartItems(parts, () => 1, 1).map(({ sku, price }) => ({ sku, price })), [
    { sku: catalog[0].sku, price: 3.125 },
    { sku: catalog[1].sku, price: 0 },
  ]);
});

test('rejects malformed, duplicate, and non-KWD supplier price rows', () => {
  assert.throws(() => parseAuthorizedPriceCsv('sku,price\nESP32-WRM-32D,-1'), /non-negative KWD price/);
  assert.throws(() => parseAuthorizedPriceCsv('sku,price,currency\nA,1,USD'), /currency must be KWD/);
  assert.throws(() => parseAuthorizedPriceCsv('sku,price\nA,1\nA,2'), /duplicate SKU A/);
  assert.throws(() => parseAuthorizedPriceCsv('sku,cost\nA,1'), /SKU and price/);
});

test('adding an estimate merges quantities into an existing matching cart line', () => {
  const [estimateItem] = buildBomCartItems([catalog[0]], () => 2, 3);
  const existingCart = [{ ...estimateItem, qty: 1 }];
  const cart = addCartItem(existingCart, estimateItem);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].qty, 7);
  assert.equal(calculateCartSubtotal(cart), catalog[0].price * 7);
});

test('merges guest cart quantities into the signed-in buyer cart after sign-in', () => {
  const saved = [
    { id: 'esp32', name: 'Saved ESP32', sku: 'ESP32', kind: 'component', price: 2.85, qty: 2 },
  ];
  const guest = [
    { id: 'esp32', name: 'Guest ESP32', sku: 'ESP32', kind: 'component', price: 2.85, qty: 3 },
    { id: 'bme280', name: 'BME280', sku: 'BME280', kind: 'component', price: 1.95, qty: 1 },
  ];

  assert.deepEqual(mergeGuestCartItems(saved, guest), [
    { ...saved[0], qty: 5 },
    guest[1],
  ]);
});

test('merges unique concurrent add operations once, including new matching lines', () => {
  const base = [{ id: 'esp32', name: catalog[0].name, sku: catalog[0].sku, kind: 'component', price: catalog[0].price, qty: 1 }];
  const item = { ...base[0], qty: 2 };
  const localAdd = addCartItem(base, item);
  const remoteAdd = addCartItem(base, item);

  const merged = mergeConcurrentCartChanges(base, localAdd, remoteAdd);
  assert.equal(merged[0].qty, 5);
  assert.equal(mergeConcurrentCartChanges(base, localAdd, merged)[0].qty, 5);

  const localNewItem = addCartItem([], { ...item, qty: 2 });
  const remoteNewItem = addCartItem([], { ...item, qty: 3 });
  assert.equal(mergeConcurrentCartChanges([], localNewItem, remoteNewItem)[0].qty, 5);
});

test('a fresh add survives a concurrent removal in either tab order', () => {
  const base = [{ id: 'esp32', name: catalog[0].name, sku: catalog[0].sku, kind: 'component', price: catalog[0].price, qty: 1 }];
  const added = addCartItem(base, base[0]);

  assert.deepEqual(mergeConcurrentCartChanges(base, [], added).map(({ id, qty }) => ({ id, qty })), [
    { id: 'esp32', qty: 2 },
  ]);
  assert.deepEqual(mergeConcurrentCartChanges(base, added, []).map(({ id, qty }) => ({ id, qty })), [
    { id: 'esp32', qty: 2 },
  ]);
});

test('keeps the saved-value conflict rule for explicit quantity edits', () => {
  const base = [{ id: 'esp32', name: catalog[0].name, sku: catalog[0].sku, kind: 'component', price: catalog[0].price, qty: 1 }];
  const localEdit = setCartItemQuantity(base, 'esp32', 3);
  const remoteEdit = setCartItemQuantity(base, 'esp32', 4);

  assert.equal(mergeConcurrentCartChanges(base, localEdit, remoteEdit)[0].qty, 4);
});

test('removing a supplier list clears only supplier-priced BOM cart entries', () => {
  const items = [
    { id: 'bom-esp32', kind: 'bom', sku: 'ESP32-WRM-32D', price: 1.625, priceSource: 'supplier-list', qty: 2 },
    { id: 'bom-soil', kind: 'bom', sku: 'SNS-SOIL-CAP-12', price: 1.2, priceSource: 'catalog', qty: 1 },
    { id: 'bom-bme280', kind: 'bom', sku: 'SNS-BME280-I2C', price: 1.95, qty: 1 },
    { id: 'component-esp32', kind: 'component', sku: 'ESP32-WRM-32D', price: 2.85, qty: 1 },
  ];

  const remaining = removeSupplierPricedBomItems(items, {
    'ESP32-WRM-32D': 1.625,
    'SNS-BME280-I2C': 1.95,
  });

  assert.deepEqual(remaining.map(({ id }) => id), ['bom-soil', 'component-esp32']);
  assert.equal(calculateCartSubtotal(remaining), 4.05);
});

test('replacing a supplier list reprices matching BOM lines and removes unpriced ones', () => {
  const items = [
    { id: 'bom-esp32', kind: 'bom', sku: 'ESP32-WRM-32D', price: 1.625, priceSource: 'supplier-list', qty: 3 },
    { id: 'bom-soil', kind: 'bom', sku: 'SNS-SOIL-CAP-12', price: 0.75, qty: 1 },
    { id: 'bom-catalog', kind: 'bom', sku: 'SNS-BME280-I2C', price: 1.95, priceSource: 'catalog', qty: 2 },
    { id: 'component-esp32', kind: 'component', sku: 'ESP32-WRM-32D', price: 2.85, qty: 1 },
  ];

  const replacement = replaceSupplierPricedBomItems(items, {
    ' esp32-wrm-32d ': 2.75,
    'SNS-BME280-I2C': 1.5,
  }, {
    'ESP32-WRM-32D': 1.625,
    'SNS-SOIL-CAP-12': 0.75,
  });

  assert.equal(replacement.updatedCount, 1);
  assert.equal(replacement.removedCount, 1);
  assert.deepEqual(replacement.items, [
    { ...items[0], price: 2.75 },
    items[2],
    items[3],
  ]);
  assert.equal(calculateCartSubtotal(replacement.items), 15);
});
