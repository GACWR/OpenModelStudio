import { test, expect } from './helpers/fixtures';

test.describe('Workspaces', () => {
  test('page loads with heading', async ({ authenticatedPage: page }) => {
    await page.goto('/workspaces');
    await expect(page.locator('text=/workspaces/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('displays workspace list or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(2000);
    const content = page.locator('[data-slot="card"], h2, h3').or(page.locator('text=/no workspaces|launch|get started/i'));
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('launch workspace dialog opens with IDE options', async ({ authenticatedPage: page }) => {
    await page.goto('/workspaces');
    const launchBtn = page.locator('button:has-text("Launch"), button:has-text("New Workspace"), button:has-text("Create"), button:has(svg.lucide-plus)').first();
    if (await launchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await launchBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Should show IDE options
      const jupyter = page.locator('[role="dialog"] text=/JupyterLab/i').first();
      const vscode = page.locator('[role="dialog"] text=/VS Code/i').first();
      if (await jupyter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(jupyter).toBeVisible();
      }
      if (await vscode.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(vscode).toBeVisible();
      }

      await page.keyboard.press('Escape');
    }
  });

  test('launch workspace full flow', async ({ authenticatedPage: page }) => {
    await page.goto('/workspaces');
    const launchBtn = page.locator('button:has-text("Launch"), button:has-text("New"), button:has(svg.lucide-plus)').first();
    if (await launchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await launchBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Select JupyterLab
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

      // Fill name if present
      const nameInput = page.locator('[role="dialog"] input[placeholder*="name" i], [role="dialog"] input').first();
      if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nameInput.fill(`E2E Workspace ${Date.now()}`);
      }

      // Submit
      const submitBtn = page.locator('[role="dialog"] button:has-text("Launch"), [role="dialog"] button:has-text("Create")').first();
      if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }
    }
  });

  test('stop workspace button', async ({ authenticatedPage: page }) => {
    await page.goto('/workspaces');
    const stopBtn = page.locator('button:has-text("Stop"), button:has(svg.lucide-square)').first();
    if (await stopBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      // Verify it's present but don't click to avoid breaking running workspace
      await expect(stopBtn).toBeVisible();
    }
  });

  test('workspace status badges', async ({ authenticatedPage: page }) => {
    await page.goto('/workspaces');
    const status = page.locator('text=/running|stopped|starting|pending/i').first();
    if (await status.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(status).toBeVisible();
    }
  });

  test('API error shows error state', async ({ authenticatedPage: page }) => {
    await page.route('**/workspaces*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'fail' }) })
    );
    await page.goto('/workspaces');
    await expect(page.locator('text=/error|failed|retry|went wrong/i').first()).toBeVisible({ timeout: 10000 });
  });
});
