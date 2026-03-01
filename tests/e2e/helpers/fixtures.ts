import { test as base, type Page } from '@playwright/test';
import { DEFAULT_ADMIN, DEFAULT_ANALYST, type UserCredentials, apiLogin } from './api-client';

type Fixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  analystPage: Page;
};

async function authenticateViaAPI(page: Page, user: UserCredentials) {
  // Login via API to get a real token
  const token = await apiLogin(user);

  // Navigate to the app and inject the token into localStorage
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('auth_token', t);
  }, token);
  // Reload so the AuthProvider picks up the token
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Wait for the app shell to render (sidebar visible = authenticated)
  await page.waitForSelector('nav, aside, [class*="sidebar"]', { timeout: 10_000 });
  // Wait for framer-motion entrance animations to complete
  await page.waitForTimeout(1500);
}

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ page }, use) => {
    await authenticateViaAPI(page, DEFAULT_ADMIN);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    await authenticateViaAPI(page, DEFAULT_ADMIN);
    await use(page);
  },

  analystPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await authenticateViaAPI(page, DEFAULT_ANALYST);
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
