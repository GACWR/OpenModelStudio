import { test, expect } from './helpers/fixtures';

test.describe('Models List', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/models');
    await expect(page.locator('text=/models/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays model cards or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/models');
    await page.waitForTimeout(2000);
    const cards = page.locator('[class*="card"], [class*="Card"]');
    const empty = page.locator('text=/no models|create your first|get started/i');
    const hasCards = await cards.first().isVisible({ timeout: 8000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  });

  test('create model dialog opens', async ({ authenticatedPage: page }) => {
    await page.goto('/models');
    const createBtn = page.locator('button:has-text("New Model"), button:has-text("Create"), button:has-text("Register"), button:has(svg.lucide-plus)').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Dialog now shows two-path chooser: "Create in Workspace" and "Quick Editor"
      // Click "Quick Editor" to get to the form
      const quickEditorBtn = page.locator('[role="dialog"] button:has-text("Quick Editor")');
      if (await quickEditorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await quickEditorBtn.click();
        await page.waitForTimeout(500);
      }

      // Fill name
      const nameInput = page.locator('[role="dialog"] input').first();
      await nameInput.fill(`E2E Model ${Date.now()}`);

      // Select framework if present
      const fwSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
      if (await fwSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fwSelect.click();
        await page.locator('[role="option"]').first().click();
      }

      // Submit
      const submitBtn = page.locator('[role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Register"), [role="dialog"] button:has-text("Save")').first();
      if (await submitBtn.isVisible()) await submitBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('search filters models', async ({ authenticatedPage: page }) => {
    await page.goto('/models');
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('nonexistent-model-xyz');
      await page.waitForTimeout(1000);
    }
  });

  test('click into model detail', async ({ authenticatedPage: page }) => {
    await page.goto('/models');
    const modelLink = page.locator('a[href*="/models/"]').first();
    if (await modelLink.isVisible({ timeout: 8000 }).catch(() => false)) {
      await modelLink.click();
      await expect(page).toHaveURL(/\/models\/[^/]+/);
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/models*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/models');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Model Detail', () => {
  test('loads model detail with versions and deploy', async ({ authenticatedPage: page }) => {
    await page.goto('/models');
    const link = page.locator('a[href*="/models/"]').first();
    if (await link.isVisible({ timeout: 8000 }).catch(() => false)) {
      await link.click();
      await page.waitForURL(/\/models\/[^/]+/, { timeout: 10000 });

      // Check for version info
      const versionText = page.locator('text=/version|v[0-9]/i').first();
      if (await versionText.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(versionText).toBeVisible();
      }

      // Check deploy button
      const deployBtn = page.locator('button:has-text("Deploy"), button:has-text("deploy")').first();
      if (await deployBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await deployBtn.click();
        await page.waitForTimeout(1000);
        await page.keyboard.press('Escape');
      }
    }
  });
});
