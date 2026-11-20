import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const MAILPIT = 'http://127.0.0.1:55324';
export const FIXTURES = {
  qr: path.join(__dirname, 'fixture-qr.png'),
  receipt: path.join(__dirname, 'fixture-receipt.png'),
};

let counter = 0;
/** Unique suffix so parallel tests never collide. */
export function uid(): string {
  counter += 1;
  return `${Date.now().toString(36)}${process.pid.toString(36)}${counter}`;
}

/** Visible-only locators: React Native Web keeps stacked screens in the DOM. */
export const T = (p: Page, text: string | RegExp, exact?: boolean) =>
  p.getByText(text, { exact }).filter({ visible: true }).first();
export const B = (p: Page, name: string | RegExp, exact?: boolean) =>
  p.getByRole('button', { name, exact }).filter({ visible: true }).first();
export const L = (p: Page, label: string | RegExp) => p.getByLabel(label).filter({ visible: true }).first();
export const PH = (p: Page, placeholder: string) => p.getByPlaceholder(placeholder).filter({ visible: true }).first();

/** Run SQL as postgres against the local stack (for time travel, e.g. expiring a hold). */
export function sql(query: string): string {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_openplay', 'psql', '-U', 'postgres', '-tA', '-c', query], {
    encoding: 'utf8',
  }).trim();
}

export async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      const m = /\b(\d{6})\b/.exec(msg.Text || msg.HTML);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in email for ${email}`);
}

export type Player = { page: Page; email: string; name: string; dialogs: string[] };

/** Contexts opened by newPlayer during the current test; closed automatically afterwards. */
const openContexts: BrowserContext[] = [];

/** New browser context, signed in via the real OTP email flow. */
export async function newPlayer(browser: Browser, name: string, opts: { colorScheme?: 'light' | 'dark' } = {}): Promise<Player> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: opts.colorScheme });
  openContexts.push(context);
  const page = await context.newPage();
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  trackErrors(page);
  const email = `${name.split(' ')[0].toLowerCase()}-${uid()}@test.np`;
  await signIn(page, email, name);
  return { page, email, name, dialogs };
}

export async function signIn(page: Page, email: string, name = '') {
  await page.goto('/');
  await expect(T(page, 'Email me a code')).toBeVisible({ timeout: 30_000 });
  await PH(page, 'you@example.com').fill(email);
  if (name) await PH(page, 'e.g. Asha Gurung').fill(name);
  await B(page, 'Email me a code').click();
  await expect(PH(page, '123456')).toBeVisible();
  await PH(page, '123456').fill(await latestCode(email));
  await B(page, 'Sign in', true).click();
  await expect(T(page, /^(Hi, |Open play)/)).toBeVisible();
}

/** Fail the test on uncaught exceptions and server errors (4xx from RPC validation are expected in some tests). */
const errorsByPage = new WeakMap<Page, string[]>();
export function trackErrors(page: Page) {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}
export function errorsOf(page: Page): string[] {
  return errorsByPage.get(page) ?? [];
}

const TAB_PATH = { Play: '/', Groups: '/groups', Profile: '/profile' } as const;

/** Switch tab; detail screens cover the tab bar, so fall back to the tab's URL. */
export async function goTab(page: Page, tab: keyof typeof TAB_PATH) {
  const button = page.getByRole('tab', { name: tab }).filter({ visible: true }).first();
  if (await button.isVisible()) await button.click();
  else await page.goto(TAB_PATH[tab]);
}

/** Organizer creates a group from the Groups tab; returns its invite code. Leaves the page on the group screen. */
export async function createGroup(page: Page, name: string, opts: { city?: string; isPublic?: boolean } = {}) {
  await goTab(page, 'Groups');
  await B(page, 'New group').click();
  await PH(page, 'e.g. Jhamsikhel Dinkers').fill(name);
  if (opts.city) await PH(page, 'e.g. Lalitpur').fill(opts.city);
  if (opts.isPublic) await page.getByRole('switch').filter({ visible: true }).first().click();
  await B(page, 'Create group').click();
  await expect(T(page, 'Invite code', true)).toBeVisible();
  return (await page.locator('text=/^[0-9A-F]{6}$/').filter({ visible: true }).first().innerText()).trim();
}

type SessionOpts = { location: string; capacity?: number; courts?: number; fee?: number; time?: string; weeks?: 1 | 4 | 8 | 12 };

/** From a group screen, create a session. Returns to the group screen. */
export async function createSession(page: Page, o: SessionOpts) {
  await B(page, 'New session').click();
  await PH(page, 'e.g. Satdobato Sports Complex, courts 1–4').fill(o.location);
  const courts = o.courts ?? 1;
  for (let i = 4; i > courts; i--) await L(page, 'Decrease Courts').click();
  // Changing courts never lowers capacity, so step the player limit down/up from 16.
  const capacity = o.capacity ?? 16;
  for (let v = 16; v > capacity; v--) await L(page, 'Decrease Max players').click();
  for (let v = 16; v < capacity; v++) await L(page, 'Increase Max players').click();
  if (o.time) await L(page, 'Start (24h)').fill(o.time);
  if (o.fee != null) await L(page, 'Drop-in fee (NPR)').fill(String(o.fee));
  if (o.weeks && o.weeks > 1) await T(page, `${o.weeks} weeks`, true).click();
  await B(page, o.weeks && o.weeks > 1 ? `Create ${o.weeks} sessions` : 'Create session').click();
  await expect(T(page, o.location)).toBeVisible();
}

/** Member joins a group with an invite code from the Groups tab (lands on the group screen). */
export async function joinGroup(page: Page, code: string) {
  await goTab(page, 'Groups');
  await L(page, 'Invite code').fill(code);
  await B(page, 'Join', true).click();
  await expect(T(page, 'Invite code', true)).toBeVisible();
}

/** Every spec imports this `test`: it closes all player contexts after each test so sessions don't pile up. */
export const test = base.extend<{ closePlayers: void }>({
  closePlayers: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      await Promise.all(openContexts.splice(0).map((c) => c.close().catch(() => {})));
    },
    { auto: true },
  ],
});
export { expect };
