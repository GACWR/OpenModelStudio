import { test, expect } from './helpers/fixtures';

test.describe('AutoML', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/automl');
    await expect(page.locator('text=/automl|automated/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays configuration form or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/automl');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], h1, h2, table, form').or(page.locator('text=/get started|configure|automl|sweeps/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('start automl run dialog/form', async ({ authenticatedPage: page }) => {
    await page.goto('/automl');
    const startBtn = page.locator('button:has-text("Start"), button:has-text("New"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(1000);

      // Should show config form or dialog
      const dialog = page.locator('[role="dialog"]');
      const form = page.locator('form, [class*="config"]');
      const hasDialog = await dialog.isVisible({ timeout: 2000 }).catch(() => false);
      const hasForm = await form.first().isVisible({ timeout: 1000 }).catch(() => false);
      expect(hasDialog || hasForm).toBeTruthy();

      await page.keyboard.press('Escape');
    }
  });

  test('configuration form fields', async ({ authenticatedPage: page }) => {
    await page.goto('/automl');
    // Check for typical AutoML config fields
    const selects = page.locator('button[role="combobox"], select');
    const inputs = page.locator('input');
    const hasSelects = await selects.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasInputs = await inputs.first().isVisible({ timeout: 2000 }).catch(() => false);
    if (hasSelects || hasInputs) {
      // Fill dataset selector if present
      if (hasSelects) {
        await selects.first().click();
        const option = page.locator('[role="option"]').first();
        if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
          await option.click();
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  test('API error handled', async ({ authenticatedPage: page }) => {
    await page.route('**/automl*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/automl');
    await page.waitForTimeout(3000);
  });
});
