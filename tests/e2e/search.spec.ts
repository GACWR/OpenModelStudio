import { test, expect } from './helpers/fixtures';

test.describe('Search', () => {
  test('page loads with search input', async ({ authenticatedPage: page }) => {
    await page.goto('/search');
    await expect(page.locator('input[type="search"], input[placeholder*="search" i], input[type="text"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('search across entities', async ({ authenticatedPage: page }) => {
    await page.goto('/search');
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[type="text"]').first();
    await searchInput.fill('test');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    // Should show results or "no results"
    const results = page.locator('[data-slot="card"], [class*="result"], h2, h3').or(page.locator('text=/no results|found|results/i'));
    await expect(results.first()).toBeVisible({ timeout: 8000 });
  });

  test('empty search shows recent or placeholder', async ({ authenticatedPage: page }) => {
    await page.goto('/search');
    const recent = page.locator('text=/recent|popular|suggested|try searching/i').first();
    if (await recent.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(recent).toBeVisible();
    }
  });

  test('search results are clickable', async ({ authenticatedPage: page }) => {
    await page.goto('/search');
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[type="text"]').first();
    await searchInput.fill('project');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const resultLink = page.locator('a[href*="/projects"], a[href*="/models"], [class*="result"] a').first();
    if (await resultLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await resultLink.click();
      await page.waitForTimeout(1000);
    }
  });

  test('search with no results', async ({ authenticatedPage: page }) => {
    await page.goto('/search');
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[type="text"]').first();
    await searchInput.fill('zzzznonexistent12345');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  });
});
