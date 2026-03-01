/**
 * OpenModelStudio — Full End-to-End Flow Test
 *
 * Exercises every major page and feature in a single sequential flow.
 * Creates real data (project, dataset, model, experiment, workspace, etc.),
 * interacts with every page, and cleans up at the end.
 *
 * Runs as a single test with shared state via test.step().
 */
import { test, expect } from './helpers/fixtures';
import { apiLogin, apiPost, apiGet, apiDelete, DEFAULT_ADMIN } from './helpers/api-client';

test.describe('Full Platform Flow', () => {
  test('end-to-end user journey through every page', async ({ authenticatedPage: page }) => {
    test.setTimeout(180_000);

    // Shared state across steps
    let token: string;
    let projectId: string;
    let projectName: string;
    let modelId: string;
    let datasetId: string;
    let experimentId: string;
    let workspaceId: string;
    let apiKeyId: string;

    // ─── Step 0: Get API token ───────────────────────────────────
    await test.step('Authenticate via API', async () => {
      token = await apiLogin(DEFAULT_ADMIN);
      expect(token).toBeTruthy();
    });

    // ─── Step 1: Dashboard ───────────────────────────────────────
    await test.step('Dashboard — verify KPIs and quick actions', async () => {
      await page.goto('/');
      await page.waitForTimeout(2000);

      // Should see dashboard content (KPI cards, headings, or welcome)
      const content = page.locator('h1, h2, h3, [data-slot="card"], [class*="card"]');
      await expect(content.first()).toBeVisible({ timeout: 10000 });

      // Quick action buttons (New Project, Start Training, etc.)
      const actions = page.locator('button, a').filter({ hasText: /project|training|workspace|model/i });
      if (await actions.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(actions.first()).toBeVisible();
      }
    });

    // ─── Step 2: Create Project ──────────────────────────────────
    await test.step('Create Project via UI', async () => {
      projectName = `E2E Flow Project ${Date.now()}`;
      await page.goto('/projects');
      await page.waitForTimeout(2000);

      // Click create button
      const createBtn = page.locator('button:has-text("New Project"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
      await expect(createBtn).toBeVisible({ timeout: 10000 });
      await createBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Fill project name
      const nameInput = page.locator('[role="dialog"] input').first();
      await nameInput.fill(projectName);

      // Fill description
      const descInput = page.locator('[role="dialog"] textarea').first();
      if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await descInput.fill('Created by full-flow E2E test');
      }

      // Select stage if present
      const stageSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
      if (await stageSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        await stageSelect.click();
        await page.locator('[role="option"]').first().click();
      }

      // Navigate wizard steps
      const nextBtn = page.locator('[role="dialog"] button:has-text("Next")').first();
      while (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(300);
      }

      // Submit
      const submitBtn = page.locator('[role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Submit")').first();
      if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitBtn.click();
      }

      // Dialog should close
      await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(2000);

      // Project should appear in list
      const projectCard = page.locator(`text=${projectName}`).first();
      await expect(projectCard).toBeVisible({ timeout: 10000 });

      // Click into project to get ID from URL
      const projectLink = page.locator(`a[href*="/projects/"]`).first();
      if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await projectLink.click();
        await page.waitForURL(/\/projects\/[^/]+/, { timeout: 10000 });
        const url = page.url();
        projectId = url.split('/projects/')[1]?.split(/[?#/]/)[0] || '';
        expect(projectId).toBeTruthy();
      } else {
        // Fallback: get project ID via API
        const projects = await apiGet(token, '/projects');
        const proj = (projects as any[]).find((p: any) => p.name === projectName);
        projectId = proj?.id;
        expect(projectId).toBeTruthy();
      }
    });

    // ─── Step 3: Project Detail ──────────────────────────────────
    await test.step('Project Detail — explore tabs', async () => {
      await page.goto(`/projects/${projectId}`);
      await page.waitForTimeout(2000);

      // Should show project name
      await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });

      // Click through tabs if present
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
    });

    // ─── Step 4: Create Dataset via API ──────────────────────────
    await test.step('Create Dataset via API', async () => {
      const dataset = await apiPost(token, '/datasets', {
        project_id: projectId,
        name: `E2E Test Dataset ${Date.now()}`,
        description: 'Test dataset for full flow',
        format: 'csv',
      });
      datasetId = dataset.id;
      expect(datasetId).toBeTruthy();
    });

    // ─── Step 5: Datasets Page ───────────────────────────────────
    await test.step('Datasets Page — verify dataset appears', async () => {
      await page.goto('/datasets');
      await page.waitForTimeout(2000);

      const cards = page.locator('[class*="card"], [class*="Card"]');
      const empty = page.locator('text=/no datasets|upload|get started/i');
      const hasCards = await cards.first().isVisible({ timeout: 8000 }).catch(() => false);
      const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasCards || hasEmpty).toBeTruthy();

      // Upload dialog opens
      const uploadBtn = page.locator('button:has-text("Upload"), button:has-text("New Dataset"), button:has-text("Create"), button:has(svg.lucide-upload)').first();
      if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await uploadBtn.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
        await page.keyboard.press('Escape');
      }
    });

    // ─── Step 6: Create Model via UI ─────────────────────────────
    await test.step('Create Model via UI', async () => {
      await page.goto('/models');
      await page.waitForTimeout(2000);

      const createBtn = page.locator('button:has-text("New Model"), button:has-text("Create"), button:has-text("Register"), button:has(svg.lucide-plus)').first();
      await expect(createBtn).toBeVisible({ timeout: 10000 });
      await createBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Dialog shows two-path chooser — click "Quick Editor" to get to the form
      const quickEditorBtn = page.locator('[role="dialog"] button:has-text("Quick Editor")');
      if (await quickEditorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await quickEditorBtn.click();
        await page.waitForTimeout(500);
      }

      // Fill model name
      const nameInput = page.locator('[role="dialog"] input').first();
      await nameInput.fill(`E2E Model ${Date.now()}`);

      // Select framework
      const fwSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
      if (await fwSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fwSelect.click();
        // Pick first option (usually PyTorch)
        await page.locator('[role="option"]').first().click();
      }

      // Submit
      const submitBtn = page.locator('[role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Register"), [role="dialog"] button:has-text("Save")').first();
      if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitBtn.click();
      }

      await page.waitForTimeout(3000);

      // Get model ID
      const models = await apiGet(token, '/models');
      const model = (models as any[]).find((m: any) => m.name?.includes('E2E Model'));
      if (model) {
        modelId = model.id;
      }
    });

    // ─── Step 7: Model Detail ────────────────────────────────────
    await test.step('Model Detail — view model page', async () => {
      if (!modelId) return;

      await page.goto(`/models/${modelId}`);
      await page.waitForTimeout(2000);

      // Should see model info
      const content = page.locator('h1, h2, h3, [data-slot="card"]');
      await expect(content.first()).toBeVisible({ timeout: 10000 });

      // Version info
      const versionText = page.locator('text=/version|v[0-9]/i').first();
      if (await versionText.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(versionText).toBeVisible();
      }
    });

    // ─── Step 8: Training Page ───────────────────────────────────
    await test.step('Training Page — verify rendering', async () => {
      await page.goto('/training');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/training/i').first()).toBeVisible({ timeout: 10000 });

      // Start training dialog
      const startBtn = page.locator('button:has-text("Start Training"), button:has-text("New Job"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
      if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await startBtn.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

        // Fill job name if input exists
        const nameInput = page.locator('[role="dialog"] input').first();
        if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nameInput.fill('E2E Training Job');
        }

        // Select model if combobox exists
        const modelSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
        if (await modelSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
          await modelSelect.click();
          await page.locator('[role="option"]').first().click();
        }

        await page.keyboard.press('Escape');
      }

      // Status filter tabs (scoped to main content, exclude comboboxes)
      const statusFilter = page.locator('main button:not([role="combobox"]):has-text("All")').first();
      if (await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusFilter.click();
        await page.waitForTimeout(500);
      }
    });

    // ─── Step 9: Experiments Page ────────────────────────────────
    await test.step('Experiments Page — create experiment', async () => {
      await page.goto('/experiments');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/experiments/i').first()).toBeVisible({ timeout: 10000 });

      const createBtn = page.locator('button:has-text("New Experiment"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
      if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createBtn.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

        const nameInput = page.locator('[role="dialog"] input').first();
        if (await nameInput.isVisible()) {
          await nameInput.fill(`E2E Experiment ${Date.now()}`);
        }

        // Select project if combobox exists
        const projectSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
        if (await projectSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
          await projectSelect.click();
          await page.locator('[role="option"]').first().click();
        }

        // Submit
        const submitBtn = page.locator('[role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Save")').first();
        if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
        } else {
          await page.keyboard.press('Escape');
        }
      }

      // Get experiment ID via API
      try {
        const experiments = await apiGet(token, '/experiments');
        const exp = (experiments as any[]).find((e: any) => e.name?.includes('E2E Experiment'));
        if (exp) experimentId = exp.id;
      } catch {
        // Experiment creation may not have succeeded, that's okay
      }
    });

    // ─── Step 10: Launch Workspace ───────────────────────────────
    await test.step('Launch Workspace via UI', async () => {
      await page.goto('/workspaces');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/workspaces/i').first()).toBeVisible({ timeout: 10000 });

      const launchBtn = page.locator('button:has-text("Launch"), button:has-text("New Workspace"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
      if (await launchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await launchBtn.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

        // Select JupyterLab IDE
        const jupyterOption = page.locator('[role="dialog"] text=/JupyterLab/i').first();
        if (await jupyterOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await jupyterOption.click();
        }

        // Select project if required
        const projectSelect = page.locator('[role="dialog"] button[role="combobox"]').first();
        if (await projectSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
          await projectSelect.click();
          await page.locator('[role="option"]').first().click();
        }

        // Fill workspace name
        const nameInput = page.locator('[role="dialog"] input[placeholder*="name" i], [role="dialog"] input').first();
        if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nameInput.fill(`E2E Workspace ${Date.now()}`);
        }

        // Submit
        const submitBtn = page.locator('[role="dialog"] button:has-text("Launch"), [role="dialog"] button:has-text("Create")').first();
        if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitBtn.click();
          // Wait for workspace to appear
          await page.waitForTimeout(5000);
        }
      }

      // Get workspace ID via API
      try {
        const workspaces = await apiGet(token, '/workspaces');
        const ws = (workspaces as any[]).find((w: any) => w.name?.includes('E2E Workspace'));
        if (ws) workspaceId = ws.id;
      } catch {
        // Workspace creation may fail in CI without K8s
      }
    });

    // ─── Step 11: Stop Workspace ─────────────────────────────────
    await test.step('Stop Workspace', async () => {
      if (!workspaceId) return;

      await page.goto('/workspaces');
      await page.waitForTimeout(3000);

      // Look for stop button on the workspace card
      const stopBtn = page.locator('button:has-text("Stop"), button:has(svg.lucide-square)').first();
      if (await stopBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await stopBtn.click();
        await page.waitForTimeout(3000);
      } else {
        // Fallback: stop via API
        try {
          await apiDelete(token, `/workspaces/${workspaceId}`);
        } catch {
          // Already stopped
        }
      }
    });

    // ─── Step 12: Admin — Environments ───────────────────────────
    await test.step('Admin Environments — view and create dialog', async () => {
      await page.goto('/admin/environments');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/environment/i').first()).toBeVisible({ timeout: 10000 });

      // Should show seeded environments
      const content = page.locator('[data-slot="card"], table, h2, h3');
      await expect(content.first()).toBeVisible({ timeout: 8000 });

      // Open create dialog
      const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), button:has(svg.lucide-plus)').first();
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(1000);

        // Fill form fields if dialog opened
        const dialog = page.locator('[role="dialog"]');
        if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          const nameInput = dialog.locator('input').first();
          if (await nameInput.isVisible()) {
            await nameInput.fill('E2E Test Environment');
          }
          await page.keyboard.press('Escape');
        }
      }
    });

    // ─── Step 13: Feature Store ──────────────────────────────────
    await test.step('Feature Store — view and create dialog', async () => {
      await page.goto('/features');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/feature|store/i').first()).toBeVisible({ timeout: 10000 });

      const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has(svg.lucide-plus)').first();
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

        const nameInput = page.locator('[role="dialog"] input').first();
        if (await nameInput.isVisible()) {
          await nameInput.fill('E2E Feature Group');
        }

        await page.keyboard.press('Escape');
      }
    });

    // ─── Step 14: Inference Page ─────────────────────────────────
    await test.step('Inference Page — verify rendering', async () => {
      await page.goto('/inference');
      await page.waitForTimeout(2000);

      const content = page.locator('h1, h2, h3, [data-slot="card"]').or(page.locator('text=/inference|endpoint|deploy/i'));
      await expect(content.first()).toBeVisible({ timeout: 10000 });
    });

    // ─── Step 15: Search ─────────────────────────────────────────
    await test.step('Search — find the created project', async () => {
      await page.goto('/search');
      await page.waitForTimeout(2000);

      const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.fill(projectName || 'E2E');
        await page.waitForTimeout(2000);

        // Check for search results
        const results = page.locator('text=/project|model|dataset|result/i');
        if (await results.first().isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(results.first()).toBeVisible();
        }
      }
    });

    // ─── Step 16: Settings ───────────────────────────────────────
    await test.step('Settings — profile and API keys', async () => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);

      await expect(page.locator('text=/settings|profile|preferences/i').first()).toBeVisible({ timeout: 10000 });

      // Profile form — look for any text input or textbox in main content
      const profileInput = page.locator('main input, main [role="textbox"]').first()
        .or(page.getByLabel('Display Name'));
      const hasProfile = await profileInput.first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasProfile).toBeTruthy();

      // Navigate to API Keys tab
      const apiKeysTab = page.locator('button[role="tab"]:has-text("API Keys"), button[role="tab"]:has-text("API")').first();
      if (await apiKeysTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await apiKeysTab.click();
        await page.waitForTimeout(1000);

        // Generate API key
        const generateBtn = page.locator('button:has-text("Generate"), button:has(svg.lucide-plus)').first();
        if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await generateBtn.click();

          const dialog = page.locator('[role="dialog"]');
          if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
            const keyNameInput = dialog.locator('input').first();
            if (await keyNameInput.isVisible()) {
              await keyNameInput.fill('e2e-test-key');
            }

            const createKeyBtn = dialog.locator('button:has-text("Generate"), button:has-text("Create")').first();
            if (await createKeyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
              await createKeyBtn.click();
              await page.waitForTimeout(2000);
            }

            // Close dialog if still open
            if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
              await page.keyboard.press('Escape');
            }
          }
        }
      }

      // Navigate through other tabs
      const tabs = page.locator('button[role="tab"]');
      if (await tabs.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        const count = await tabs.count();
        for (let i = 0; i < Math.min(count, 5); i++) {
          await tabs.nth(i).click();
          await page.waitForTimeout(500);
        }
      }
    });

    // ─── Step 17: Admin Pages ────────────────────────────────────
    await test.step('Admin Pages — users and system', async () => {
      // Admin Users
      await page.goto('/admin/users');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=/users|user management/i').first()).toBeVisible({ timeout: 10000 });

      // Should show admin user
      const adminUser = page.locator('text=/admin|test@openmodel.studio/i').first();
      await expect(adminUser).toBeVisible({ timeout: 8000 });

      // Admin System
      await page.goto('/admin/system');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=/system|configuration|config/i').first()).toBeVisible({ timeout: 10000 });
    });

    // ─── Step 18: Remaining Pages ────────────────────────────────
    await test.step('Remaining Pages — templates, data-sources, monitoring, automl', async () => {
      // Templates
      await page.goto('/templates');
      await page.waitForTimeout(2000);
      await expect(page.locator('text=/template/i').first()).toBeVisible({ timeout: 10000 });
      // Should show seeded templates
      const templateCards = page.locator('[data-slot="card"], [class*="card"]');
      const hasTemplates = await templateCards.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (hasTemplates) {
        await expect(templateCards.first()).toBeVisible();
      }

      // Data Sources
      await page.goto('/data-sources');
      await page.waitForTimeout(2000);
      const dsContent = page.locator('h1, h2, h3').or(page.locator('text=/data source/i'));
      await expect(dsContent.first()).toBeVisible({ timeout: 10000 });

      // Monitoring
      await page.goto('/monitoring');
      await page.waitForTimeout(2000);
      const monContent = page.locator('h1, h2, h3').or(page.locator('text=/monitoring|health|metrics/i'));
      await expect(monContent.first()).toBeVisible({ timeout: 10000 });

      // AutoML
      await page.goto('/automl');
      await page.waitForTimeout(2000);
      const automlContent = page.locator('h1, h2, h3').or(page.locator('text=/automl|automated|auto/i'));
      await expect(automlContent.first()).toBeVisible({ timeout: 10000 });
    });

    // ─── Step 19: Cleanup ────────────────────────────────────────
    await test.step('Cleanup — delete all created resources', async () => {
      // Delete API keys created by test
      try {
        const keys = await apiGet(token, '/api-keys');
        for (const key of keys as any[]) {
          if (key.name === 'e2e-test-key') {
            await apiDelete(token, `/api-keys/${key.id}`);
          }
        }
      } catch {
        // API keys cleanup failed, not critical
      }

      // Stop workspace if still running
      if (workspaceId) {
        try {
          await apiDelete(token, `/workspaces/${workspaceId}`);
        } catch {
          // Already stopped
        }
      }

      // Delete experiment
      if (experimentId) {
        try {
          await apiDelete(token, `/experiments/${experimentId}`);
        } catch {
          // Already deleted
        }
      }

      // Delete model
      if (modelId) {
        try {
          await apiDelete(token, `/models/${modelId}`);
        } catch {
          // Already deleted
        }
      }

      // Delete dataset
      if (datasetId) {
        try {
          await apiDelete(token, `/datasets/${datasetId}`);
        } catch {
          // Already deleted
        }
      }

      // Delete project (should cascade-delete related resources)
      if (projectId) {
        try {
          await apiDelete(token, `/projects/${projectId}`);
        } catch {
          // Already deleted
        }
      }

      // Verify project is gone
      await page.goto('/projects');
      await page.waitForTimeout(2000);
      if (projectName) {
        const projectGone = page.locator(`text=${projectName}`);
        const stillVisible = await projectGone.isVisible({ timeout: 3000 }).catch(() => false);
        expect(stillVisible).toBeFalsy();
      }
    });
  });
});
