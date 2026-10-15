import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
test.afterAll(() => {
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("server/scripts/cleanup-browser.ts"),
    ],
    { cwd: resolve("server"), stdio: "inherit" },
  );
});
const password = "TaskflowDemo!2026";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("All changes synced")).toBeVisible();
}
test("Two independent browser sessions synchronize tasks, confirmed drag and drop, and availability", async ({
  browser,
}) => {
  await mkdir("screenshots", { recursive: true });
  const headContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const assigneeContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const head = await headContext.newPage();
  const assignee = await assigneeContext.newPage();
  const errors: string[] = [];
  head.on("pageerror", (e) => errors.push(e.message));
  assignee.on("pageerror", (e) => errors.push(e.message));
  await head.goto("/login");
  await head.screenshot({ path: "screenshots/login.png", fullPage: true });
  await login(head, "alex@taskflow.local");
  await login(assignee, "casey@taskflow.local");
  await head.screenshot({
    path: "screenshots/head-dashboard.png",
    fullPage: true,
  });
  await head
    .getByRole("button", { name: "Create project", exact: true })
    .last()
    .click();
  await head
    .getByLabel("Project name")
    .fill(`Collaboration studio ${Date.now()}`);
  await head
    .getByLabel("Description", { exact: true })
    .fill("A shared space for our next product milestone.");
  await head
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(head.getByRole("status")).toContainText("ready");
  await head
    .locator(".project-card")
    .filter({ hasText: "Collaboration studio" })
    .first()
    .click();
  await head.getByRole("button", { name: "Assign task", exact: true }).click();
  const title = `Prepare launch checklist ${Date.now()}`;
  await head.getByLabel("Task title").fill(title);
  await head
    .getByLabel("Description", { exact: true })
    .fill("Bring together the final checks for a confident launch.");
  await head.getByLabel("Search available people").fill("Casey");
  await head.getByRole("button", { name: "Select", exact: true }).click();
  await head
    .getByRole("dialog")
    .getByRole("button", { name: "Assign task", exact: true })
    .click();
  await expect(
    assignee.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    head.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const card = assignee.locator(".task-card").filter({ hasText: title });
  async function dragTo(status: string) {
    const from = await card
      .getByRole("button", { name: `Drag ${title}` })
      .boundingBox();
    const to = await assignee
      .getByRole("region", { name: status, exact: true })
      .boundingBox();
    if (!from || !to) throw new Error("Missing drag target");
    await assignee.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2,
    );
    await assignee.mouse.down();
    await assignee.mouse.move(to.x + to.width / 2, to.y + 160, { steps: 20 });
    await assignee.mouse.up();
    await expect(assignee.getByText("Move this task?")).toBeVisible();
  }
  await dragTo("In progress");
  await assignee.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    assignee
      .getByRole("region", { name: "To do", exact: true })
      .getByRole("heading", { name: title }),
  ).toBeVisible();
  await dragTo("In progress");
  await assignee.getByRole("button", { name: "Confirm move" }).click();
  await expect(
    head
      .getByRole("region", { name: "In progress", exact: true })
      .getByRole("heading", { name: title }),
  ).toBeVisible();
  await head.screenshot({
    path: "screenshots/project-board.png",
    fullPage: true,
  });
  await assignee.screenshot({
    path: "screenshots/assignee-board.png",
    fullPage: true,
  });
  await card.locator(".task-open").click();
  await expect(assignee.getByText("Task details")).toBeVisible();
  await assignee.screenshot({
    path: "screenshots/task-details.png",
    fullPage: true,
  });
  await assignee.getByLabel("Task status").selectOption("DONE");
  await assignee.getByRole("button", { name: "Confirm move" }).click();
  await expect(
    head
      .getByRole("region", { name: "Done", exact: true })
      .getByRole("heading", { name: title }),
  ).toBeVisible();
  await head
    .getByRole("button", { name: "Available people", exact: true })
    .click();
  await expect(
    head.getByRole("dialog").getByText("Casey Chen", { exact: true }),
  ).toBeVisible();
  await head.screenshot({
    path: "screenshots/available-people.png",
    fullPage: true,
  });
  await head.getByRole("button", { name: "Close dialog" }).click();
  await assignee.reload();
  await expect(
    assignee
      .getByRole("region", { name: "Done", exact: true })
      .getByRole("heading", { name: title }),
  ).toBeVisible();
  await assignee.setViewportSize({ width: 390, height: 844 });
  await expect(
    assignee.getByRole("heading", { name: "My tasks", exact: true }),
  ).toBeVisible();
  await assignee.screenshot({ path: "screenshots/mobile.png", fullPage: true });
  const width = await assignee.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  await head
    .locator(".task-card")
    .filter({ hasText: title })
    .locator(".task-open")
    .click();
  await head.getByRole("button", { name: "Edit task" }).click();
  await head.getByLabel("Task title").fill(`${title} — reviewed`);
  await head.getByRole("button", { name: "Save changes" }).click();
  await expect(
    assignee.getByRole("heading", { name: `${title} — reviewed`, exact: true }),
  ).toBeAttached();
  await head.getByRole("button", { name: "Delete task", exact: true }).click();
  await head.getByRole("button", { name: "Confirm delete" }).click();
  await expect(
    assignee.getByRole("heading", { name: `${title} — reviewed`, exact: true }),
  ).toHaveCount(0);
  await head.getByRole("button", { name: "Log out" }).click();
  await expect(head.getByText("Welcome back.")).toBeVisible();
  expect(errors).toEqual([]);
  await headContext.close();
  await assigneeContext.close();
});
test("Registration signs in an Assignee and logout protects routes", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Demo QA Assignee");
  await page
    .getByLabel("Email address")
    .fill(`browser-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("BrowserTest!2026");
  await page.getByRole("button", { name: /Assignee Focus/ }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "My tasks", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto("/");
  await expect(page.getByText("Welcome back.")).toBeVisible();
});
