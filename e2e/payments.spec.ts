import type { Page } from '@playwright/test';

import { B, createGroup, createSession, errorsOf, expect, FIXTURES, joinGroup, L, newPlayer, sql, T, test, uid } from './helpers';

async function enablePrepay(page: Page, esewaId = '9801234567') {
  await T(page, /Players pay at the court/).click();
  await T(page, 'To confirm a spot', true).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), B(page, 'Upload eSewa QR').click()]);
  await chooser.setFiles(FIXTURES.qr);
  await expect(page.getByRole('img', { name: 'eSewa QR code' }).filter({ visible: true }).first()).toBeVisible();
  await L(page, 'eSewa ID (phone)').fill(esewaId);
  await B(page, 'Save payment settings').click();
  await expect(T(page, 'Players pay to confirm their spot · QR added')).toBeVisible();
}

test.describe('Payments', () => {
  test('pay to confirm: hold, claim with screenshot, reject, resubmit, confirm', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Prepay');
    const code = await createGroup(org.page, `Prepay ${uid()}`);
    await enablePrepay(org.page);
    const location = `Paid court ${uid()}`;
    await createSession(org.page, { location, capacity: 1, fee: 500 });
    await expect(T(org.page, 'Pay to confirm', true)).toBeVisible();

    const p = await newPlayer(browser, 'Asha Payer');
    await joinGroup(p.page, code);
    await T(p.page, location).click();
    await B(p.page, 'Hold my spot · pay Rs 500').click();
    await expect(T(p.page, 'Pay Rs 500 to confirm')).toBeVisible();
    await expect(T(p.page, /^Held \d+:\d{2}$/)).toBeVisible();
    await expect(T(p.page, 'eSewa ID: 9801234567')).toBeVisible();

    // Validation: no reference and no screenshot
    await B(p.page, "I've paid").click();
    await expect(T(p.page, /Add the transaction ID from your eSewa\/Khalti receipt/)).toBeVisible();

    await L(p.page, 'Transaction ID').fill('WRONG123');
    await B(p.page, "I've paid").click();
    await expect(T(p.page, 'Verifying', true)).toBeVisible();

    // A held spot counts as taken for others
    const q = await newPlayer(browser, 'Quinn Late');
    await joinGroup(q.page, code);
    await expect(T(q.page, /Full · 0 waiting/)).toBeVisible();

    // Organizer rejects with a note
    await T(org.page, location).click();
    await expect(T(org.page, '1 payment to verify')).toBeVisible();
    await B(org.page, 'Review').click();
    await expect(T(org.page, 'WRONG123')).toBeVisible();
    await L(org.page, 'Note (shown to player if rejected)').fill('No such transaction');
    await B(org.page, 'Reject').click();

    // Player sees the note live, resubmits with a screenshot
    await expect(T(p.page, /No such transaction/)).toBeVisible();
    await L(p.page, 'Transaction ID').fill('0007ABCD1');
    const [chooser] = await Promise.all([p.page.waitForEvent('filechooser'), B(p.page, 'Attach screenshot (optional)').click()]);
    await chooser.setFiles(FIXTURES.receipt);
    await expect(B(p.page, 'Screenshot attached ✓')).toBeVisible();
    await B(p.page, "I've paid").click();
    await expect(T(p.page, 'Verifying', true)).toBeVisible();

    // Organizer confirms after checking the screenshot
    await B(org.page, 'Review').click();
    await expect(org.page.getByLabel('Payment screenshot').filter({ visible: true }).first()).toBeVisible();
    await B(org.page, 'Confirm paid').click();
    await expect(T(org.page, 'Paid · eSewa')).toBeVisible();

    await expect(T(p.page, "You're in")).toBeVisible();
    await expect(T(p.page, 'Paid', true)).toBeVisible();

    // Other members never see someone else's payment state
    await T(q.page, location).click();
    await expect(q.page.getByText(/Paid · |To verify|Unpaid/).filter({ visible: true })).toHaveCount(0);

    for (const x of [org, p, q]) expect(errorsOf(x.page)).toEqual([]);
  });

  test('pay to confirm: expired hold releases the spot to the waitlist', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Expire');
    const code = await createGroup(org.page, `Expire ${uid()}`);
    await enablePrepay(org.page);
    const location = `Expire court ${uid()}`;
    await createSession(org.page, { location, capacity: 1, fee: 300 });

    const a = await newPlayer(browser, 'Anil Holder');
    await joinGroup(a.page, code);
    await T(a.page, location).click();
    await B(a.page, 'Hold my spot · pay Rs 300').click();
    await expect(T(a.page, /^Held /)).toBeVisible();

    const b = await newPlayer(browser, 'Binu Next');
    await joinGroup(b.page, code);
    await T(b.page, location).click();
    await B(b.page, /Join waitlist/).click();
    await expect(T(b.page, "You're #1 on the waitlist")).toBeVisible();

    // Time-travel the hold and run the cron job body
    sql(`update public.bookings b set hold_expires_at = now() - interval '1 minute' from public.sessions s where s.id = b.session_id and s.location = '${location}' and b.status = 'pending_payment'`);
    expect(sql('select private.expire_holds()')).toBe('1');

    // Both screens update live
    await expect(B(a.page, 'Hold my spot · pay Rs 300').or(B(a.page, /Join waitlist/))).toBeVisible();
    await expect(T(b.page, 'Pay Rs 300 to confirm')).toBeVisible();
  });

  test('pay at court: organizer marks cash, player sees it, undo works', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Court');
    const code = await createGroup(org.page, `Court pay ${uid()}`);
    const location = `Cash court ${uid()}`;
    await createSession(org.page, { location, fee: 300 });

    const p = await newPlayer(browser, 'Prakash Cash');
    await joinGroup(p.page, code);
    await T(p.page, location).click();
    await B(p.page, 'Book my spot · Rs 300').click();
    await expect(T(p.page, "You're in")).toBeVisible();
    await expect(T(p.page, 'Fee Rs 300')).toBeVisible();
    await expect(T(p.page, 'Unpaid', true)).toBeVisible();

    await T(org.page, location).click();
    await expect(T(org.page, 'Playing · 1 · 0 paid')).toBeVisible();
    await B(org.page, 'Payment', true).click();
    await B(org.page, 'Paid · Cash').click();
    await expect(T(org.page, 'Playing · 1 · 1 paid')).toBeVisible();
    await expect(T(p.page, 'Paid', true)).toBeVisible(); // live

    await B(org.page, 'Payment', true).click();
    await B(org.page, 'Undo payment').click();
    await expect(T(org.page, 'Playing · 1 · 0 paid')).toBeVisible();
    await expect(T(p.page, 'Unpaid', true)).toBeVisible();
    await expect(T(p.page, "You're in")).toBeVisible(); // spot kept in pay-at-court
  });

  test('free sessions show no payment UI', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Free');
    await createGroup(org.page, `Free ${uid()}`);
    const location = `Free court ${uid()}`;
    await createSession(org.page, { location });
    await T(org.page, location).click();
    await B(org.page, 'Book my spot · Free').click();
    await expect(T(org.page, "You're in")).toBeVisible();
    await expect(org.page.getByText(/Pay now by QR|Unpaid|Fee Rs/).filter({ visible: true })).toHaveCount(0);
  });
});
