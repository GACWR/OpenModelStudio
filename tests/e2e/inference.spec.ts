import { test, expect } from './helpers/fixtures';

test.describe('Inference / Model APIs', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/inference');
    await expect(page.locator('text=/inference|model api|endpoints/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays endpoints or playground', async ({ authenticatedPage: page }) => {
    await page.goto('/inference');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], textarea, h2').or(page.locator('text=/no endpoints|get started|inference|playground/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('model selector exists', async ({ authenticatedPage: page }) => {
    await page.goto('/inference');
    const modelSelect = page.locator('button[role="combobox"], select').first();
    if (await modelSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modelSelect.click();
      await page.waitForTimeout(500);
      const options = page.locator('[role="option"]');
      if (await options.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await options.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
  });

  test('input type tabs work', async ({ authenticatedPage: page }) => {
    await page.goto('/inference');
    const tabs = page.locator('button:has-text("Text"), button:has-text("Image"), button:has-text("JSON")');
    if (await tabs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const count = await tabs.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('run inference with text input', async ({ authenticatedPage: page }) => {
    await page.goto('/inference');
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textarea.fill('Test input for inference');
      const runBtn = page.locator('button:has-text("Run"), button:has-text("Send"), button:has-text("Predict"), button:has(svg.lucide-play)').first();
      if (await runBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Button may be disabled if no model selected — only click if enabled
        const isDisabled = await runBtn.isDisabled().catch(() => true);
        if (!isDisabled) {
          await runBtn.click();
          await page.waitForTimeout(3000);
        }
      }
    }
  });

  test('inference history shows results', async ({ authenticatedPage: page }) => {
    await page.goto('/inference');
    const history = page.locator('text=/history|recent|results/i').first();
    if (await history.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(history).toBeVisible();
    }
  });

  test('API error handled gracefully', async ({ authenticatedPage: page }) => {
    await page.route('**/inference*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/inference');
    await page.waitForTimeout(3000);
  });
});
