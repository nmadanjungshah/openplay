import type { Page } from '@playwright/test';

import { createGroup, createSession, expect, goTab, newPlayer, T, test, uid } from './helpers';

/** No horizontal scrolling at the current viewport. */
async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(1);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`key screens fit phone and desktop widths (${scheme})`, async ({ browser }, info) => {
    const org = await newPlayer(browser, 'Layout Lata', { colorScheme: scheme });
    const page = org.page;
    await createGroup(page, `Layout ${uid()}`);
    const location = `Layout court ${uid()}`;
    await createSession(page, { location, fee: 400 });

    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 860 });
      const shot = async (name: string) =>
        page.screenshot({ path: info.outputPath(`${scheme}-${width}-${name}.png`), fullPage: true });

      await goTab(page, 'Play');
      await expect(T(page, location)).toBeVisible();
      await expectNoHorizontalScroll(page, `Play ${width}px`);
      await shot('play');

      await T(page, location).click();
      await expect(T(page, /\d+\/\d+ players/)).toBeVisible();
      await expectNoHorizontalScroll(page, `Session ${width}px`);
      await shot('session');
      await page.goBack();

      await goTab(page, 'Groups');
      await expect(T(page, 'Have an invite code?')).toBeVisible();
      await expectNoHorizontalScroll(page, `Groups ${width}px`);
      await shot('groups');

      await goTab(page, 'Profile');
      await expect(T(page, 'Save profile')).toBeVisible();
      await expectNoHorizontalScroll(page, `Profile ${width}px`);
      await shot('profile');
    }

    // Tab labels are fully inside the window (they used to be clipped on web)
    await page.setViewportSize({ width: 360, height: 800 });
    const label = page.getByRole('tab', { name: 'Profile' }).filter({ visible: true }).getByText('Profile');
    const box = await label.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(800);

    // Dark mode actually applies a dark background
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (scheme === 'dark') expect(bg).not.toBe('rgb(255, 255, 255)');
  });
}
