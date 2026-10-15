import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium as playwrightChromium } from 'playwright';

const artifactDir = path.resolve(import.meta.dirname, '..');
const priceListStorageKey = 'circuits-kw-build-assist-prices';
const freshnessPeriodDays = 90;

function dateDaysAgo(days) {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return new Date(utcToday - days * 86_400_000).toISOString().slice(0, 10);
}

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(serverProcess, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Vite exited before it was ready (exit code ${serverProcess.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error(`Vite did not become ready at ${url} within 30 seconds.`);
}

async function findChromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/repl/tools/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common Chromium location.
    }
  }
}

const catalogFixture = {
  products: [
    { id: 'esp32', name: 'ESP32-WROOM-32D', sku: 'ESP32-WRM-32D', category: 'Microcontrollers', price: 2.85, stock: 142, package: 'DIP-38', description: 'Dual-core 240MHz MCU with integrated RF and PCB antenna.', voltage: '2.7V–3.6V (3.3V nom.)', interface: 'SPI · I²C · UART · PWM', icon: 'cpu', imageUrl: null, isActive: true },
    { id: 'nucleo', name: 'STM32 Nucleo-F401RE', sku: 'NUCLEO-F401RE', category: 'Microcontrollers', price: 6.2, stock: 28, package: 'Nucleo-64', description: 'Cortex-M4 board with ST-LINK and 512KB flash.', voltage: '3.3V / 5V Vin', interface: 'USB · UART · SPI', icon: 'board', imageUrl: null, isActive: true },
    { id: 'bme280', name: 'BME280 Sensor Module', sku: 'SNS-BME280-I2C', category: 'Sensors', price: 1.95, stock: 65, package: 'LGA-8 breakout', description: 'Measures temperature, humidity and air pressure.', voltage: '1.8V–3.6V', interface: 'I²C · SPI', icon: 'sensor', imageUrl: null, isActive: true },
    { id: 'hcsr04', name: 'HC-SR04 Ultrasonic Sensor', sku: 'SNS-HCSR04-5V', category: 'Sensors', price: 0.85, stock: 210, package: 'Through-hole', description: 'Ultrasonic sensor for distance and obstacle detection.', voltage: '5V DC', interface: 'GPIO · trigger', icon: 'sensor', imageUrl: null, isActive: true },
    { id: 'pico', name: 'Raspberry Pi Pico W', sku: 'RPI-PICOW-2024', category: 'Microcontrollers', price: 2.1, stock: 0, package: 'DIP-40', description: 'Dual-core RP2040 board with Wi-Fi and 2MB flash.', voltage: '1.8V–5.5V VSYS', interface: 'PIO · SPI · I²C', icon: 'board', imageUrl: null, isActive: true },
    { id: 'lcd', name: '16x2 I2C Character LCD', sku: 'DIS-LCD-1602I2C', category: 'Displays', price: 1.45, stock: 54, package: '1602 module', description: '16×2 character LCD with I²C backpack.', voltage: '5V DC', interface: 'I²C address 0x27', icon: 'display', imageUrl: null, isActive: true },
    { id: 'level', name: 'Logic Level Converter 4-Ch', sku: 'MOD-LLC-4CH-BI', category: 'ICs & Logic Translators', price: 0.65, stock: 320, package: '4-channel board', description: 'Bidirectional logic shifting for 3.3V and 5V systems.', voltage: 'Up to 5V DC', interface: 'I²C · SPI · UART', icon: 'power', imageUrl: null, isActive: true },
    { id: 'resistor', name: 'Metal Film Resistors Kit', sku: 'PAS-RES-KIT-600', category: 'Passives', price: 2.5, stock: 75, package: '600 pieces', description: '600-piece resistor kit with 1% tolerance.', voltage: '250mW · 0.25W', interface: 'E12 series', icon: 'parts', imageUrl: null, isActive: true },
    { id: 'soil', name: 'Capacitive Soil Moisture Sensor v1.2', sku: 'SNS-SOIL-CAP-12', category: 'Sensors', price: 1.2, stock: 48, package: 'Analog module', description: 'Corrosion-resistant probe with 3.3V analog output.', voltage: '3.3V analog', interface: 'ADC output', icon: 'sensor', imageUrl: null, isActive: true },
    { id: 'tp4056', name: 'TP4056 1A Li-Ion Solar Battery Charger', sku: 'PWR-TP4056-C', category: 'Power & Battery', price: 0.75, stock: 92, package: 'USB-C module', description: 'USB-C Li-ion charger with DW01A protection.', voltage: '4.2V charge', interface: 'USB-C · Li-ion', icon: 'power', imageUrl: null, isActive: true },
    { id: 'battery', name: '18650 3000mAh Battery Cell with Holder', sku: 'BAT-18650-3000', category: 'Power & Battery', price: 2.2, stock: 39, package: '18650 + holder', description: '3000mAh 18650 cell with holder and clip leads.', voltage: '3.7V nominal', interface: 'Li-ion · holder', icon: 'power', imageUrl: null, isActive: true },
  ],
  kits: [
    { id: 'weather-kit', code: 'CKW-KIT-0101', title: 'IoT Weather Station Kit', category: 'IoT & Smart Home', level: 'Intermediate', domain: 'iot', duration: '1.5–2 hrs', price: 12.5, desc: 'Measure pressure, temperature and humidity; stream over Wi-Fi.', parts: ['ESP32 NodeMCU', 'BME280 Sensor'], count: '6 Items', manual: 'PDF Manual', icon: 'weather', isActive: true },
  ],
};

async function installApiMocks(context) {
  await context.route('**/api/catalog', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(catalogFixture),
  }));
  await context.route('**/api/orders', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const input = route.request().postDataJSON();
    const items = input.items.map(item => {
      const source = item.kind === 'kit'
        ? catalogFixture.kits.find(kit => kit.id === item.id || kit.code === item.sku)
        : catalogFixture.products.find(product => product.id === item.id || product.sku === item.sku);
      const price = item.kind === 'bom' && item.estimateUnitPrice !== undefined
        ? item.estimateUnitPrice
        : source?.price ?? 2.5;
      return {
        id: item.id,
        kind: item.kind,
        sku: item.sku,
        name: source?.name ?? source?.title ?? item.sku,
        price,
        qty: item.qty,
      };
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-order-id',
        orderNumber: 'CKW-MOCK-0001',
        placedAt: new Date().toISOString(),
        items,
        subtotal: items.reduce((total, item) => total + item.price * item.qty, 0),
        status: 'new',
      }),
    });
  });
}

const chromium = {
  async launch(options) {
    const browser = await playwrightChromium.launch(options);
    return {
      newPage: async (...args) => {
        const page = await browser.newPage(...args);
        await installApiMocks(page.context());
        return page;
      },
      newContext: async (...args) => {
        const context = await browser.newContext(...args);
        await installApiMocks(context);
        return context;
      },
      close: () => browser.close(),
    };
  },
};

