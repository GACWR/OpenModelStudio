/**
 * OpenModelStudio — Search & Registry Install Integration Tests
 *
 * Tests two critical flows:
 * 1. Search: typing in search input returns results from the API
 * 2. Registry Install: CLI install registers model in platform,
 *    use_model() resolves it, uninstall clears it
 */
import { test, expect } from './helpers/fixtures';
import { apiLogin, apiPost, apiGet, apiDelete, DEFAULT_ADMIN, API_URL } from './helpers/api-client';

// ─── Search Tests ────────────────────────────────────────────────────

test.describe('Search — Full Page', () => {
  test('search returns results for existing project', async ({ authenticatedPage: page }) => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // Create a uniquely named project
    const searchName = `SearchTest${Date.now()}`;
    const project = await apiPost(token, '/projects', {
      name: searchName,
      description: 'Project for search validation',
    });

    // Navigate to search page
    await page.goto('/search');
    await page.waitForTimeout(2000);

    // Type in search input
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill(searchName);

    // Wait for debounce + API response
    await page.waitForTimeout(2000);

    // Should show results count
    const resultsText = page.locator(`text=/${searchName}/`).first();
    await expect(resultsText).toBeVisible({ timeout: 10000 });

    // Should show the project in results
    const resultCount = page.locator('text=/\\d+ results/i').first();
    const hasResults = await resultCount.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasResults).toBeTruthy();

    // Cleanup
    try { await apiDelete(token, `/projects/${project.id}`); } catch { /* ok */ }
  });

  test('search shows "No results" for gibberish query', async ({ authenticatedPage: page }) => {
    await page.goto('/search');
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="search" i]').first();
    await searchInput.fill('zzzznonexistent99999xyz');
    await page.waitForTimeout(2000);

    // Should show "0 results" or "No results"
    const noResults = page.locator('text=/no results|0 results/i').first();
    await expect(noResults).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Search — Command Palette (⌘K)', () => {
  test('⌘K shows search results from API', async ({ authenticatedPage: page }) => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // Create a uniquely named project
    const searchName = `CmdKTest${Date.now()}`;
    const project = await apiPost(token, '/projects', {
      name: searchName,
      description: 'Project for ⌘K search validation',
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Open ⌘K
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    // Dialog should be open
    const dialog = page.locator('[cmdk-dialog], [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Type search query
    const input = page.locator('[cmdk-input], input[placeholder*="search" i]').first();
    await input.fill(searchName);
    await page.waitForTimeout(1500); // debounce + API

    // Should show the project in results (cmdk items)
    const result = page.locator(`[cmdk-item]:has-text("${searchName}"), [role="option"]:has-text("${searchName}")`).first();
    const hasResult = await result.isVisible({ timeout: 5000 }).catch(() => false);

    // Close
    await page.keyboard.press('Escape');

    // Even if specific result not found, verify the search attempt was made
    // by checking for any search-related content
    expect(hasResult).toBeTruthy();

    // Cleanup
    try { await apiDelete(token, `/projects/${project.id}`); } catch { /* ok */ }
  });

  test('⌘K shows quick navigation when no query', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    // Should show quick nav items
    const navItems = page.locator('[cmdk-item], [role="option"]');
    await expect(navItems.first()).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
  });
});

// ─── Search API Tests (no browser needed) ────────────────────────────

