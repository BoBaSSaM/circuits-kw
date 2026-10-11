import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBomCartItems,
  buildPlanFromPrompt,
  calculateBomLineTotal,
  calculateBomTotal,
  inferAssemblyCount,
  inferPartQuantity,
} from './build-assist-model.ts';
import { addCartItem, calculateCartSubtotal } from './cart-model.ts';

const catalog = [
  { id: 'esp32', name: 'ESP32-WROOM-32D', sku: 'ESP32-WRM-32D', price: 2.85, category: 'Microcontrollers' },
  { id: 'bme280', name: 'BME280 Sensor Module', sku: 'SNS-BME280-I2C', price: 1.95, category: 'Sensors' },
  { id: 'hcsr04', name: 'HC-SR04 Ultrasonic Sensor', sku: 'SNS-HCSR04-5V', price: 0.85, category: 'Sensors' },
  { id: 'soil', name: 'Capacitive Soil Moisture Sensor', sku: 'SNS-SOIL-CAP-12', price: 1.2, category: 'Sensors' },
  { id: 'level', name: 'Logic Level Converter', sku: 'MOD-LLC-4CH-BI', price: 0.65, category: 'ICs & Logic Translators' },
];

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

test('selects a level converter according to the requested logic voltage', () => {
  const esp32AtFiveVolts = buildPlanFromPrompt('ESP32 weather monitor', '5V', catalog);
  assert.ok(esp32AtFiveVolts.parts.some((part) => part.id === 'level'));

  const ultrasonicAt3v3 = buildPlanFromPrompt('HC-SR04 parking distance sensor', '3.3V', catalog);
  assert.ok(ultrasonicAt3v3.parts.some((part) => part.id === 'level'));

  const esp32AtNativeVoltage = buildPlanFromPrompt('ESP32 weather monitor', '3.3V', catalog);
  assert.ok(!esp32AtNativeVoltage.parts.some((part) => part.id === 'level'));
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

test('adding an estimate merges quantities into an existing matching cart line', () => {
  const [estimateItem] = buildBomCartItems([catalog[0]], () => 2, 3);
  const existingCart = [{ ...estimateItem, qty: 1 }];
  const cart = addCartItem(existingCart, estimateItem);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].qty, 7);
  assert.equal(calculateCartSubtotal(cart), catalog[0].price * 7);
});