test('stale saved price lists warn on Build Assist, fresh lists clear the warning, and priced items reach the cart', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const sampleContext = await browser.newContext();
    const samplePage = await sampleContext.newPage();
    const sampleErrors = [];
    samplePage.on('pageerror', (error) => sampleErrors.push(error.message));
    await samplePage.goto(`${baseUrl}/build-assist`);
    await samplePage.getByTestId('row-bom-esp32').waitFor();
    assert.equal(await samplePage.getByTestId('text-build-assist-total').innerText(), '6.000 KWD');
    assert.match(await samplePage.getByTestId('text-price-source').innerText(), /Illustrative catalog prices/);
    assert.equal(await samplePage.getByTestId('button-add-bom-cart').isDisabled(), false);
    await samplePage.getByTestId('button-add-bom-cart').click();
    await samplePage.getByTestId('link-cart').click();
    await samplePage.getByTestId('row-cart-bom-esp32').waitFor();
    assert.equal(await samplePage.getByTestId('row-cart-bom-esp32').locator('.price').innerText(), '2.850 KWD');
    assert.equal(await samplePage.locator('.summary-card .summary-total .mono').innerText(), '6.000 KWD');
    for (const width of [1280, 980, 768, 402, 320]) {
      await samplePage.setViewportSize({ width, height: 1000 });
      const sizing = await samplePage.evaluate(() => {
        const row = document.querySelector('.cart-row');
        const list = document.querySelector('.cart-list');
        const summary = document.querySelector('.summary-card');
        const quantity = row?.querySelector('.quantity');
        const price = row?.querySelector('.price');
        const remove = row?.querySelector('.remove');
        return {
          width: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          listBottom: list?.getBoundingClientRect().bottom ?? 0,
          summaryTop: summary?.getBoundingClientRect().top ?? 0,
          listRight: list?.getBoundingClientRect().right ?? 0,
          summaryLeft: summary?.getBoundingClientRect().left ?? 0,
          rowRight: row?.getBoundingClientRect().right ?? 0,
          quantityRight: quantity?.getBoundingClientRect().right ?? 0,
          priceRight: price?.getBoundingClientRect().right ?? 0,
          removeLeft: remove?.getBoundingClientRect().left ?? 0,
          removeRight: remove?.getBoundingClientRect().right ?? 0,
          priceDisplay: getComputedStyle(row?.querySelector('.price')).display,
        };
      });
      assert.equal(sizing.documentWidth, width, `cart should not overflow at ${width}px`);
      assert.ok(sizing.quantityRight <= sizing.rowRight, `quantity control should fit at ${width}px`);
      assert.ok(sizing.priceRight <= sizing.removeLeft, `price and remove control should not overlap at ${width}px`);
      assert.ok(sizing.removeRight <= sizing.rowRight, `remove control should fit at ${width}px`);
      if (width <= 980) assert.ok(sizing.summaryTop >= sizing.listBottom, `summary should stack below items at ${width}px`);
      else assert.ok(sizing.summaryLeft > sizing.listRight, 'desktop summary should sit beside the cart');
      if (width <= 760) assert.equal(sizing.priceDisplay, 'block', 'mobile cart should keep line prices visible');
    }
    assert.deepEqual(sampleErrors, []);
    await sampleContext.close();

    const replacementContext = await browser.newContext();
    const replacementPage = await replacementContext.newPage();
    const replacementErrors = [];
    replacementPage.on('pageerror', (error) => replacementErrors.push(error.message));
    await replacementPage.goto(`${baseUrl}/build-assist`);
    await replacementPage.getByTestId('row-bom-esp32').waitFor();
    await replacementPage.getByTestId('button-generate-bom').click();
    await replacementPage.getByTestId('input-assembly-count').fill('2');
    await replacementPage.getByTestId('summary-price-list').click();
    await replacementPage.getByTestId('input-price-list-source').fill('Original supplier');
    await replacementPage.getByTestId('input-price-list-updated').fill(dateDaysAgo(0));
    await replacementPage.getByTestId('input-price-list-file').setInputFiles({
      name: 'original-supplier-prices.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'sku,unit_price,currency\nESP32-WRM-32D,1.000,KWD\nSNS-BME280-I2C,2.000,KWD\nSNS-SOIL-CAP-12,0.500,KWD\n',
      ),
    });
    await replacementPage.getByTestId('button-import-price-csv').click();
    await replacementPage.waitForFunction(() =>
      document.querySelector('[data-testid="text-price-source"]')?.textContent?.includes('Original supplier'),
    );
    assert.match(await replacementPage.getByTestId('text-price-source').innerText(), /Original supplier/);
    assert.equal(await replacementPage.getByTestId('text-build-assist-total').innerText(), '7.000 KWD');

    const priceListDetails = replacementPage.getByTestId('details-price-list');
    if (!(await priceListDetails.evaluate(element => element.open))) {
      await replacementPage.getByTestId('summary-price-list').click();
    }
    await replacementPage.getByTestId('input-price-list-source').fill('Replacement supplier');
    await replacementPage.getByTestId('input-price-list-updated').fill(dateDaysAgo(0));
    await replacementPage.getByTestId('input-price-list-file').setInputFiles({
      name: 'replacement-supplier-prices.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'sku,unit_price,currency\nESP32-WRM-32D,1.500,KWD\nSNS-BME280-I2C,2.500,KWD\nSNS-SOIL-CAP-12,0.750,KWD\n',
      ),
    });
    await replacementPage.getByTestId('button-import-price-csv').click();
    await replacementPage.waitForFunction(() =>
      document.querySelector('[data-testid="text-price-source"]')?.textContent?.includes('Replacement supplier'),
    );
    assert.match(await replacementPage.getByTestId('text-price-source').innerText(), /Replacement supplier/);
    assert.equal(
      await replacementPage.getByTestId('row-bom-esp32').locator('.bom-unit-price').innerText(),
      'Unit cost: 1.500 KWD',
    );
    assert.equal(await replacementPage.getByTestId('text-line-total-esp32').innerText(), '3.000 KWD');
    assert.equal(
      await replacementPage.getByTestId('row-bom-bme280').locator('.bom-unit-price').innerText(),
      'Unit cost: 2.500 KWD',
    );
    assert.equal(await replacementPage.getByTestId('text-line-total-bme280').innerText(), '5.000 KWD');
    assert.equal(
      await replacementPage.getByTestId('row-bom-soil').locator('.bom-unit-price').innerText(),
      'Unit cost: 0.750 KWD',
    );
    assert.equal(await replacementPage.getByTestId('text-line-total-soil').innerText(), '1.500 KWD');
    assert.equal(await replacementPage.getByTestId('text-build-assist-total').innerText(), '9.500 KWD');
    assert.match(await replacementPage.getByTestId('button-add-bom-cart').innerText(), /9\.500 KWD/);

    await replacementPage.getByTestId('button-add-bom-cart').click();
    await replacementPage.getByTestId('link-cart').click();
    for (const [part, price] of [['esp32', '3.000 KWD'], ['bme280', '5.000 KWD'], ['soil', '1.500 KWD']]) {
      const cartRow = replacementPage.getByTestId(`row-cart-bom-${part}`);
      await cartRow.waitFor();
      assert.equal(await cartRow.locator('.price').innerText(), price);
      assert.equal(await replacementPage.getByTestId(`input-quantity-bom-${part}`).inputValue(), '2');
    }
    assert.equal(await replacementPage.locator('.summary-card .summary-total .mono').innerText(), '9.500 KWD');
    assert.deepEqual(replacementErrors, []);
    await replacementContext.close();

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/build-assist`);
    await page.getByTestId('row-bom-esp32').waitFor();
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '6.000 KWD');
    assert.equal(await page.getByTestId('button-add-bom-cart').isDisabled(), false);
    assert.match(await page.getByTestId('text-price-source').innerText(), /Illustrative catalog prices/);
    const previewDescription = await page.locator('.assist-output-head p').innerText();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('status-build-assist').waitFor();
    assert.notEqual(await page.locator('.assist-output-head p').innerText(), previewDescription);
    assert.match(await page.getByTestId('status-build-assist').innerText(), /illustrative catalog prices/);
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '6.000 KWD');
    const staleUpdatedAt = dateDaysAgo(freshnessPeriodDays);
    const stalePriceList = {
      pricesBySku: { 'ESP32-WRM-32D': 1.625 },
      source: 'Verified supplier list',
      updatedAt: staleUpdatedAt,
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: priceListStorageKey,
      value: stalePriceList,
    });
    await page.reload();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('input-assembly-count').fill('2');
    await page.getByTestId('notice-stale-price-list').waitFor();
    assert.match(await page.getByTestId('notice-stale-price-list').innerText(), /90/);
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    await page.getByTestId('text-unpriced-soil').waitFor();
    await page.getByTestId('text-unpriced-bme280').waitFor();

    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), new RegExp(staleUpdatedAt));
    const savedPriceList = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey);
    assert.deepEqual(savedPriceList, stalePriceList);

    await page.reload();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('text-unpriced-soil').waitFor();
    await page.getByTestId('text-unpriced-bme280').waitFor();
    await page.getByTestId('input-assembly-count').fill('2');
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), new RegExp(staleUpdatedAt));
    await page.getByTestId('notice-stale-price-list').waitFor();

    await page.getByTestId('summary-price-list').click();
    await page.getByTestId('button-remove-price-list').click();
    await page.getByTestId('text-unpriced-esp32').waitFor();
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '—');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '—');
    assert.match(await page.getByTestId('text-price-source').innerText(), /No current price list loaded/);
    assert.equal(await page.getByTestId('button-add-bom-cart').isDisabled(), true);
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]').length),
      0,
      'removing the supplier prices must not add any BOM items to the cart',
    );
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), priceListStorageKey), null);

    const freshUpdatedAt = dateDaysAgo(0);
    const freshPriceList = { ...stalePriceList, source: 'Fresh supplier list', updatedAt: freshUpdatedAt };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: priceListStorageKey,
      value: freshPriceList,
    });
    await page.reload();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('input-assembly-count').fill('2');
    assert.equal(await page.getByTestId('notice-stale-price-list').count(), 0);
    assert.match(await page.getByTestId('text-price-source').innerText(), /Fresh supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), new RegExp(freshUpdatedAt));

    await page.getByTestId('summary-price-list').click();
    await page.getByTestId('input-price-list-source').fill('Rejected replacement');
    await page.getByTestId('input-price-list-file').setInputFiles({
      name: 'invalid-currency.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('sku,price,currency\nESP32-WRM-32D,1.625,USD\n'),
    });
    await page.getByTestId('button-import-price-csv').click();
    assert.equal(
      await page.getByTestId('error-price-list-import').innerText(),
      'CSV row 2 currency must be KWD.',
    );
    assert.match(await page.getByTestId('text-price-source').innerText(), /Fresh supplier list/);
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey),
      freshPriceList,
      'a rejected replacement must not overwrite the currently saved price list',
    );

    await page.getByTestId('button-add-bom-cart').click();
    await page.getByTestId('link-cart').click();
    await page.getByTestId('row-cart-bom-esp32').waitFor();
    assert.equal(await page.getByTestId('row-cart-bom-esp32').count(), 1);
    assert.equal(await page.getByTestId('row-cart-bom-soil').count(), 0);
    assert.equal(await page.getByTestId('row-cart-bom-bme280').count(), 0);
    assert.equal(await page.getByTestId('input-quantity-bom-esp32').inputValue(), '2');
    assert.equal(await page.getByTestId('row-cart-bom-esp32').locator('.price').innerText(), '3.250 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '3.250 KWD');

    await page.reload();
    const restoredBomRow = page.getByTestId('row-cart-bom-esp32');
    await restoredBomRow.waitFor();
    assert.equal(await restoredBomRow.count(), 1);
    assert.equal(await page.getByTestId('row-cart-bom-soil').count(), 0);
    assert.equal(await page.getByTestId('row-cart-bom-bme280').count(), 0);
    assert.equal(await page.getByTestId('input-quantity-bom-esp32').inputValue(), '2');
    assert.equal(await restoredBomRow.locator('.price').innerText(), '3.250 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '3.250 KWD');

    await page.getByTestId('input-quantity-bom-esp32').fill('4');
    assert.equal(await page.getByTestId('input-quantity-bom-esp32').inputValue(), '4');
    assert.equal(await restoredBomRow.locator('.price').innerText(), '6.500 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '6.500 KWD');

    await page.reload();
    const editedBomRow = page.getByTestId('row-cart-bom-esp32');
    await editedBomRow.waitFor();
    assert.equal(await page.getByTestId('input-quantity-bom-esp32').inputValue(), '4');
    assert.equal(await editedBomRow.locator('.price').innerText(), '6.500 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '6.500 KWD');

    const removedBeforeCheckout = {
      id: 'removed-before-checkout',
      name: 'Removed before checkout',
      price: 12.5,
      kind: 'component',
      sku: 'REMOVE-001',
      qty: 2,
    };
    await page.evaluate((item) => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      localStorage.setItem('circuits-kw-cart', JSON.stringify([...cart, item]));
    }, removedBeforeCheckout);
    await page.reload();
    await page.getByTestId('row-cart-removed-before-checkout').waitFor();
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '31.500 KWD');
    await page.getByTestId('button-remove-removed-before-checkout').click();
    await page.getByTestId('row-cart-removed-before-checkout').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '6.500 KWD');
    await page.getByTestId('link-checkout').click();
    const checkoutBomRow = page.getByTestId('row-checkout-bom-esp32');
    await checkoutBomRow.waitFor();
    assert.match(await checkoutBomRow.innerText(), /Qty 4/);
    assert.ok((await checkoutBomRow.innerText()).includes('6.500 KWD'));
    assert.equal(await page.getByTestId('row-checkout-removed-before-checkout').count(), 0);
    assert.equal(await page.getByTestId('text-checkout-subtotal').innerText(), '6.500 KWD');

    let checkoutOrderRequests = 0;
    page.on('request', request => {
      if (request.url().endsWith('/api/orders') && request.method() === 'POST') checkoutOrderRequests += 1;
    });
    await page.getByTestId('button-place-demo-order').click();
    const missingNameError = page.getByTestId('error-checkout-name');
    await missingNameError.waitFor();
    const nameInput = page.getByTestId('input-checkout-name');
    assert.equal(await missingNameError.innerText(), 'Enter your full name.');
    assert.equal(await nameInput.getAttribute('aria-invalid'), 'true');
    assert.equal(await nameInput.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.getByTestId('demo-order-confirmation').count(), 0);
    assert.equal(checkoutOrderRequests, 0, 'missing details must not create an order request');

    await page.getByTestId('input-checkout-name').fill('Demo Buyer');
    await page.getByTestId('input-checkout-email').fill('not-an-email');
    await page.getByTestId('input-checkout-phone').fill('+965 5555 5555');
    await page.getByTestId('select-checkout-governorate').selectOption({ label: 'Capital' });
    await page.getByTestId('input-checkout-area').fill('Kuwait City');
    await page.getByTestId('input-checkout-block').fill('1');
    await page.getByTestId('input-checkout-street').fill('Main Street');
    await page.getByTestId('input-checkout-building').fill('10');
    await page.getByTestId('button-place-demo-order').click();
    const malformedEmailError = page.getByTestId('error-checkout-email');
    await malformedEmailError.waitFor();
    const emailInput = page.getByTestId('input-checkout-email');
    assert.equal(
      await malformedEmailError.innerText(),
      'Enter a valid email address, such as name@example.com.',
    );
    assert.equal(await emailInput.getAttribute('aria-invalid'), 'true');
    assert.equal(await emailInput.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.getByTestId('demo-order-confirmation').count(), 0);
    assert.equal(checkoutOrderRequests, 0, 'malformed details must not create an order request');

    await emailInput.fill('buyer@example.com');
    const savedOrderResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/orders') && response.request().method() === 'POST',
    );
    await page.getByTestId('button-place-demo-order').click();
    const orderResponse = await savedOrderResponse;
    assert.equal(orderResponse.status(), 201);
    const savedOrder = await orderResponse.json();
    assert.deepEqual(orderResponse.request().postDataJSON().items, [{
      id: 'bom-esp32',
      kind: 'bom',
      sku: 'ESP32-WRM-32D',
      qty: 4,
      estimateUnitPrice: 1.625,
    }], 'the saved order must receive only the edited, remaining cart item');
    assert.deepEqual(savedOrder.items, [{
      id: 'bom-esp32',
      kind: 'bom',
      sku: 'ESP32-WRM-32D',
      name: 'ESP32-WROOM-32D',
      price: 1.625,
      qty: 4,
    }]);
    assert.equal(savedOrder.subtotal, 6.5);

    await page.getByTestId('demo-order-confirmation').waitFor();
    assert.equal(await page.locator('.demo-order-items > div').count(), savedOrder.items.length);
    const confirmationItem = page.getByTestId('row-confirmation-bom-esp32');
    assert.match(await confirmationItem.innerText(), /ESP32-WROOM-32D · Qty 4/);
    assert.match(await confirmationItem.innerText(), /6\.500 KWD/);
    assert.equal(await page.locator('[data-testid^="row-confirmation-removed-before-checkout"]').count(), 0);
    assert.equal(await page.getByTestId('text-demo-order-subtotal').innerText(), '6.500 KWD');
    assert.equal(await page.getByTestId('text-demo-order-number').innerText(), savedOrder.orderNumber);
    const receiptDownloadPromise=page.waitForEvent('download');
    await page.getByTestId('button-download-demo-receipt').click();
    const receiptDownload=await receiptDownloadPromise;
    assert.equal(receiptDownload.suggestedFilename(),`demo-receipt-${savedOrder.orderNumber}.html`);
    const receiptPath=await receiptDownload.path();
    assert.ok(receiptPath,'the downloadable receipt should be available for inspection');
    const receiptHtml=await readFile(receiptPath,'utf8');
    assert.match(receiptHtml,/DEMO ORDER · NO PAYMENT TAKEN/);
    assert.ok(receiptHtml.includes(savedOrder.orderNumber),'the receipt must include the saved order number');
    assert.match(receiptHtml,/ESP32-WROOM-32D/);
    assert.match(receiptHtml,/Qty 4/);
    assert.match(receiptHtml,/6\.500 KWD/);
    assert.match(await page.getByTestId('button-print-demo-receipt').innerText(),/Print receipt/);

    await page.goto(`${baseUrl}/cart`);
    await page.getByTestId('link-empty-cart-components').waitFor();
    assert.equal(await page.locator('[data-testid^="row-cart-"]').count(), 0);

    await page.goto(`${baseUrl}/build-assist`);
    await page.getByTestId('row-bom-esp32').waitFor();
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '1.625 KWD');
    await page.getByTestId('button-add-bom-cart').click();
    await page.getByTestId('link-cart').click();
    const supplierPricedCartRow = page.getByTestId('row-cart-bom-esp32');
    await supplierPricedCartRow.waitFor();
    assert.equal(await supplierPricedCartRow.locator('.price').innerText(), '1.625 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '1.625 KWD');

    await page.goto(`${baseUrl}/build-assist`);
    await page.getByTestId('row-bom-esp32').waitFor();
    const previewBeforePriceListRemoval = await page.locator('.assist-output-head p').innerText();
    await page.getByTestId('button-generate-bom').click();
    assert.notEqual(await page.locator('.assist-output-head p').innerText(), previewBeforePriceListRemoval);
    await page.getByTestId('summary-price-list').click();
    await page.getByTestId('button-remove-price-list').click();
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '—');
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '—');
    assert.match(await page.getByTestId('text-price-source').innerText(), /No current price list loaded/);
    assert.equal(await page.locator('.assist-output-head p').innerText(), previewBeforePriceListRemoval);
    assert.match(await page.getByTestId('status-build-assist').innerText(), /Price list removed/);
    assert.match(await page.getByTestId('status-build-assist').innerText(), /1 supplier-priced BOM cart item/);
    assert.match(await page.getByTestId('button-generate-bom').innerText(), /Generate local demo BOM/);
    await page.waitForFunction((key) => localStorage.getItem(key) === null, priceListStorageKey);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]')),
      [],
      'removing the list should not retain its copied price in the saved cart',
    );

    await page.goto(`${baseUrl}/cart`);
    await page.getByTestId('link-empty-cart-components').waitFor();
    assert.equal(await page.locator('[data-testid^="row-cart-"]').count(), 0);
    assert.equal(await page.locator('.summary-card .summary-total').count(), 0);

    await page.goto(`${baseUrl}/build-assist`);
    await page.reload();
    await page.getByTestId('row-bom-esp32').waitFor();
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '6.000 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Illustrative catalog prices/);
    assert.equal(await page.getByTestId('button-remove-price-list').count(), 0);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('reports rejected supplier price imports without replacing saved prices', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/build-assist`);
    await page.getByTestId('row-bom-esp32').waitFor();

    const savedPriceList = {
      pricesBySku: { 'ESP32-WRM-32D': 1.625 },
      source: 'Verified supplier list',
      updatedAt: dateDaysAgo(freshnessPeriodDays),
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: priceListStorageKey,
      value: savedPriceList,
    });
    await page.reload();
    await page.getByTestId('summary-price-list').click();
    await page.getByTestId('input-price-list-source').fill('Replacement supplier');
    await page.getByTestId('input-price-list-updated').fill(dateDaysAgo(0));
    await page.getByTestId('input-price-list-file').setInputFiles({
      name: 'invalid-prices.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('product,cost\nESP32-WRM-32D,9.990\n'),
    });
    await page.getByTestId('button-import-price-csv').click();
    const importError = page.getByTestId('error-price-list-import');
    await importError.waitFor();
    assert.match(await importError.innerText(), /CSV could not be imported/);
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey),
      savedPriceList,
      'a rejected CSV must not replace saved supplier prices',
    );
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '1.625 KWD');

    await page.getByTestId('input-price-list-source').fill('');
    await page.getByTestId('button-import-price-csv').click();
    assert.match(await importError.innerText(), /Enter a source and last-updated date/);
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey),
      savedPriceList,
      'missing supplier source must not replace saved prices',
    );

    await page.getByTestId('input-price-list-source').fill('Replacement supplier');
    await page.getByTestId('input-price-list-updated').fill('');
    await page.getByTestId('button-import-price-csv').click();
    assert.match(await importError.innerText(), /Enter a source and last-updated date/);
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey),
      savedPriceList,
      'missing update date must not replace saved prices',
    );
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('uses a saved zero-cost price-list entry and keeps the BOM item in the cart', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/build-assist`);
    const savedPriceList = {
      pricesBySku: { 'SNS-SOIL-CAP-12': 0 },
      source: 'Free parts supplier',
      updatedAt: dateDaysAgo(0),
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: priceListStorageKey,
      value: savedPriceList,
    });
    await page.reload();
    assert.equal(await page.getByTestId('details-price-list').evaluate((details) => details.open), false);
    await page.getByTestId('summary-price-list').click();
    assert.match(await page.getByTestId('summary-price-list').innerText(), /Free parts supplier/);
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('row-bom-esp32').waitFor();

    assert.equal(await page.getByTestId('text-unpriced-soil').count(), 0);
    assert.equal(await page.getByTestId('text-line-total-soil').innerText(), '0.000 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '0.000 KWD');
    assert.deepEqual(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey),
      savedPriceList,
    );

    await page.getByTestId('button-add-bom-cart').click();
    await page.getByTestId('link-cart').click();
    const zeroCostCartRow = page.getByTestId('row-cart-bom-soil');
    await zeroCostCartRow.waitFor();
    assert.equal(await zeroCostCartRow.count(), 1);
    assert.equal(await zeroCostCartRow.locator('.price').innerText(), '0.000 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '0.000 KWD');
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('recovers from malformed saved cart data and keeps valid cart entries unchanged', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/cart`);
    await page.evaluate(() => localStorage.setItem('circuits-kw-cart', '{malformed json'));
    await page.reload();
    await page.getByTestId('link-empty-cart-components').waitFor();
    assert.equal(await page.locator('[data-testid^="row-cart-"]').count(), 0);

    await page.evaluate(() => localStorage.setItem('circuits-kw-cart', JSON.stringify({ items: [] })));
    await page.reload();
    await page.getByTestId('link-empty-cart-components').waitFor();
    assert.equal(await page.locator('[data-testid^="row-cart-"]').count(), 0);

    const validCart = [{
      id: 'valid-cart-item',
      name: 'Saved component',
      price: 1.25,
      kind: 'component',
      sku: 'SAVED-001',
      qty: 3,
    }];
    await page.evaluate((items) => localStorage.setItem('circuits-kw-cart', JSON.stringify(items)), [
      ...validCart,
      { id: 'invalid-cart-item', name: 'Missing cart fields' },
    ]);
    await page.reload();
    const restoredRow = page.getByTestId('row-cart-valid-cart-item');
    await restoredRow.waitFor();
    assert.equal(await restoredRow.locator('.price').innerText(), '3.750 KWD');
    assert.equal(await page.getByTestId('input-quantity-valid-cart-item').inputValue(), '3');
    assert.equal(await page.getByTestId('row-cart-invalid-cart-item').count(), 0);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('circuits-kw-cart'))), validCart);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('keeps cart interactions usable when browser storage reads or writes fail', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const readFailurePage = await browser.newPage();
    const readFailureErrors = [];
    readFailurePage.on('pageerror', (error) => readFailureErrors.push(error.message));
    await readFailurePage.addInitScript(() => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (key === 'circuits-kw-cart') {
          throw new DOMException('Cart storage is unavailable', 'SecurityError');
        }
        return originalGetItem.call(this, key);
      };
    });
    await readFailurePage.goto(`${baseUrl}/cart`);
    await readFailurePage.getByTestId('cart-storage-warning').waitFor();
    await readFailurePage.getByTestId('link-empty-cart-components').click();
    await readFailurePage.getByTestId('button-add-esp32').click();
    await readFailurePage.getByTestId('link-cart').click();
    const addedRow = readFailurePage.getByTestId('row-cart-esp32');
    await addedRow.waitFor();
    await readFailurePage.getByTestId('button-increase-esp32').click();
    assert.equal(await readFailurePage.getByTestId('input-quantity-esp32').inputValue(), '2');
    await readFailurePage.getByTestId('cart-storage-warning').waitFor();
    assert.deepEqual(readFailureErrors, []);

    const writeFailurePage = await browser.newPage();
    const writeFailureErrors = [];
    writeFailurePage.on('pageerror', (error) => writeFailureErrors.push(error.message));
    await writeFailurePage.addInitScript((items) => {
      localStorage.setItem('circuits-kw-cart', JSON.stringify(items));
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'circuits-kw-cart') {
          throw new DOMException('Cart storage is full', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      };
    }, [{
      id: 'storage-test-item',
      name: 'Storage test component',
      price: 2,
      kind: 'component',
      sku: 'STORAGE-001',
      qty: 1,
    }]);
    await writeFailurePage.goto(`${baseUrl}/cart`);
    await writeFailurePage.getByTestId('cart-storage-warning').waitFor();
    const savedRow = writeFailurePage.getByTestId('row-cart-storage-test-item');
    await savedRow.waitFor();
    await writeFailurePage.getByTestId('button-increase-storage-test-item').click();
    assert.equal(await writeFailurePage.getByTestId('input-quantity-storage-test-item').inputValue(), '2');
    assert.equal(await savedRow.locator('.price').innerText(), '4.000 KWD');
    assert.deepEqual(writeFailureErrors, []);

    const priceListWriteFailurePage = await browser.newPage();
    const priceListWriteFailureErrors = [];
    priceListWriteFailurePage.on('pageerror', (error) => priceListWriteFailureErrors.push(error.message));
    await priceListWriteFailurePage.addInitScript((key) => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (storageKey, value) {
        if (storageKey === key) throw new DOMException('Storage is full', 'QuotaExceededError');
        return originalSetItem.call(this, storageKey, value);
      };
    }, priceListStorageKey);
    await priceListWriteFailurePage.goto(`${baseUrl}/build-assist`);
    await priceListWriteFailurePage.getByTestId('summary-price-list').click();
    await priceListWriteFailurePage.getByTestId('input-price-list-source').fill('In-memory supplier');
    await priceListWriteFailurePage.getByTestId('input-price-list-updated').fill(dateDaysAgo(0));
    await priceListWriteFailurePage.getByTestId('input-price-list-file').setInputFiles({
      name: 'supplier-prices.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('sku,price,currency\nESP32-WRM-32D,1.625,KWD\n'),
    });
    await priceListWriteFailurePage.getByTestId('button-import-price-csv').click();
    await priceListWriteFailurePage.getByTestId('status-build-assist').waitFor();
    assert.match(
      await priceListWriteFailurePage.getByTestId('status-build-assist').innerText(),
      /browser storage rejected the save.*not be available after refresh/i,
    );
    assert.match(await priceListWriteFailurePage.getByTestId('text-price-source').innerText(), /In-memory supplier/);
    assert.equal(await priceListWriteFailurePage.getByTestId('text-line-total-esp32').innerText(), '1.625 KWD');
    await priceListWriteFailurePage.getByTestId('input-part-quantity-esp32').fill('2');
    assert.equal(await priceListWriteFailurePage.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    await priceListWriteFailurePage.getByTestId('button-generate-bom').click();
    assert.match(await priceListWriteFailurePage.getByTestId('status-build-assist').innerText(), /Estimate recalculated/);
    assert.deepEqual(priceListWriteFailureErrors, []);

    const priceListRemoveFailurePage = await browser.newPage();
    const priceListRemoveFailureErrors = [];
    priceListRemoveFailurePage.on('pageerror', (error) => priceListRemoveFailureErrors.push(error.message));
    await priceListRemoveFailurePage.addInitScript(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (storageKey) {
        if (storageKey === key) throw new DOMException('Storage is unavailable', 'SecurityError');
        return originalRemoveItem.call(this, storageKey);
      };
    }, {
      key: priceListStorageKey,
      value: {
        pricesBySku: { 'ESP32-WRM-32D': 1.625 },
        source: 'Stored supplier',
        updatedAt: dateDaysAgo(0),
      },
    });
    await priceListRemoveFailurePage.goto(`${baseUrl}/build-assist`);
    await priceListRemoveFailurePage.getByTestId('summary-price-list').click();
    await priceListRemoveFailurePage.getByTestId('button-remove-price-list').click();
    assert.match(
      await priceListRemoveFailurePage.getByTestId('status-build-assist').innerText(),
      /removed from this estimate.*browser storage rejected the removal.*may return after refresh/i,
    );
    assert.equal(await priceListRemoveFailurePage.getByTestId('text-build-assist-total').innerText(), '—');
    assert.match(
      await priceListRemoveFailurePage.getByTestId('text-price-source').innerText(),
      /No current price list loaded/,
    );
    await priceListRemoveFailurePage.getByTestId('input-assembly-count').fill('2');
    await priceListRemoveFailurePage.getByTestId('input-part-quantity-esp32').fill('3');
    assert.equal(await priceListRemoveFailurePage.getByTestId('input-assembly-count').inputValue(), '2');
    assert.equal(await priceListRemoveFailurePage.getByTestId('input-part-quantity-esp32').inputValue(), '3');
    assert.deepEqual(priceListRemoveFailureErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('syncs cart quantity edits and item removal across open tabs', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  let context;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    context = await browser.newContext();
    const firstTab = await context.newPage();
    const secondTab = await context.newPage();
    const pageErrors = [];
    firstTab.on('pageerror', (error) => pageErrors.push(error.message));
    secondTab.on('pageerror', (error) => pageErrors.push(error.message));
    const startingCart = [
      { id: 'sync-item-one', name: 'First sync component', price: 2.5, kind: 'component', sku: 'SYNC-001', qty: 1 },
      { id: 'sync-item-two', name: 'Second sync component', price: 1, kind: 'component', sku: 'SYNC-002', qty: 2 },
    ];

    await firstTab.goto(`${baseUrl}/cart`);
    await firstTab.evaluate((items) => localStorage.setItem('circuits-kw-cart', JSON.stringify(items)), startingCart);
    await firstTab.reload();
    await firstTab.getByTestId('row-cart-sync-item-one').waitFor();
    await secondTab.goto(`${baseUrl}/cart`);
    await secondTab.getByTestId('row-cart-sync-item-one').waitFor();

    await firstTab.getByTestId('button-increase-sync-item-one').click();
    await secondTab.waitForFunction(() => document.querySelector('[data-testid="input-quantity-sync-item-one"]')?.value === '2');
    await secondTab.waitForFunction(() => document.querySelector('.summary-card .summary-total')?.textContent?.includes('7.000 KWD'));
    assert.equal(await secondTab.getByTestId('row-cart-sync-item-one').locator('.price').innerText(), '5.000 KWD');

    await firstTab.getByTestId('button-remove-sync-item-two').click();
    await secondTab.getByTestId('row-cart-sync-item-two').waitFor({ state: 'detached' });
    await secondTab.waitForFunction(() => document.querySelector('.summary-card .summary-total')?.textContent?.includes('5.000 KWD'));
    assert.equal(await secondTab.getByTestId('row-cart-sync-item-one').locator('.price').innerText(), '5.000 KWD');
    assert.match(await secondTab.locator('.summary-line').nth(0).innerText(), /Items\s*2/);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await context?.close();
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('merges concurrent cart additions and edits across tabs without changing the saved-value conflict rule', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  const contexts = [];
  const startingCart = [
    { id: 'race-item-one', name: 'First race component', price: 2.5, kind: 'component', sku: 'RACE-001', qty: 1 },
    { id: 'race-item-two', name: 'Second race component', price: 1, kind: 'component', sku: 'RACE-002', qty: 2 },
  ];
  const delayStorageEvents = async (context, initialItems = startingCart) => {
    await context.addInitScript((initialItems) => {
      localStorage.setItem('circuits-kw-cart', JSON.stringify(initialItems));
      const cartListeners = [];
      const originalAddEventListener = window.addEventListener.bind(window);
      window.addEventListener = function (type, listener, options) {
        if (type === 'storage' && typeof listener === 'function'
          && String(listener).includes('circuits-kw-cart')) {
          cartListeners.push(listener);
          return;
        }
        return originalAddEventListener(type, listener, options);
      };
      window.flushCartStorageEvents = () => {
        const event = new StorageEvent('storage', {
          key: 'circuits-kw-cart',
          newValue: localStorage.getItem('circuits-kw-cart'),
        });
        cartListeners.forEach((listener) => listener.call(window, event));
      };
    }, initialItems);
  };

  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const differentItemsContext = await browser.newContext();
    contexts.push(differentItemsContext);
    await delayStorageEvents(differentItemsContext);
    const firstTab = await differentItemsContext.newPage();
    const secondTab = await differentItemsContext.newPage();
    const pageErrors = [];
    firstTab.on('pageerror', (error) => pageErrors.push(error.message));
    secondTab.on('pageerror', (error) => pageErrors.push(error.message));
    await firstTab.goto(`${baseUrl}/cart`);
    await firstTab.getByTestId('row-cart-race-item-one').waitFor();
    await secondTab.goto(`${baseUrl}/cart`);
    await secondTab.getByTestId('row-cart-race-item-two').waitFor();

    await firstTab.getByTestId('button-increase-race-item-one').click();
    await firstTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'race-item-one')?.qty === 2;
    });
    await secondTab.getByTestId('button-increase-race-item-two').click();
    await secondTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'race-item-one')?.qty === 2
        && cart.find((item) => item.id === 'race-item-two')?.qty === 3;
    });

    await Promise.all([
      firstTab.evaluate(() => window.flushCartStorageEvents()),
      secondTab.evaluate(() => window.flushCartStorageEvents()),
    ]);
    for (const page of [firstTab, secondTab]) {
      assert.equal(await page.getByTestId('input-quantity-race-item-one').inputValue(), '2');
      assert.equal(await page.getByTestId('input-quantity-race-item-two').inputValue(), '3');
    }
    const cartUpdateNotice = firstTab.getByTestId('cart-add-feedback');
    await cartUpdateNotice.waitFor();
    assert.equal(await cartUpdateNotice.getAttribute('role'), 'status');
    assert.equal(await cartUpdateNotice.getAttribute('aria-live'), 'polite');
    assert.match(await cartUpdateNotice.innerText(), /Cart updated in another tab/);
    await firstTab.getByTestId('button-increase-race-item-two').click();
    assert.equal(await firstTab.getByTestId('input-quantity-race-item-two').inputValue(), '4');
    assert.deepEqual(pageErrors, []);
    await differentItemsContext.close();

    const sameItemContext = await browser.newContext();
    contexts.push(sameItemContext);
    await delayStorageEvents(sameItemContext);
    const earlierTab = await sameItemContext.newPage();
    const laterTab = await sameItemContext.newPage();
    earlierTab.on('pageerror', (error) => pageErrors.push(error.message));
    laterTab.on('pageerror', (error) => pageErrors.push(error.message));
    await earlierTab.goto(`${baseUrl}/cart`);
    await earlierTab.getByTestId('row-cart-race-item-one').waitFor();
    await laterTab.goto(`${baseUrl}/cart`);
    await laterTab.getByTestId('row-cart-race-item-one').waitFor();

    await earlierTab.getByTestId('input-quantity-race-item-one').fill('3');
    await earlierTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'race-item-one')?.qty === 3;
    });
    await laterTab.getByTestId('input-quantity-race-item-one').fill('4');
    await laterTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'race-item-one')?.qty === 3;
    });
    await Promise.all([
      earlierTab.evaluate(() => window.flushCartStorageEvents()),
      laterTab.evaluate(() => window.flushCartStorageEvents()),
    ]);
    assert.equal(await earlierTab.getByTestId('input-quantity-race-item-one').inputValue(), '3');
    assert.equal(await laterTab.getByTestId('input-quantity-race-item-one').inputValue(), '3');

    const clearRaceContext = await browser.newContext();
    contexts.push(clearRaceContext);
    await delayStorageEvents(clearRaceContext);
    const clearingTab = await clearRaceContext.newPage();
    const editingTab = await clearRaceContext.newPage();
    clearingTab.on('pageerror', (error) => pageErrors.push(error.message));
    editingTab.on('pageerror', (error) => pageErrors.push(error.message));
    await clearingTab.goto(`${baseUrl}/cart`);
    await clearingTab.getByTestId('row-cart-race-item-one').waitFor();
    await editingTab.goto(`${baseUrl}/cart`);
    await editingTab.getByTestId('row-cart-race-item-one').waitFor();

    // A stale quantity edit is already saved when the other tab clears.
    await editingTab.getByTestId('button-increase-race-item-one').click();
    await editingTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'race-item-one')?.qty === 2;
    });
    await clearingTab.getByTestId('button-clear-cart').click();
    await clearingTab.waitForFunction(() => localStorage.getItem('circuits-kw-cart') === '[]');
    await Promise.all([
      clearingTab.evaluate(() => window.flushCartStorageEvents()),
      editingTab.evaluate(() => window.flushCartStorageEvents()),
    ]);
    for (const page of [clearingTab, editingTab]) {
      await page.getByTestId('link-empty-cart-components').waitFor();
      assert.equal(await page.locator('[data-testid^="row-cart-race-item-"]').count(), 0);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]')), []);
    }

    // Clear first, then make a quantity edit from the still-stale second tab.
    await clearingTab.reload();
    await clearingTab.getByTestId('row-cart-race-item-one').waitFor();
    await editingTab.reload();
    await editingTab.getByTestId('row-cart-race-item-one').waitFor();
    await clearingTab.getByTestId('button-clear-cart').click();
    await clearingTab.waitForFunction(() => localStorage.getItem('circuits-kw-cart') === '[]');
    await editingTab.getByTestId('button-increase-race-item-one').click();
    await editingTab.getByTestId('link-empty-cart-components').waitFor();
    await Promise.all([
      clearingTab.evaluate(() => window.flushCartStorageEvents()),
      editingTab.evaluate(() => window.flushCartStorageEvents()),
    ]);
    for (const page of [clearingTab, editingTab]) {
      await page.getByTestId('link-empty-cart-components').waitFor();
      assert.equal(await page.locator('[data-testid^="row-cart-race-item-"]').count(), 0);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]')), []);
    }

    const additionsContext = await browser.newContext();
    contexts.push(additionsContext);
    await installApiMocks(additionsContext);
    await delayStorageEvents(additionsContext, [
      { id: 'esp32', name: 'ESP32-WROOM-32D', price: 2.85, kind: 'component', sku: 'ESP32-WRM-32D', qty: 1 },
    ]);
    const firstAddingTab = await additionsContext.newPage();
    const secondAddingTab = await additionsContext.newPage();
    firstAddingTab.on('pageerror', (error) => pageErrors.push(error.message));
    secondAddingTab.on('pageerror', (error) => pageErrors.push(error.message));
    await firstAddingTab.goto(`${baseUrl}/components`);
    await firstAddingTab.getByTestId('button-add-esp32').waitFor();
    await secondAddingTab.goto(`${baseUrl}/components`);
    await secondAddingTab.getByTestId('button-add-esp32').waitFor();

    await firstAddingTab.getByTestId('button-add-esp32').click();
    await firstAddingTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'esp32')?.qty === 2;
    });
    await secondAddingTab.getByTestId('button-add-esp32').click();
    await secondAddingTab.waitForFunction(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return cart.find((item) => item.id === 'esp32')?.qty === 3;
    });
    await Promise.all([
      firstAddingTab.evaluate(() => window.flushCartStorageEvents()),
      secondAddingTab.evaluate(() => window.flushCartStorageEvents()),
    ]);
    await firstAddingTab.getByTestId('link-cart').click();
    await secondAddingTab.getByTestId('link-cart').click();
    for (const page of [firstAddingTab, secondAddingTab]) {
      try {
        await page.getByTestId('row-cart-esp32').waitFor({ timeout: 10_000 });
      } catch {
        const state = await page.evaluate(() => ({
          url: location.href,
          cart: localStorage.getItem('circuits-kw-cart'),
          text: document.body.innerText,
        }));
        assert.fail(`The merged item was not shown in the cart: ${JSON.stringify(state)}`);
      }
      assert.equal(await page.getByTestId('input-quantity-esp32').inputValue(), '3');
    }
    assert.equal(await firstAddingTab.evaluate(() => {
      const cart = JSON.parse(localStorage.getItem('circuits-kw-cart') || '[]');
      return Object.keys(cart.find((item) => item.id === 'esp32')?.cartAddOperations ?? {}).length;
    }), 2);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});

