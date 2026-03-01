import { test, expect } from './helpers/fixtures';

test.describe('Templates', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/templates');
    await expect(page.locator('text=/templates/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays template cards or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], h2, h3').or(page.locator('text=/no templates|get started/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('create from template button', async ({ authenticatedPage: page }) => {
    await page.goto('/templates');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has(svg.lucide-plus)').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    }
  });

  test('use template button on card', async ({ authenticatedPage: page }) => {
    await page.goto('/templates');
    const useBtn = page.locator('main button:has-text("Use"), main button:has-text("Start"), main a:has-text("Use Template")').first();
    if (await useBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await useBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    }
  });

  test('template cards show descriptions', async ({ authenticatedPage: page }) => {
    await page.goto('/templates');
    const cards = page.locator('[data-slot="card"], h2, h3').or(page.locator('text=/template/i'));
    if (await cards.first().isVisible({ timeout: 8000 }).catch(() => false)) {
      // Should have descriptive content
      const desc = page.locator('p, [class*="description"]').first();
      await expect(desc).toBeVisible({ timeout: 3000 });
    }
  });

  test('search templates', async ({ authenticatedPage: page }) => {
    await page.goto('/templates');
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('classification');
      await page.waitForTimeout(1000);
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/templates*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/templates');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});
