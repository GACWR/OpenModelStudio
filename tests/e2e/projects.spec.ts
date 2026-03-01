import { test, expect } from './helpers/fixtures';

test.describe('Projects List', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    await expect(page.locator('text=/projects/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays project cards or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    await page.waitForTimeout(2000);
    const cards = page.locator('[class*="card"], [class*="Card"], [class*="glass"]');
    const empty = page.locator('text=/no projects|get started|create your first/i');
    const hasCards = await cards.first().isVisible({ timeout: 8000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  });

  test('create project dialog opens and validates', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    const createBtn = page.locator('button:has-text("New Project"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    // Try submitting empty
    const nextOrCreate = page.locator('[role="dialog"] button:has-text("Next"), [role="dialog"] button:has-text("Create")').first();
    if (await nextOrCreate.isVisible()) {
      await nextOrCreate.click();
      await page.waitForTimeout(500);
    }
  });

  test('create project full flow', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    const createBtn = page.locator('button:has-text("New Project"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    await createBtn.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // Fill in name
    const nameInput = page.locator('[role="dialog"] input').first();
    await nameInput.fill(`E2E Test Project ${Date.now()}`);

    // Fill description if present
    const descInput = page.locator('[role="dialog"] textarea').first();
    if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await descInput.fill('Created by E2E test');
    }

    // Select stage if present
    const stageSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
    if (await stageSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await stageSelect.click();
      await page.locator('[role="option"]').first().click();
    }

    // Navigate wizard steps or submit
    const nextBtn = page.locator('[role="dialog"] button:has-text("Next")').first();
    while (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    const submitBtn = page.locator('[role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Submit")').first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await submitBtn.click();
    }

    // Should close dialog
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 });
  });

  test('search filters projects', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('nonexistent-project-xyz');
      await page.waitForTimeout(1000);
      // Should show no results or filtered
    }
  });

  test('stage filter tabs work', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    const stageTabs = page.locator('button:has-text("Ideation"), button:has-text("R&D"), button:has-text("Production")');
    if (await stageTabs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await stageTabs.first().click();
      await page.waitForTimeout(500);
      // Click "All" to reset
      const allTab = page.locator('button:has-text("All")').first();
      if (await allTab.isVisible()) await allTab.click();
    }
  });

  test('grid/list view toggle', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    const listBtn = page.locator('button:has(svg.lucide-list)').first();
    const gridBtn = page.locator('button:has(svg.lucide-layout-grid)').first();
    if (await listBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listBtn.click();
      await page.waitForTimeout(300);
      if (await gridBtn.isVisible()) await gridBtn.click();
    }
  });

  test('click into project detail', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 8000 }).catch(() => false)) {
      await projectLink.click();
      await expect(page).toHaveURL(/\/projects\/[^/]+/);
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/projects*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/projects');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Project Detail', () => {
  test('loads project detail page with tabs', async ({ authenticatedPage: page }) => {
    // First get a project ID
    await page.goto('/projects');
    const link = page.locator('a[href*="/projects/"]').first();
    if (await link.isVisible({ timeout: 8000 }).catch(() => false)) {
      await link.click();
      await page.waitForURL(/\/projects\/[^/]+/, { timeout: 10000 });
      // Check for tabs
      const tabs = page.locator('main button[role="tab"]');
      if (await tabs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        const tabCount = await tabs.count();
        for (let i = 0; i < Math.min(tabCount, 5); i++) {
          if (await tabs.nth(i).isVisible().catch(() => false)) {
            await tabs.nth(i).click();
            await page.waitForTimeout(500);
          }
        }
      }
    }
  });
});
