import { expect, test } from "@playwright/test";

test.describe("DealScout AI Next.js 15 E2E Flow", () => {
  test("Register, Verify Email, Login, Live SSE Deal Search, Price History & HITL Checkout Approval", async ({
    page,
  }) => {
    const uniqueEmail = `e2e_${Date.now()}@dealscout.ai`;

    // 1. Register
    await page.goto("/register");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.fill("#reg-name", "E2E Buyer");
    await page.fill("#reg-email", uniqueEmail);
    await page.fill("#reg-password", "StrongE2EPass!2026");
    await page.getByRole("button", { name: "הרשמה", exact: true }).click();

    // 2. Inline email verification -> redirects to /login
    const verifyBtn = page.getByRole("button", { name: /אמת אימייל והמשך להתחברות/ });
    await expect(verifyBtn).toBeVisible({ timeout: 15_000 });
    await verifyBtn.click();
    await page.waitForURL("**/login", { timeout: 15_000 });

    // 3. Login
    await page.fill("#login-email", uniqueEmail);
    await page.fill("#login-password", "StrongE2EPass!2026");
    await page.getByRole("button", { name: "התחברות", exact: true }).click();
    await page.waitForURL("**/", { timeout: 15_000 });

    // Navbar displays authenticated user & FREE tier quota
    await expect(page.getByRole("link", { name: "E2E Buyer" })).toBeVisible({ timeout: 10_000 });

    // 4. Trigger live SSE search via quick demo preset "Sony WH-1000XM5"
    await page.getByRole("button", { name: "Sony WH-1000XM5" }).click();

    // Verify ranked deal card appears with ILS landed price and action buttons
    const hitlBtn = page.getByRole("button", { name: /רכישה מאובטחת \(HITL\)/ }).first();
    await expect(hitlBtn).toBeVisible({ timeout: 20_000 });

    // 5. Open Price History Drawer & close it
    await page.getByRole("button", { name: /היסטוריית מחירים/ }).first().click();
    await expect(page.getByRole("heading", { name: /היסטוריית מחירים וניתוח מבצעים/ })).toBeVisible({ timeout: 10_000 });
    const closeHistory = page.getByRole("button", { name: /סגור/ }).first();
    if (await closeHistory.isVisible()) {
      await closeHistory.click();
    }

    // 6. Initiate HITL Checkout & Approve
    await hitlBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /אישור ביצוע \(APPROVED\)/ }).click();
    await expect(dialog.getByText(/הרכישה אושרה בהצלחה \(APPROVED\)/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
