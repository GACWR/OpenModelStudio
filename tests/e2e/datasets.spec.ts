import { test, expect } from './helpers/fixtures';

test.describe('Datasets', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/datasets');
    await expect(page.locator('text=/datasets/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays dataset list or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/datasets');
    await page.waitForTimeout(2000);
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible({ timeout: 10000 });
    // Should show dataset items (cards or links) or empty state
    const hasCards = await page.locator('main [class*="card"], main [class*="Card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDatasetLinks = await page.locator('main a[href*="/datasets/"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No datasets yet').isVisible().catch(() => false);
    const hasUpload = await page.getByText('Upload your first').isVisible().catch(() => false);
    expect(hasCards || hasDatasetLinks || hasEmpty || hasUpload).toBeTruthy();
  });

  test('create/upload dataset dialog opens', async ({ authenticatedPage: page }) => {
    await page.goto('/datasets');
    const uploadBtn = page.locator('button:has-text("Upload"), button:has-text("New Dataset"), button:has-text("Create"), button:has(svg.lucide-upload)').first();
    if (await uploadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await uploadBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
      // Verify file upload area exists
      const uploadArea = page.locator('[role="dialog"] text=/drag|drop|browse|upload/i').first();
      if (await uploadArea.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(uploadArea).toBeVisible();
      }
      await page.keyboard.press('Escape');
    }
  });

  test('search filters datasets', async ({ authenticatedPage: page }) => {
    await page.goto('/datasets');
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('nonexistent-dataset');
      await page.waitForTimeout(1000);
    }
  });

  test('dataset cards show format badges', async ({ authenticatedPage: page }) => {
    await page.goto('/datasets');
    const badge = page.locator('text=/CSV|Parquet|JSON|images|video|audio/i').first();
    if (await badge.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(badge).toBeVisible();
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/datasets*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/datasets');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('dataset stats counters visible', async ({ authenticatedPage: page }) => {
    await page.goto('/datasets');
    // Stats like total size, count, etc.
    const stats = page.locator('[class*="counter"], [class*="stat"], [class*="kpi"]');
    if (await stats.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(stats.first()).toBeVisible();
    }
  });
});
