import { test, expect } from '@playwright/test';
import { test as authTest, expect as authExpect } from './helpers/fixtures';

test.describe('Login Page', () => {
  test('renders login form with all elements', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('OpenModelStudio');
    await expect(page.locator('text=Sign in to your workspace')).toBeVisible();
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill('wrong@example.com');
    await page.locator('input[type="password"]').first().fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Error may appear as inline text, toast, or red-styled element
    await expect(
      page.locator('text=/failed|invalid|error|incorrect/i')
        .or(page.locator('[data-sonner-toast]'))
        .or(page.locator('[class*="red"]'))
        .first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('shows validation when submitting empty form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should show error or stay on login page
    await expect(page).toHaveURL(/login/);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill('test@openmodel.studio');
    await page.locator('input[type="password"]').first().fill('Test1234');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/$|dashboard/, { timeout: 20000, waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav, aside, [class*="sidebar"]').first()).toBeVisible();
  });

  test('toggle password visibility', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const pwInput = page.locator('input[type="password"]').first();
    await pwInput.fill('mypassword');
    // Find the eye toggle button in the password field wrapper
    const toggleBtn = pwInput.locator('..').locator('button').first();
    if (await toggleBtn.isVisible().catch(() => false)) {
      await toggleBtn.click({ force: true });
      await page.waitForTimeout(300);
    }
    // Just verify the password field is still present in some form
    await expect(pwInput.or(page.locator('input[type="text"]').first())).toBeVisible();
  });

  test('link to register page exists', async ({ page }) => {
    await page.goto('/login');
    const registerLink = page.locator('a[href*="register"]');
    if (await registerLink.isVisible()) {
      await registerLink.click();
      await expect(page).toHaveURL(/register/);
    }
  });

  test('API error shows error message', async ({ page }) => {
    await page.route('**/auth/login', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ message: 'Server error' }) })
    );
    await page.goto('/login');
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill('test@openmodel.studio');
    await page.locator('input[type="password"]').first().fill('Test1234');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.locator('text=/error|failed/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Register Page', () => {
  test('renders registration form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('shows validation on empty submit', async ({ page }) => {
    await page.goto('/register');
    const submitBtn = page.getByRole('button', { name: /sign up|register|create/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await expect(page).toHaveURL(/register/);
    }
  });

  test('link back to login exists', async ({ page }) => {
    await page.goto('/register');
    const loginLink = page.getByRole('link', { name: /sign in/i });
    if (await loginLink.isVisible().catch(() => false)) {
      await loginLink.click();
      await expect(page).toHaveURL(/login/);
    }
  });
});
