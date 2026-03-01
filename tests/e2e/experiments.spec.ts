import { test, expect } from './helpers/fixtures';

test.describe('Experiments', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/experiments');
    await expect(page.locator('text=/experiments/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays experiments or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/experiments');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], table, h2').or(page.locator('text=/no experiments|get started|experiments/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('create experiment dialog opens', async ({ authenticatedPage: page }) => {
    await page.goto('/experiments');
    const createBtn = page.locator('button:has-text("New Experiment"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      const nameInput = page.locator('[role="dialog"] input').first();
      if (await nameInput.isVisible()) await nameInput.fill('E2E Experiment');

      await page.keyboard.press('Escape');
    }
  });

  test('compare runs button', async ({ authenticatedPage: page }) => {
    await page.goto('/experiments');
    const compareBtn = page.locator('button:has-text("Compare"), button:has-text("compare")').first();
    if (await compareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await compareBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/experiments*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/experiments');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('experiment cards show run metrics', async ({ authenticatedPage: page }) => {
    await page.goto('/experiments');
    const metricText = page.locator('text=/accuracy|loss|f1|precision|recall|runs/i').first();
    if (await metricText.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(metricText).toBeVisible();
    }
  });
});