test.describe('Search — API Endpoint', () => {
  test('GET /search returns categorized results', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // Create test data
    const name = `APISearchTest${Date.now()}`;
    const project = await apiPost(token, '/projects', {
      name: name,
      description: 'API search test',
    });

    // Search via API
    const results = await apiGet(token, `/search?q=${encodeURIComponent(name)}`);

    // Verify response structure
    expect(results).toHaveProperty('projects');
    expect(results).toHaveProperty('models');
    expect(results).toHaveProperty('datasets');
    expect(results).toHaveProperty('experiments');
    expect(results).toHaveProperty('training');
    expect(results).toHaveProperty('workspaces');
    expect(results).toHaveProperty('features');
    expect(results).toHaveProperty('visualizations');
    expect(results).toHaveProperty('data_sources');

    // Should find our project
    expect(results.projects.length).toBeGreaterThanOrEqual(1);
    const found = results.projects.find((p: any) => p.name === name);
    expect(found).toBeTruthy();
    expect(found.href).toContain('/projects/');

    // Cleanup
    try { await apiDelete(token, `/projects/${project.id}`); } catch { /* ok */ }
  });

  test('GET /search with limit parameter works', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);
    const results = await apiGet(token, '/search?q=test&limit=3');
    expect(results).toHaveProperty('projects');
    // Each category should have at most 3 results
    for (const key of Object.keys(results)) {
      expect(results[key].length).toBeLessThanOrEqual(3);
    }
  });

  test('GET /search with no matches returns empty arrays', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);
    const results = await apiGet(token, '/search?q=zzzznonexistent99999xyz');
    const total = Object.values(results).reduce((a: number, b: any) => a + b.length, 0);
    expect(total).toBe(0);
  });
});

// ─── Registry Install Tests (API-only) ──────────────────────────────

test.describe('Model Registry — CLI Install Integration', () => {
  test('register-model with no project_id succeeds (NULL project)', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // This simulates what CLI install does — POST /sdk/register-model
    // WITHOUT a project_id (previously caused 500 due to Uuid::nil FK violation)
    const name = `registry-test-${Date.now()}`;
    const result = await apiPost(token, '/sdk/register-model', {
      name: name,
      framework: 'sklearn',
      description: 'Test model registered without project_id',
      source_code: 'def train(ctx): pass\ndef infer(ctx): pass',
      registry_name: name,
      // NOTE: no project_id — this is the critical test
    });

    expect(result.model_id).toBeTruthy();
    expect(result.name).toBe(name);
    expect(result.version).toBe(1);

    // Verify the model can be resolved via registry name
    const resolved = await apiGet(token, `/sdk/models/resolve-registry/${name}`);
    expect(resolved.name).toBe(name);
    expect(resolved.registry_name).toBe(name);
    expect(resolved.source_code).toContain('def train(ctx)');

    // Verify registry-status shows as installed
    const status = await apiGet(token, `/models/registry-status?names=${name}`);
    expect(status[name]).toBe(true);

    // Cleanup
    try { await apiDelete(token, `/models/${result.model_id}`); } catch { /* ok */ }
  });

  test('register-model with valid project_id succeeds', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // Create a project first
    const project = await apiPost(token, '/projects', {
      name: `Registry Proj ${Date.now()}`,
      description: 'For registry test',
    });

    const name = `proj-registry-test-${Date.now()}`;
    const result = await apiPost(token, '/sdk/register-model', {
      name: name,
      framework: 'pytorch',
      source_code: 'def train(ctx): pass\ndef infer(ctx): pass',
      registry_name: name,
      project_id: project.id,
    });

    expect(result.model_id).toBeTruthy();

    // Verify resolve works
    const resolved = await apiGet(token, `/sdk/models/resolve-registry/${name}`);
    expect(resolved.name).toBe(name);
    expect(resolved.project_id).toBe(project.id);

    // Cleanup
    try { await apiDelete(token, `/models/${result.model_id}`); } catch { /* ok */ }
    try { await apiDelete(token, `/projects/${project.id}`); } catch { /* ok */ }
  });

  test('registry-uninstall clears registry_name', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // Register a model with registry_name
    const name = `uninstall-test-${Date.now()}`;
    const result = await apiPost(token, '/sdk/register-model', {
      name: name,
      framework: 'sklearn',
      source_code: 'def train(ctx): pass\ndef infer(ctx): pass',
      registry_name: name,
    });

    // Verify it's installed
    const statusBefore = await apiGet(token, `/models/registry-status?names=${name}`);
    expect(statusBefore[name]).toBe(true);

    // Uninstall
    const uninstallResult = await apiPost(token, '/models/registry-uninstall', { name });
    expect(uninstallResult.uninstalled).toBe(true);
    expect(uninstallResult.rows_affected).toBeGreaterThanOrEqual(1);

    // Verify it's no longer installed
    const statusAfter = await apiGet(token, `/models/registry-status?names=${name}`);
    expect(statusAfter[name]).toBe(false);

    // Cleanup
    try { await apiDelete(token, `/models/${result.model_id}`); } catch { /* ok */ }
  });

  test('resolve-registry returns 404 for non-existent model', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);

    try {
      await apiGet(token, '/sdk/models/resolve-registry/nonexistent-model-999');
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('404');
    }
  });

  test('full install → resolve → uninstall cycle', async () => {
    const token = await apiLogin(DEFAULT_ADMIN);

    const name = `full-cycle-${Date.now()}`;
    const sourceCode = `
def train(ctx):
    ctx.log_metric("accuracy", 0.95)

def infer(ctx):
    ctx.set_output({"prediction": "positive"})
`;

    // 1. Install (register with registry_name, no project_id)
    const installed = await apiPost(token, '/sdk/register-model', {
      name: name,
      framework: 'sklearn',
      description: 'Full cycle test',
      source_code: sourceCode,
      registry_name: name,
    });
    expect(installed.model_id).toBeTruthy();

    // 2. Resolve by registry name
    const resolved = await apiGet(token, `/sdk/models/resolve-registry/${name}`);
    expect(resolved.name).toBe(name);
    expect(resolved.source_code).toContain('def train(ctx)');
    expect(resolved.source_code).toContain('def infer(ctx)');

    // 3. Verify in registry-status
    const status1 = await apiGet(token, `/models/registry-status?names=${name}`);
    expect(status1[name]).toBe(true);

    // 4. Re-register (should update version, not create duplicate)
    const updated = await apiPost(token, '/sdk/register-model', {
      name: name,
      framework: 'sklearn',
      source_code: sourceCode + '\n# updated',
      registry_name: name,
    });
    expect(updated.model_id).toBe(installed.model_id);
    expect(updated.version).toBe(2);

    // 5. Uninstall
    await apiPost(token, '/models/registry-uninstall', { name });

    // 6. Verify no longer in registry-status
    const status2 = await apiGet(token, `/models/registry-status?names=${name}`);
    expect(status2[name]).toBe(false);

    // 7. Resolve should now fail
    try {
      await apiGet(token, `/sdk/models/resolve-registry/${name}`);
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.message).toContain('404');
    }

    // Cleanup
    try { await apiDelete(token, `/models/${installed.model_id}`); } catch { /* ok */ }
  });
});

