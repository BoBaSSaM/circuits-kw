import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import { chromium as playwrightChromium } from 'playwright';

const artifactDir = path.resolve(import.meta.dirname, '..');
const basePath = '/account-flow-test';
const cartItem = {
  id: 'auth-flow-item',
  name: 'Auth flow item',
  price: 2.85,
  kind: 'component',
  sku: 'AUTH-001',
  qty: 2,
};
const savedOrderSnapshot = {
  id: 'saved-order-snapshot',
  orderNumber: 'CKW-SNAPSHOT-001',
  placedAt: '2026-10-15T12:00:00.000Z',
  isDemo: true,
  items: [{
    id: 'archived-component',
    kind: 'component',
    sku: 'ARCHIVED-001',
    name: 'Original archived component',
    price: 1.25,
    qty: 2,
  }],
  subtotal: 2.5,
};

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
      throw new Error(`Next.js exited before it was ready (exit code ${serverProcess.exitCode}).`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Next.js is still starting.
    }
    await delay(250);
  }
  throw new Error(`Next.js did not become ready at ${url} within 30 seconds.`);
}

async function installApiMocks(context) {
  await context.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/api/orders') && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [savedOrderSnapshot] }),
      });
      return;
    }
    if (pathname.endsWith('/api/admin/access')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ role: 'customer' }),
      });
      return;
    }
    if (pathname.endsWith('/api/catalog')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ products: [], kits: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

test('guest checkout, account creation, and sign-in preserve checkout and dashboard destinations at a mounted base path', {
  timeout: 180_000,
}, async () => {
  assert.match(
    process.env.CLERK_PUBLISHABLE_KEY ?? '',
    /^pk_test_/,
    'Account-flow browser checks require a Clerk development/test instance.',
  );
  await clerkSetup();

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}${basePath}`;
  const serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: `${basePath}/`, PORT: String(port), NEXT_DIST_DIR: `.next-browser-test-${port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  let context;
  try {
    await waitForServer(serverProcess, `${baseUrl}/`);
    const executablePath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
    browser = await playwrightChromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    context = await browser.newContext();
    await context.addInitScript((item) => {
      localStorage.setItem('circuits-kw-cart', JSON.stringify([item]));
    }, cartItem);
    await installApiMocks(context);

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/checkout`);
    await page.getByTestId('row-checkout-auth-flow-item').waitFor();
    assert.match(await page.getByTestId('checkout-account-options').innerText(), /Guest checkout is available/);
    assert.equal(
      await page.getByTestId('link-checkout-sign-in').getAttribute('href'),
      `${basePath}/sign-in?returnTo=checkout`,
    );
    assert.equal(
      await page.getByTestId('link-checkout-sign-up').getAttribute('href'),
      `${basePath}/sign-up?returnTo=checkout`,
    );

    const testEmail = `checkout-flow+clerk_test_${randomUUID()}@example.com`;
    const testPassword = `QaPass-${randomUUID()}-A9!`;
    await page.getByTestId('link-checkout-sign-up').click();
    await page.locator('input[name=emailAddress]').waitFor();
    await setupClerkTestingToken({ page });

    for (const [name, value] of [
      ['firstName', 'Checkout'],
      ['lastName', 'Test'],
      ['username', `checkout${randomUUID().replaceAll('-', '').slice(0, 12)}`],
      ['emailAddress', testEmail],
      ['password', testPassword],
      ['phoneNumber', '+12015550100'],
    ]) {
      const input = page.locator(`input[name="${name}"]`);
      if (await input.isVisible().catch(() => false)) await input.fill(value);
    }
    const legalAcceptance = page.locator('input[name="legalAccepted"]');
    if (await legalAcceptance.isVisible().catch(() => false)) await legalAcceptance.check();

    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const verificationCode = page.getByRole('textbox', { name: /verification code/i });
    await verificationCode.waitFor();
    await verificationCode.fill('424242');
    await page.waitForURL((url) => url.pathname === `${basePath}/checkout`, { timeout: 60_000 });
    const checkoutRow = page.getByTestId('row-checkout-auth-flow-item');
    await checkoutRow.waitFor();
    assert.match(await checkoutRow.innerText(), /Qty 2/);
    assert.equal(await page.getByTestId('text-checkout-subtotal').innerText(), '5.700 KWD');

    const accountLink = page.getByTestId('link-account');
    assert.equal(await accountLink.getAttribute('href'), `${basePath}/account`);
    await accountLink.click();
    await page.getByTestId('page-account').waitFor();
    const savedOrderCard = page.getByTestId('account-demo-order-saved-order-snapshot');
    await savedOrderCard.waitFor();
    const savedOrderText = await savedOrderCard.innerText();
    assert.match(savedOrderText, /Original archived component/);
    assert.match(savedOrderText, /Qty 2/);
    assert.match(savedOrderText, /Unit price 1\.250 KWD/);
    assert.match(savedOrderText, /2\.500 KWD/);
    const signOutLink = page.getByTestId('link-sign-out');
    assert.equal(await signOutLink.getAttribute('href'), `${basePath}/sign-out`);
    await signOutLink.click();
    await page.getByTestId('button-confirm-sign-out').waitFor();
    await page.getByTestId('button-confirm-sign-out').click();
    await page.waitForURL((url) => url.pathname === `${basePath}/`, { timeout: 60_000 });

    await page.goto(`${baseUrl}/checkout`);
    await page.getByTestId('row-checkout-auth-flow-item').waitFor();
    await page.getByTestId('link-checkout-sign-in').click();
    const signInIdentifier = page.locator('input[name=identifier]');
    await signInIdentifier.waitFor();
    await signInIdentifier.fill(testEmail);
    await page.locator('input[name=password]').fill(testPassword);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForURL((url) => url.pathname === `${basePath}/checkout`, { timeout: 60_000 });
    await page.getByTestId('row-checkout-auth-flow-item').waitFor();

    await page.goto(`${baseUrl}/account`);
    await page.getByTestId('page-account').waitFor();
    await page.getByTestId('link-sign-out').click();
    await page.getByTestId('button-confirm-sign-out').waitFor();
    await page.getByTestId('button-confirm-sign-out').click();
    await page.waitForURL((url) => url.pathname === `${basePath}/`, { timeout: 60_000 });

    await page.goto(`${baseUrl}/dashboard`);
    await page.getByTestId('link-dashboard-sign-in').waitFor();
    assert.equal(
      await page.getByTestId('link-dashboard-sign-in').getAttribute('href'),
      `${basePath}/sign-in?returnTo=dashboard`,
    );
    await page.getByTestId('link-dashboard-sign-in').click();
    await page.locator('input[name=identifier]').waitFor();
    await page.locator('input[name=identifier]').fill(testEmail);
    await page.locator('input[name=password]').fill(testPassword);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForURL((url) => url.pathname === `${basePath}/dashboard`, { timeout: 60_000 });
    await page.getByRole('heading', { name: 'Admin access required' }).waitFor();

    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nNext.js output:\n${serverOutput}`;
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
