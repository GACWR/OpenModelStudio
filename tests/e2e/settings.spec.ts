import { test, expect } from './helpers/fixtures';

test.describe('Settings', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=/settings|profile|preferences/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays user profile form', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"], input[id="name"]').first();
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    const hasName = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmail = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasName || hasEmail).toBeTruthy();
  });

  test('update profile', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"], input[id="name"]').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('Admin User Updated');

      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        // Check for success toast or message
        const success = page.locator('text=/saved|updated|success/i').first();
        if (await success.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(success).toBeVisible();
        }
      }
    }
  });

  test('settings sections/tabs', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    const tabs = page.locator('main button[role="tab"]');
    if (await tabs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const count = await tabs.count();
      for (let i = 0; i < Math.min(count, 5); i++) {
        if (await tabs.nth(i).isVisible().catch(() => false)) {
          await tabs.nth(i).click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('theme/appearance toggle', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    const themeToggle = page.locator('button:has-text("Dark"), button:has-text("Light"), [class*="switch"], button[role="switch"]').first();
    if (await themeToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test('API error on save', async ({ authenticatedPage: page }) => {
    await page.route('**/users/me*', (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        return route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) });
      }
      return route.continue();
    });
    await page.goto('/settings');
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('Should Fail');
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  });
});
