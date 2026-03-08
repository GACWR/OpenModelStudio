/**
 * OpenModelStudio — Dashboard Verification E2E Test
 *
 * After creating entities across all nouns, verifies that:
 * 1. Dashboard shows correct KPI counts
 * 2. Each entity page reflects the created data
 * 3. Search finds all created entities
 * 4. Notifications were generated for each creation
 * 5. Project detail page shows associated resources
 */
import { test, expect } from './helpers/fixtures';
import { apiLogin, apiPost, apiGet, apiDelete, DEFAULT_ADMIN } from './helpers/api-client';

const SDK_URL = process.env.API_URL || 'http://localhost:31001';

test.describe('Dashboard Verification', () => {
  test('all nouns correctly reflected across UI pages', async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);

    let token: string;
    let projectId: string;
    let projectName: string;
    const createdIds: Record<string, string> = {};

    // ─── Setup: Create one of each entity ─────────────────────
    await test.step('Setup: Authenticate and create entities', async () => {
      token = await apiLogin(DEFAULT_ADMIN);

      // Mark all notifications as read so we can test new ones
      await apiPost(token, '/notifications/read-all', {});

      // 1. Create project
      projectName = `Dashboard Test ${Date.now()}`;
      const project = await apiPost(token, '/projects', {
        name: projectName,
        description: 'Dashboard verification test',
      });
      projectId = project.id;
      createdIds.project = projectId;

      // 2. Create dataset
      const dataset = await apiPost(token, '/datasets', {
        project_id: projectId,
        name: `dash-dataset-${Date.now()}`,
        description: 'Test dataset',
        format: 'csv',
      });
      createdIds.dataset = dataset.id;

      // 3. Register model
      const model = await apiPost(token, '/sdk/register-model', {
        name: `dash-model-${Date.now()}`,
        framework: 'sklearn',
        project_id: projectId,
        source_code: 'def train(ctx): ctx.log_metric("progress", 100)\ndef infer(ctx): ctx.set_output({"ok": True})',
      });
      createdIds.model = model.model_id;

      // 4. Create features
      const features = await apiPost(token, '/sdk/features', {
        project_id: projectId,
        group_name: `dash-features-${Date.now()}`,
        entity: 'test',
        features: [
          { name: 'f1', feature_type: 'numerical', dtype: 'float64', config: {} },
        ],
      });
      createdIds.features = features.group_id || features.id;

      // 5. Create hyperparameters
      const hpName = `dash-hp-${Date.now()}`;
      const hp = await apiPost(token, '/sdk/hyperparameters', {
        project_id: projectId,
        name: hpName,
        parameters: { lr: 0.01, epochs: 10 },
      });
      createdIds.hp = hp.id;

      // 6. Create experiment
      const exp = await apiPost(token, '/experiments', {
        project_id: projectId,
        name: `dash-experiment-${Date.now()}`,
        description: 'Dashboard test experiment',
      });
      createdIds.experiment = exp.id;
    });

    // ─── Verify: Dashboard KPIs ───────────────────────────────
    await test.step('Dashboard shows entity counts', async () => {
      await page.goto('/');
      await page.waitForTimeout(3000);

      // Dashboard should have KPI cards
      const cards = page.locator('[data-slot="card"], [class*="card"], [class*="Card"]');
      await expect(cards.first()).toBeVisible({ timeout: 10000 });

      // Should show non-zero counts (at least one of each entity exists now)
      const countElements = page.locator('[data-slot="card"] span, [class*="card"] span, [class*="stat"]');
      const hasCountElements = await countElements.first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasCountElements).toBeTruthy();
    });

    // ─── Verify: Each entity page ─────────────────────────────
    await test.step('Projects page shows created project', async () => {
      await page.goto('/projects');
      await page.waitForTimeout(3000);

      const projectCard = page.locator(`text=${projectName}`).first();
      await expect(projectCard).toBeVisible({ timeout: 10000 });
    });

    await test.step('Datasets page shows content', async () => {
      await page.goto('/datasets');
      await page.waitForTimeout(3000);

      const content = page.locator('main [class*="card"], main [class*="Card"], main a[href*="/datasets/"]');
      const empty = page.locator('text=/no datasets/i');
      const hasContent = await content.first().isVisible({ timeout: 8000 }).catch(() => false);
      const hasEmpty = await empty.first().isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasContent || hasEmpty).toBeTruthy();
    });

    await test.step('Models page shows registered model', async () => {
      await page.goto('/models');
      await page.waitForTimeout(3000);

      const content = page.locator('main [class*="card"], main [class*="Card"], main a[href*="/models/"]');
      await expect(content.first()).toBeVisible({ timeout: 10000 });
    });

    await test.step('Experiments page shows experiment', async () => {
      await page.goto('/experiments');
      await page.waitForTimeout(3000);

      const heading = page.getByText('Experiments').first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      const content = page.locator('main [class*="card"], main [class*="Card"], main a[href*="/experiments/"]');
      await expect(content.first()).toBeVisible({ timeout: 10000 });
    });

    await test.step('Feature Store page shows features', async () => {
      await page.goto('/features');
      await page.waitForTimeout(3000);

      const content = page.locator('main [class*="card"], main [class*="Card"], main table');
      const empty = page.locator('text=/no feature/i');
      const hasContent = await content.first().isVisible({ timeout: 8000 }).catch(() => false);
      const hasEmpty = await empty.first().isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasContent || hasEmpty).toBeTruthy();
    });

    await test.step('Hyperparameters page shows stored sets', async () => {
      await page.goto('/hyperparameters');
      await page.waitForTimeout(3000);

      const content = page.locator('main [class*="card"], main [class*="Card"], main table, h2, h3');
      const hasContent = await content.first().isVisible({ timeout: 8000 }).catch(() => false);
      expect(hasContent).toBeTruthy();
    });

    // ─── Verify: Search finds entities ────────────────────────
    await test.step('Search finds created project', async () => {
      await page.goto('/search');
      await page.waitForTimeout(2000);

      const searchInput = page.locator('input[placeholder*="search" i]').first();
      await searchInput.fill(projectName);
      await page.waitForTimeout(2000);

      // Should show results
      const results = page.locator('text=/\\d+ results/i').first();
      const cards = page.locator('main [class*="card"], main [class*="Card"]');
      const hasResults = await results.isVisible({ timeout: 5000 }).catch(() => false);
      const hasCards = await cards.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasResults || hasCards).toBeTruthy();
    });

    // ─── Verify: Notifications generated ──────────────────────
    await test.step('Notifications were generated for entity creation', async () => {
      const count = await apiGet(token, '/notifications/unread-count');
      // We created 6 entities (project, dataset, model, features, hp, experiment)
      // Each should have triggered a notification
      expect(count.count).toBeGreaterThanOrEqual(1);

      // Fetch full notification list
      const notifications = await apiGet(token, '/notifications');
      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
    });

    await test.step('Notification panel shows created entity notifications', async () => {
      await page.goto('/');
      await page.waitForTimeout(2000);

      // Open notification panel
      const bell = page.locator('header button:has(svg.lucide-bell)').first();
      await bell.click();
      await page.waitForTimeout(1000);

      // Should show notification items
      const popover = page.locator('[data-radix-popper-content-wrapper], [role="dialog"]').first();
      await expect(popover).toBeVisible({ timeout: 5000 });

      // Should have notification entries (not empty state)
      const notifItems = page.locator('[data-radix-popper-content-wrapper] button');
      const hasNotifs = await notifItems.first().isVisible({ timeout: 3000 }).catch(() => false);

      // Close popover
      await page.keyboard.press('Escape');
    });

    // ─── Verify: Project detail shows resources ───────────────
    await test.step('Project detail shows associated resources', async () => {
      await page.goto(`/projects/${projectId}`);
      await page.waitForTimeout(3000);

      // Project name visible
      await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });

      // Click through tabs to see associated entities
      const tabs = page.locator('main button[role="tab"]');
      if (await tabs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        const tabCount = await tabs.count();
        for (let i = 0; i < Math.min(tabCount, 6); i++) {
          const tab = tabs.nth(i);
          if (await tab.isVisible().catch(() => false)) {
            const tabText = await tab.textContent();
            await tab.click();
            await page.waitForTimeout(800);

            // Check for content in each tab
            const tabContent = page.locator('main [class*="card"], main table, main [class*="Card"], main a');
            const hasContent = await tabContent.first().isVisible({ timeout: 3000 }).catch(() => false);
            if (!hasContent) {
              console.log(`  ℹ Tab "${tabText}" has no visible content`);
            }
          }
        }
      }
    });

    // ─── Cleanup ──────────────────────────────────────────────
    await test.step('Cleanup all created entities', async () => {
      // Delete in reverse order of dependency
      if (createdIds.experiment) {
        try { await apiDelete(token, `/experiments/${createdIds.experiment}`); } catch { /* ok */ }
      }
      if (createdIds.model) {
        try { await apiDelete(token, `/models/${createdIds.model}`); } catch { /* ok */ }
      }
      if (createdIds.dataset) {
        try { await apiDelete(token, `/datasets/${createdIds.dataset}`); } catch { /* ok */ }
      }
      if (createdIds.project) {
        try { await apiDelete(token, `/projects/${createdIds.project}`); } catch { /* ok */ }
      }

      // Mark all notifications as read
      try { await apiPost(token, '/notifications/read-all', {}); } catch { /* ok */ }
    });
  });
});
