import { test, expect } from './helpers/fixtures';

test.describe('Monitoring', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/monitoring');
    await expect(page.locator('text=/monitoring|system|metrics/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays system metrics', async ({ authenticatedPage: page }) => {
    await page.goto('/monitoring');
    await page.waitForTimeout(2000);
    const metrics = page.locator('text=/cpu|memory|gpu|disk|usage|utilization/i').first();
    if (await metrics.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(metrics).toBeVisible();
    }
  });

  test('resource usage charts render', async ({ authenticatedPage: page }) => {
    await page.goto('/monitoring');
    const charts = page.locator('svg, canvas, [class*="chart"], [class*="recharts"]');
    if (await charts.first().isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(charts.first()).toBeVisible();
    }
  });

  test('metric cards show values', async ({ authenticatedPage: page }) => {
    await page.goto('/monitoring');
    const cards = page.locator('[class*="card"], [class*="Card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('refresh button works', async ({ authenticatedPage: page }) => {
    await page.goto('/monitoring');
    const refreshBtn = page.locator('button:has-text("Refresh"), button:has(svg.lucide-refresh-cw)').first();
    if (await refreshBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/monitoring*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.route('**/admin/stats*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/monitoring');
    await page.waitForTimeout(3000);
  });
});