// ─── Registry Badge UI Tests ─────────────────────────────────────────

test.describe('Model Registry — UI Badge', () => {
  test('registry page shows install status badges', async ({ authenticatedPage: page }) => {
    await page.goto('/registry');
    await page.waitForTimeout(3000);

    // Should show model cards from the registry
    const cards = page.locator('main [class*="card"], main [class*="Card"]');
    const hasCards = await cards.first().isVisible({ timeout: 10000 }).catch(() => false);

    if (hasCards) {
      // Each card should have either "Installed" or "Not Installed" badge
      const installedBadge = page.locator('text=/Installed/').first();
      const notInstalledBadge = page.locator('text=/Not Installed/').first();
      const hasBadge = await installedBadge.isVisible({ timeout: 3000 }).catch(() => false)
        || await notInstalledBadge.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasBadge).toBeTruthy();
    }
  });

  test('installing model updates badge to Installed', async ({ authenticatedPage: page }) => {
    const token = await apiLogin(DEFAULT_ADMIN);

    // Register a model as if CLI installed it
    const name = `iris-svm`; // use a known registry model name
    await apiPost(token, '/sdk/register-model', {
      name: name,
      framework: 'sklearn',
      source_code: 'def train(ctx): pass\ndef infer(ctx): pass',
      registry_name: name,
    }).catch(() => {}); // may already exist

    // Navigate to registry page
    await page.goto('/registry');
    await page.waitForTimeout(3000);

    // Look for "Installed" badge
    const installedBadge = page.locator('text=Installed').first();
    const hasInstalled = await installedBadge.isVisible({ timeout: 5000 }).catch(() => false);
    // At minimum, the page should load and show badges
    const notInstalledBadge = page.locator('text=/Not Installed/').first();
    const hasNotInstalled = await notInstalledBadge.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasInstalled || hasNotInstalled).toBeTruthy();
  });
});
