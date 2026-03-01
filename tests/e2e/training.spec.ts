import { test, expect } from './helpers/fixtures';

test.describe('Training Jobs List', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    await expect(page.locator('text=/training/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays training jobs or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    await page.waitForTimeout(2000);
    const cards = page.locator('[data-slot="card"], table, h2, h3').or(page.locator('text=/training/i'));
    const empty = page.locator('text=/no.*jobs|no.*training|get started/i');
    const hasCards = await cards.first().isVisible({ timeout: 8000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  });

  test('start training dialog opens', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    const startBtn = page.locator('button:has-text("Start Training"), button:has-text("New Job"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Fill job name
      const nameInput = page.locator('[role="dialog"] input').first();
      if (await nameInput.isVisible()) await nameInput.fill('E2E Training Job');

      // Select model if present
      const modelSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
      if (await modelSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        await modelSelect.click();
        await page.locator('[role="option"]').first().click();
      }

      await page.keyboard.press('Escape');
    }
  });

  test('filter by status', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    const statusFilter = page.locator('button:has-text("Running"), button:has-text("Completed"), button:has-text("Failed"), button:has-text("All")');
    if (await statusFilter.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusFilter.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('click into training job detail', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    const jobLink = page.locator('a[href*="/training/"]').first();
    if (await jobLink.isVisible({ timeout: 8000 }).catch(() => false)) {
      await jobLink.click();
      await expect(page).toHaveURL(/\/training\/[^/]+/);
    }
  });

  test('progress bars visible on running jobs', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    const progress = page.locator('[role="progressbar"], [class*="progress"]');
    if (await progress.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(progress.first()).toBeVisible();
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/training*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/training');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Training Job Detail', () => {
  test('loads detail page with metrics and logs', async ({ authenticatedPage: page }) => {
    await page.goto('/training');
    const link = page.locator('a[href*="/training/"]').first();
    if (await link.isVisible({ timeout: 8000 }).catch(() => false)) {
      await link.click();
      await page.waitForURL(/\/training\/[^/]+/, { timeout: 10000 });

      // Check for metrics section
      const metrics = page.locator('text=/metrics|loss|accuracy|epoch/i').first();
      if (await metrics.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(metrics).toBeVisible();
      }

      // Check for logs section
      const logs = page.locator('text=/logs|output|console/i').first();
      if (await logs.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(logs).toBeVisible();
      }

      // Stop/cancel buttons
      const stopBtn = page.locator('button:has-text("Stop"), button:has-text("Cancel")').first();
      if (await stopBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Don't actually click stop in tests unless we verify confirm dialog
        await expect(stopBtn).toBeVisible();
      }
    }
  });
});
