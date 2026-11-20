import { B, createGroup, errorsOf, expect, goTab, joinGroup, L, newPlayer, PH, T, test, uid } from './helpers';

test.describe('Groups', () => {
  test('create validation, invite by code (any case) and by link', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Groups');
    await goTab(org.page, 'Groups');
    await B(org.page, 'New group').click();
    await B(org.page, 'Create group').click();
    await expect(T(org.page, 'Give your group a name.')).toBeVisible();
    await org.page.goBack();

    const name = `Patan Picklers ${uid()}`;
    const code = await createGroup(org.page, name, { city: 'Lalitpur' });
    await expect(T(org.page, 'Lalitpur', true)).toBeVisible();

    // Wrong code -> friendly error
    const a = await newPlayer(browser, 'Asha Joiner');
    await goTab(a.page, 'Groups');
    await L(a.page, 'Invite code').fill('ZZZZZZ');
    await B(a.page, 'Join', true).click();
    await expect(T(a.page, 'No group found for that invite code')).toBeVisible();

    // Lowercase code works
    await joinGroup(a.page, code.toLowerCase());
    await expect(T(a.page, name)).toBeVisible();
    await expect(T(a.page, 'Asha Joiner (you)')).toBeVisible();

    // Invite link /join/CODE works
    const b = await newPlayer(browser, 'Bikash Linker');
    await b.page.goto(`/join/${code}`);
    await expect(T(b.page, 'Bikash Linker (you)')).toBeVisible();
    await expect(T(b.page, `Members · 3`)).toBeVisible();

    // Members don't see organizer controls
    await expect(T(b.page, 'Payments', true)).toHaveCount(0);
    await expect(b.page.getByRole('button', { name: 'New session' }).filter({ visible: true })).toHaveCount(0);

    for (const p of [org, a, b]) expect(errorsOf(p.page)).toEqual([]);
  });

  test('public groups are discoverable and joinable without a code', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Public');
    const name = `Open Dinkers ${uid()}`;
    await createGroup(org.page, name, { isPublic: true });
    await expect(T(org.page, 'Public', true)).toBeVisible();

    const p = await newPlayer(browser, 'Puja Public');
    await goTab(p.page, 'Groups');
    const card = p.page.locator('div').filter({ hasText: name }).filter({ has: p.page.getByRole('button', { name: 'Join' }) }).last();
    await card.getByRole('button', { name: 'Join' }).click();
    await expect(T(p.page, 'Puja Public (you)')).toBeVisible();
  });

  test('organizer promotes a co-organizer; members can leave; owner cannot', async ({ browser }) => {
    const org = await newPlayer(browser, 'Owner Olga');
    const code = await createGroup(org.page, `Roles ${uid()}`);
    const m = await newPlayer(browser, 'Mina Member');
    await joinGroup(m.page, code);

    await org.page.reload();
    await B(org.page, 'Make organizer').click();
    await expect(B(org.page, 'Remove organizer')).toBeVisible();

    // The new co-organizer now sees organizer tools
    await m.page.reload();
    await expect(B(m.page, 'New session')).toBeVisible();
    // ...but cannot demote the owner (no button rendered for the owner row)
    await expect(m.page.getByRole('button', { name: /organizer/ }).filter({ visible: true })).toHaveCount(0);

    // Owner has no Leave button
    await expect(org.page.getByRole('button', { name: 'Leave group' }).filter({ visible: true })).toHaveCount(0);

    // Member leaves
    await B(m.page, 'Leave group').click();
    await expect(T(m.page, 'Have an invite code?')).toBeVisible();
    expect(m.dialogs.some((d) => d.includes('Leave group?'))).toBe(true);
  });

  test('invite button copies an invite on desktop web', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Invite');
    await org.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    // Desktop Chrome on Windows exposes the OS share sheet; test the copy fallback used where it doesn't.
    await org.page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await org.page.reload();
    const code = await createGroup(org.page, `Invite ${uid()}`);
    await B(org.page, 'Invite').click();
    await expect.poll(() => org.dialogs.some((d) => d.startsWith('Invite copied'))).toBe(true);
    const clip = await org.page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain(code);
    expect(clip).toContain(`/join/${code}`);
  });

  test('unknown group id shows a not-found state', async ({ browser }) => {
    const p = await newPlayer(browser, 'Nora Nobody');
    await p.page.goto('/group/00000000-0000-0000-0000-000000000000');
    await expect(T(p.page, 'Group not found')).toBeVisible();
    await p.page.goto('/session/00000000-0000-0000-0000-000000000000');
    await expect(T(p.page, 'Session not found')).toBeVisible();
    // PH is imported for parity with other specs
    void PH;
  });
});
