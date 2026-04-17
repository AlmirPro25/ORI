
import { test, expect } from '@playwright/test';

test.describe('StreamForge Auth System', () => {
  
  test('should execute full login flow', async ({ page }) => {
    // 1. Acessa página de login
    await page.goto('http://localhost:5173/login');
    
    // 2. Preenche credenciais (assumindo que o usuário existe no seed)
    await page.fill('input[type="email"]', 'admin@streamforge.com');
    await page.fill('input[type="password"]', 'admin123');
    
    // 3. Submete
    await page.click('button[type="submit"]');

    // 4. Verifica redirecionamento e persistência
    await expect(page).toHaveURL('http://localhost:5173/');
    
    const localStorage = await page.evaluate(() => window.localStorage.getItem('streamforge-auth'));
    expect(localStorage).toContain('token');
  });

  test('should block invalid credentials', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'hacker@fail.com');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });
});
