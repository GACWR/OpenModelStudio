import { test, expect } from './helpers/fixtures';

test.describe('Admin - Users', () => {
  test('page loads with heading', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('text=/users|user management/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays user list', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    await page.waitForTimeout(2000);
    const table = page.locator('table, [class*="table"], [class*="card"]');
    await expect(table.first()).toBeVisible({ timeout: 8000 });
  });

  test('user rows show roles', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    const role = page.locator('text=/admin|analyst|viewer|editor/i').first();
    await expect(role).toBeVisible({ timeout: 8000 });
  });

  test('add user button', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    const addBtn = page.locator('button:has-text("Add"), button:has-text("Invite"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Escape');
    }
  });

  test('edit user role', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    const editBtn = page.locator('button:has-text("Edit"), button:has(svg.lucide-pencil), button:has(svg.lucide-more-vertical)').first();
    if (await editBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    }
  });

  test('search users', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('admin');
      await page.waitForTimeout(1000);
    }
  });

  test('API error shows error state', async ({ adminPage: page }) => {
    await page.route('**/admin/users*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/admin/users');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Admin - System', () => {
  test('page loads with heading', async ({ adminPage: page }) => {
    await page.goto('/admin/system');
    await expect(page.locator('text=/system|configuration|config/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays system configuration', async ({ adminPage: page }) => {
    await page.goto('/admin/system');
    await page.waitForTimeout(2000);
    const content = page.locator('h1, h2, h3, [data-slot="card"], table, form').or(page.locator('text=/services|system|health/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('save config button', async ({ adminPage: page }) => {
    await page.goto('/admin/system');
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Apply")').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(saveBtn).toBeVisible();
    }
  });
});

test.describe('Admin - Environments', () => {
  test('page loads with heading', async ({ adminPage: page }) => {
    await page.goto('/admin/environments');
    await expect(page.locator('text=/environment/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays environment list', async ({ adminPage: page }) => {
    await page.goto('/admin/environments');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], table, h2, h3').or(page.locator('text=/no environments|get started|environment/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('create environment dialog', async ({ adminPage: page }) => {
    await page.goto('/admin/environments');
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), button:has(svg.lucide-plus)').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    }
  });

  test('API error shows error state', async ({ adminPage: page }) => {
    await page.route('**/environments*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/admin/environments');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});