test('saves demo orders through the order API when browser order-history storage is unavailable', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  const contexts = [];
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    for (const rejectedOperation of ['read', 'write']) {
      const context = await browser.newContext();
      contexts.push(context);
      await context.addInitScript(({ shouldThrow }) => {
        window.demoAnalyticsEvents = [];
        window.umami = {
          track(name, data) {
            if (shouldThrow) throw new Error('Analytics is unavailable.');
            window.demoAnalyticsEvents.push({ name, data });
          },
        };
      }, { shouldThrow: rejectedOperation === 'write' });
      await context.addInitScript(({ operation, item }) => {
        const originalGetItem = Storage.prototype.getItem;
        const originalSetItem = Storage.prototype.setItem;
        originalSetItem.call(localStorage, 'circuits-kw-cart', JSON.stringify([item]));
        window.readOriginalStorageItem = (key) => originalGetItem.call(localStorage, key);
        Storage.prototype.getItem = function (key) {
          if (key === 'circuits-kw-demo-orders' && operation === 'read') {
            throw new DOMException('Order history read rejected.', 'SecurityError');
          }
          return originalGetItem.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === 'circuits-kw-demo-orders' && operation === 'write') {
            throw new DOMException('Order history write rejected.', 'QuotaExceededError');
          }
          return originalSetItem.call(this, key, value);
        };
      }, {
        operation: rejectedOperation,
        item: { id: 'storage-failure-item', name: 'Storage failure test item', price: 2.5, kind: 'component', sku: 'STORAGE-001', qty: 2 },
      });

      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`${baseUrl}/checkout`);
      await page.getByTestId('row-checkout-storage-failure-item').waitFor();
      await page.getByTestId('input-checkout-name').fill('Demo Buyer');
      await page.getByTestId('input-checkout-email').fill('buyer@example.com');
      await page.getByTestId('input-checkout-phone').fill('+965 5555 5555');
      await page.getByTestId('select-checkout-governorate').selectOption({ label: 'Capital' });
      await page.getByTestId('input-checkout-area').fill('Kuwait City');
      await page.getByTestId('input-checkout-block').fill('1');
      await page.getByTestId('input-checkout-street').fill('Main Street');
      await page.getByTestId('input-checkout-building').fill('10');
      await page.getByTestId('button-place-demo-order').click();

      await page.getByTestId('demo-order-confirmation').waitFor();
      assert.match(await page.getByRole('heading', { name: 'Order placed.' }).innerText(), /Order placed/);
      assert.match(
        await page.getByTestId('text-order-storage-status').innerText(),
        /Saved for demo order management/i,
      );
      assert.match(await page.getByTestId('text-demo-order-number').innerText(), /^CKW-MOCK-/);
      const analyticsEvents = await page.evaluate(() => window.demoAnalyticsEvents);
      if (rejectedOperation === 'read') {
        assert.deepEqual(analyticsEvents, [{
          name: 'demo_order_completed',
          data: { line_count: 1, subtotal_kwd: 5 },
        }]);
      } else {
        assert.deepEqual(analyticsEvents, [], 'a tracker exception must not block checkout');
      }
      assert.deepEqual(pageErrors, []);
      assert.equal(await page.evaluate(() => window.readOriginalStorageItem('circuits-kw-demo-orders')), null);
      assert.equal(await page.evaluate(() => JSON.parse(window.readOriginalStorageItem('circuits-kw-cart') || '[]').length), 0);
    }

    const failedOrderContext = await browser.newContext();
    contexts.push(failedOrderContext);
    await failedOrderContext.addInitScript(() => {
      localStorage.setItem('circuits-kw-cart', JSON.stringify([{
        id: 'failed-order-item',
        name: 'Failed order test item',
        price: 2.5,
        kind: 'component',
        sku: 'FAILED-001',
        qty: 2,
      }]));
      window.demoAnalyticsEvents = [];
      window.umami = {
        track(name, data) {
          window.demoAnalyticsEvents.push({ name, data });
        },
      };
    });
    const failedOrderPage = await failedOrderContext.newPage();
    const failedOrderPageErrors = [];
    failedOrderPage.on('pageerror', error => failedOrderPageErrors.push(error.message));
    await failedOrderPage.route('**/api/orders', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'orders_unavailable' }),
    }));
    await failedOrderPage.goto(`${baseUrl}/checkout`);
    await failedOrderPage.getByTestId('row-checkout-failed-order-item').waitFor();
    await failedOrderPage.getByTestId('input-checkout-name').fill('Demo Buyer');
    await failedOrderPage.getByTestId('input-checkout-email').fill('buyer@example.com');
    await failedOrderPage.getByTestId('input-checkout-phone').fill('+965 5555 5555');
    await failedOrderPage.getByTestId('select-checkout-governorate').selectOption({ label: 'Capital' });
    await failedOrderPage.getByTestId('input-checkout-area').fill('Kuwait City');
    await failedOrderPage.getByTestId('input-checkout-block').fill('1');
    await failedOrderPage.getByTestId('input-checkout-street').fill('Main Street');
    await failedOrderPage.getByTestId('input-checkout-building').fill('10');
    await failedOrderPage.getByTestId('button-place-demo-order').click();
    await failedOrderPage.getByTestId('checkout-order-error').waitFor();
    assert.equal(await failedOrderPage.getByTestId('demo-order-confirmation').count(), 0);
    assert.deepEqual(await failedOrderPage.evaluate(() => window.demoAnalyticsEvents), []);
    assert.deepEqual(failedOrderPageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
  }
});
