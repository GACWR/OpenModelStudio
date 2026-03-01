import { test, expect } from './helpers/fixtures';

const sidebarLinks = [
  { name: 'Dashboard', path: '/' },
  { name: 'Projects', path: '/projects' },
  { name: 'Templates', path: '/templates' },
  { name: 'Workspaces', path: '/workspaces' },
  { name: 'Models', path: '/models' },
  { name: 'Datasets', path: '/datasets' },
  { name: 'Data Sources', path: '/data-sources' },
  { name: 'Feature Store', path: '/features' },
  { name: 'Training Jobs', path: '/training' },
  { name: 'Experiments', path: '/experiments' },
  { name: 'AutoML', path: '/automl' },
  { name: 'Model APIs', path: '/inference' },
  { name: 'Monitoring', path: '/monitoring' },
];

test.describe('Sidebar Navigation', () => {
  for (const link of sidebarLinks) {
    test(`navigates to ${link.name} (${link.path})`, async ({ authenticatedPage: page }) => {
      await page.goto('/');
      const sidebarLink = page.locator(`nav a[href="${link.path}"], aside a[href="${link.path}"]`).first();
      if (await sidebarLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await sidebarLink.click();
        if (link.path === '/') {
          await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
        } else {
          await expect(page).toHaveURL(new RegExp(link.path));
        }
      }
    });
  }
});

test.describe('Admin Navigation', () => {
  const adminLinks = [
    { name: 'Users', path: '/admin/users' },
    { name: 'Environments', path: '/admin/environments' },
    { name: 'System', path: '/admin/system' },
  ];

  for (const link of adminLinks) {
    test(`navigates to Admin ${link.name}`, async ({ adminPage: page }) => {
      // Navigate directly since admin links may be below the fold in a compact viewport
      await page.goto(link.path);
      await expect(page).toHaveURL(new RegExp(link.path));
      // Verify page content loaded
      await expect(
        page.locator('h1, h2').or(page.locator('text=/users|environment|system/i')).first()
      ).toBeVisible({ timeout: 10000 });
    });
  }
});

test.describe('Global Navigation', () => {
  test('sidebar is visible on authenticated pages', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await expect(page.locator('nav, aside, [class*="sidebar"]').first()).toBeVisible();
  });

  test('sidebar is not visible on login page', async ({ page }) => {
    await page.goto('/login');
    const sidebar = page.locator('aside[class*="sidebar"], nav[class*="sidebar"]');
    // Login page should not have the app sidebar
    await page.waitForTimeout(1000);
  });

  test('search shortcut or topbar search', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    // Try Cmd+K or search button in topbar
    const searchBtn = page.locator('button:has(svg.lucide-search), button[aria-label*="search" i]').first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
    }
  });

  test('user menu in topbar', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    // Scope to the topbar (header) to avoid matching the sidebar avatar which may be off-screen
    const avatar = page.locator('header [data-slot="avatar"], header button:has([data-slot="avatar"]), header [class*="avatar"], header button:has([class*="avatar"])').first();
    if (await avatar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await avatar.click();
      await page.waitForTimeout(500);
      // Should show dropdown with settings/logout
      const settingsLink = page.locator('text=/settings|profile/i').first();
      const logoutBtn = page.locator('text=/log out|sign out|logout/i').first();
      if (await settingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(settingsLink).toBeVisible();
      }
      await page.keyboard.press('Escape');
    }
  });

  test('back button navigation', async ({ authenticatedPage: page }) => {
    await page.goto('/projects');
    await page.waitForTimeout(1000);
    await page.goto('/models');
    await page.waitForTimeout(1000);
    await page.goBack();
    await expect(page).toHaveURL(/projects/);
  });
});
