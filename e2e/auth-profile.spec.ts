import { B, errorsOf, expect, goTab, L, latestCode, newPlayer, PH, signIn, T, test, trackErrors, uid } from './helpers';

test.describe('Sign-in', () => {
  test('rejects an invalid email and a wrong code', async ({ page }) => {
    trackErrors(page);
    await page.goto('/');
    await PH(page, 'you@example.com').fill('not-an-email');
    await B(page, 'Email me a code').click();
    await expect(T(page, 'Enter a valid email address.')).toBeVisible();

    const email = `wrong-${uid()}@test.np`;
    await PH(page, 'you@example.com').fill(email);
    await B(page, 'Email me a code').click();
    await expect(PH(page, '123456')).toBeVisible();
    const real = await latestCode(email);
    await PH(page, '123456').fill(real === '000000' ? '111111' : '000000');
    await B(page, 'Sign in', true).click();
    await expect(page.getByRole('alert').filter({ visible: true }).first()).toBeVisible();
    await expect(T(page, 'Sign in', true)).toBeVisible(); // still on the code step

    await PH(page, '123456').fill('12');
    await B(page, 'Sign in', true).click();
    await expect(T(page, 'Enter the 6-digit code from the email.')).toBeVisible();
    expect(errorsOf(page)).toEqual([]);
  });

  test('new player signs up, signs out, and signs back in as the same person', async ({ browser }) => {
    const p = await newPlayer(browser, 'Sita Returning');
    await expect(T(p.page, 'Hi, Sita')).toBeVisible();

    await goTab(p.page, 'Profile');
    await B(p.page, 'Sign out').click();
    await expect(T(p.page, 'Email me a code')).toBeVisible();
    expect(p.dialogs.some((d) => d.includes('Sign out?'))).toBe(true);

    await signIn(p.page, p.email); // no name the second time
    await expect(T(p.page, 'Hi, Sita')).toBeVisible();
    expect(errorsOf(p.page)).toEqual([]);
  });

  test('session survives a page reload', async ({ browser }) => {
    const p = await newPlayer(browser, 'Ram Reload');
    await p.page.reload();
    await expect(T(p.page, 'Hi, Ram')).toBeVisible();
  });
});

test.describe('Profile', () => {
  test('name, skill level and DUPR ID save and persist', async ({ browser }) => {
    const p = await newPlayer(browser, 'Gita Profile');
    await goTab(p.page, 'Profile');
    await expect(B(p.page, 'Save profile')).toBeDisabled();

    await L(p.page, 'Name').fill('X');
    await B(p.page, 'Save profile').click();
    await expect(T(p.page, 'Enter your name (at least 2 characters).')).toBeVisible();

    await L(p.page, 'Name').fill('Gita Sharma');
    await T(p.page, '3.5', true).click();
    await L(p.page, 'DUPR ID (optional)').fill('ab12cd');
    await B(p.page, 'Save profile').click();
    await expect.poll(() => p.dialogs.includes('Profile saved')).toBe(true);

    await p.page.reload();
    await goTab(p.page, 'Profile');
    await expect(L(p.page, 'Name')).toHaveValue('Gita Sharma');
    await expect(L(p.page, 'DUPR ID (optional)')).toHaveValue('AB12CD');
    await expect(p.page.getByRole('radio', { name: '3.5', exact: true }).filter({ visible: true }).first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await goTab(p.page, 'Play');
    await expect(T(p.page, 'Hi, Gita')).toBeVisible();
    expect(errorsOf(p.page)).toEqual([]);
  });

  test('players without a name are prompted to finish their profile', async ({ page }) => {
    trackErrors(page);
    await signIn(page, `noname-${uid()}@test.np`);
    await expect(T(page, 'Finish your profile')).toBeVisible();
    await B(page, 'Edit profile').click();
    await expect(L(page, 'Name')).toBeVisible();
  });
});
