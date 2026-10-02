import { expect, test } from "@playwright/test";

test("an application can be added manually and remains after reload", async ({ page }) => {
  await page.goto("/applications");
  await page.getByRole("button", { name: "+ Add application" }).click();

  const form = page.getByRole("heading", { name: "Add an application" }).locator("..");
  await form.getByLabel("Company").fill("E2E Manual Company");
  await form.getByLabel("Role title").fill("Software Engineering Intern");
  await form
    .getByLabel("Job posting URL")
    .fill("https://jobs.example.test/e2e-manual-intern");
  await form.getByLabel(/Location/).fill("Toronto, Ontario, Canada");
  await form.getByLabel("Country").selectOption("CA");
  await form.getByLabel("Applied date").fill("2026-10-01");
  await form.getByRole("button", { name: "Add application", exact: true }).click();

  await expect(page.getByRole("link", { name: "Software Engineering Intern" })).toBeVisible();
  await expect(page.getByText("E2E Manual Company", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "Software Engineering Intern" })).toBeVisible();
});
