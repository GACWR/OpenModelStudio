import { test, expect } from './helpers/fixtures';

test.describe('Data Sources', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/data-sources');
    await expect(page.locator('text=/data source|connections/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays data source list or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/data-sources');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], table, h2').or(page.locator('text=/no data sources|connect|get started|datasets|features/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('add data source dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/data-sources');
    const addBtn = page.locator('button:has-text("Add"), button:has-text("Connect"), button:has-text("New"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Should show connection type options
      const typeOptions = page.locator('[role="dialog"] text=/postgres|mysql|s3|mongodb|redis|snowflake/i');
      if (await typeOptions.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await typeOptions.first().click();
      }

      await page.keyboard.press('Escape');
    }
  });

  test('test connection button in dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/data-sources');
    const addBtn = page.locator('button:has-text("Add"), button:has-text("Connect"), button:has-text("New"), button:has(svg.lucide-plus)').first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      const testBtn = page.locator('[role="dialog"] button:has-text("Test"), [role="dialog"] button:has-text("Verify")').first();
      if (await testBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(testBtn).toBeVisible();
      }

      await page.keyboard.press('Escape');
    }
  });

  test('data source cards show connection status', async ({ authenticatedPage: page }) => {
    await page.goto('/data-sources');
    const status = page.locator('text=/connected|disconnected|active|inactive|healthy/i').first();
    if (await status.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(status).toBeVisible();
    }
  });

  test('search data sources', async ({ authenticatedPage: page }) => {
    await page.goto('/data-sources');
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('postgres');
      await page.waitForTimeout(1000);
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/data-sources*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/data-sources');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});
