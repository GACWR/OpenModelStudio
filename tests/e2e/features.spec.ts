import { test, expect } from './helpers/fixtures';

test.describe('Feature Store', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/features');
    await expect(page.locator('text=/feature|store/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays feature groups or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/features');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], table, h2').or(page.locator('text=/no feature|get started|feature groups/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('create feature group dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/features');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has(svg.lucide-plus)').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      const nameInput = page.locator('[role="dialog"] input').first();
      if (await nameInput.isVisible()) await nameInput.fill('E2E Feature Group');

      await page.keyboard.press('Escape');
    }
  });

  test('search features', async ({ authenticatedPage: page }) => {
    await page.goto('/features');
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('user_embedding');
      await page.waitForTimeout(1000);
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/features*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/features');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});
