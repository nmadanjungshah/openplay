import { B, createGroup, createSession, errorsOf, expect, goTab, joinGroup, L, newPlayer, PH, sql, T, test, uid } from './helpers';

test.describe('Sessions and booking', () => {
  test('new-session form validates start time', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Validate');
    await createGroup(org.page, `Validate ${uid()}`);
    await B(org.page, 'New session').click();
    await L(org.page, 'Start (24h)').fill('25:99');
    await B(org.page, 'Create session').click();
    await expect(T(org.page, 'Enter the start time as HH:MM, e.g. 07:00 or 18:30.')).toBeVisible();
    await L(org.page, 'Title').fill('');
    await L(org.page, 'Start (24h)').fill('07:00');
    await B(org.page, 'Create session').click();
    await expect(T(org.page, 'Add a title.')).toBeVisible();
  });

  test('weekly series creates one session per week', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Weekly');
    await createGroup(org.page, `Weekly ${uid()}`);
    const location = `Weekly court ${uid()}`;
    await createSession(org.page, { location, weeks: 4 });
    await expect(org.page.getByText(location).filter({ visible: true })).toHaveCount(4);
    const n = sql(
      `select count(distinct recurrence_id) || ':' || count(*) from public.sessions where location = '${location}'`,
    );
    expect(n).toBe('1:4');
  });

  test('book, waitlist, live promotion, capacity raise', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Book');
    const code = await createGroup(org.page, `Book ${uid()}`);
    const location = `Court ${uid()}`;
    await createSession(org.page, { location, capacity: 1 });

    await T(org.page, location).click();
    await B(org.page, /Book my spot/).click();
    await expect(T(org.page, "You're in")).toBeVisible();

    const p = await newPlayer(browser, 'Asha Waiting');
    await joinGroup(p.page, code);
    await T(p.page, location).click();
    await B(p.page, /Join waitlist \(0 waiting\)/).click();
    await expect(T(p.page, "You're #1 on the waitlist")).toBeVisible();

    // Organizer sees the waitlist live, then cancels -> player promoted live
    await expect(T(org.page, 'Waitlist · 1')).toBeVisible();
    await B(org.page, 'Cancel my spot').click();
    await expect(T(p.page, "You're in")).toBeVisible();
    await expect(B(p.page, 'Cancel my spot')).toBeVisible();

    // Raise capacity -> organizer can book again
    await L(org.page, 'Increase Max players').click();
    await expect(T(org.page, '1/2 players')).toBeVisible();
    await B(org.page, /Book my spot/).click();
    await expect(T(org.page, '2/2 players')).toBeVisible();

    // Player's home: My bookings filter
    await p.page.goto('/');
    await T(p.page, 'My bookings', true).click();
    await expect(T(p.page, location)).toBeVisible();

    for (const x of [org, p]) expect(errorsOf(x.page)).toEqual([]);
  });

  test('skill-restricted session blocks players outside the range', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Skill');
    const code = await createGroup(org.page, `Skill ${uid()}`);
    const location = `Skill court ${uid()}`;
    await B(org.page, 'New session').click();
    await PH(org.page, 'e.g. Satdobato Sports Complex, courts 1–4').fill(location);
    // First "3.5" chip in the Minimum row
    await org.page.getByRole('radio', { name: '3.5', exact: true }).filter({ visible: true }).first().click();
    await B(org.page, 'Create session').click();
    await expect(T(org.page, 'Level 3.5+')).toBeVisible();

    const p = await newPlayer(browser, 'Beginner Bina');
    await goTab(p.page, 'Profile');
    await T(p.page, '2.5', true).click();
    await B(p.page, 'Save profile').click();
    await expect.poll(() => p.dialogs.includes('Profile saved')).toBe(true);
    await joinGroup(p.page, code);
    await T(p.page, location).click();
    await B(p.page, /Book my spot/).click();
    await expect(T(p.page, 'This session is for skill levels 3.5 to any')).toBeVisible();
  });

  test('organizer cancels, reinstates and deletes a session', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Cancel');
    const code = await createGroup(org.page, `Cancel ${uid()}`);
    const location = `Cancel court ${uid()}`;
    await createSession(org.page, { location });
    const p = await newPlayer(browser, 'Pema Player');
    await joinGroup(p.page, code);
    await T(p.page, location).click();

    await T(org.page, location).click();
    await B(org.page, 'Cancel session').click();
    await expect(T(p.page, 'This session was cancelled by the organizer.')).toBeVisible(); // live
    await expect(T(p.page, 'Cancelled', true)).toBeVisible();

    await B(org.page, 'Reinstate session').click();
    await expect(B(p.page, /Book my spot/)).toBeVisible();

    await B(org.page, 'Delete session').click();
    await expect(T(org.page, 'Upcoming sessions')).toBeVisible(); // back on group page
    await expect(org.page.getByText(location).filter({ visible: true })).toHaveCount(0);
  });

  test('late cancellation is flagged inside the cutoff window', async ({ browser }) => {
    const org = await newPlayer(browser, 'Org Late');
    await createGroup(org.page, `Late ${uid()}`);
    const location = `Late court ${uid()}`;
    await createSession(org.page, { location });
    await T(org.page, location).click();
    await B(org.page, /Book my spot/).click();
    await expect(T(org.page, "You're in")).toBeVisible();
    // Time-travel: session starts in 1 hour (cutoff is 2h)
    sql(`update public.sessions set starts_at = now() + interval '1 hour', ends_at = now() + interval '3 hours' where location = '${location}'`);
    await org.page.reload();
    await B(org.page, 'Cancel my spot').click();
    expect(org.dialogs.some((d) => d.includes('late cancellation'))).toBe(true);
    await expect(B(org.page, /Book my spot/)).toBeVisible();
    expect(sql(`select b.late_cancel from public.bookings b join public.sessions s on s.id = b.session_id where s.location = '${location}'`)).toBe('t');
  });
});
