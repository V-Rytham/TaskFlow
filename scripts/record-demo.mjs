import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const baseURL = "https://taskflow-ir9c.onrender.com";
const directory = resolve(".local/demo-recording");
await mkdir(directory, { recursive: true });
const stamp = Date.now();
const password = `Demo!${randomBytes(14).toString("hex")}`;
const accounts = {
  head: { name: "Avery Morgan", email: `head.demo.${stamp}@example.test` },
  assignee: {
    name: "Riley Chen",
    email: `assignee.demo.${stamp}@example.test`,
  },
  password,
};
await writeFile(
  resolve(directory, "accounts.json"),
  JSON.stringify(accounts, null, 2),
);
const browsers = [];
const contexts = [];
const stages = [];
const checks = [];
let startedAt;
let head;
let assignee;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function stage(title, caption, active = "both") {
  const entry = {
    title,
    caption,
    active,
    start: (Date.now() - startedAt) / 1000,
  };
  stages.push(entry);
  console.log(`STAGE ${stages.length}: ${title}`);
}
async function type(page, label, value) {
  const field =
    label === "Description"
      ? page.locator('textarea[name="description"]')
      : page.getByLabel(label, { exact: true });
  await field.fill("");
  await field.pressSequentially(value, { delay: 28 });
}
async function register(page, account, role) {
  await type(page, "Full name", account.name);
  await type(page, "Email address", account.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", {
      name: role === "PROJECT_HEAD" ? /Project Head Lead/ : /Assignee Focus/,
    })
    .click();
  await pause(1200);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("All changes synced")).toBeVisible({
    timeout: 90000,
  });
}
function card(page, title) {
  return page
    .locator(".task-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}
async function inColumn(page, title, status) {
  await expect(
    page
      .getByRole("region", { name: status, exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible({ timeout: 30000 });
}
async function drag(page, title, status) {
  const from = await card(page, title)
    .getByRole("button", { name: `Drag ${title}`, exact: true })
    .boundingBox();
  const to = await page
    .getByRole("region", { name: status, exact: true })
    .boundingBox();
  if (!from || !to) throw new Error("A drag source or destination is missing.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await pause(350);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 160, { steps: 55 });
  await pause(500);
  await page.mouse.up();
  await expect(page.getByText("Move this task?")).toBeVisible();
  await pause(1700);
}
async function confirm(page) {
  await page.getByRole("button", { name: "Confirm move", exact: true }).click();
  await expect(page.getByText("Move this task?")).toHaveCount(0, {
    timeout: 30000,
  });
}
async function assign(title, description) {
  await head.getByRole("button", { name: "Assign task", exact: true }).click();
  await type(head, "Task title", title);
  await type(head, "Description", description);
  await head
    .getByLabel("Search available people")
    .fill(accounts.assignee.email);
  await expect(
    head.getByRole("dialog").getByText(accounts.assignee.name, { exact: true }),
  ).toBeVisible();
  await pause(1500);
  await head.getByRole("button", { name: "Select", exact: true }).click();
  await pause(1000);
  await head
    .getByRole("dialog")
    .getByRole("button", { name: "Assign task", exact: true })
    .click();
  await inColumn(assignee, title, "To do");
  await inColumn(head, title, "To do");
}
try {
  const chrome = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--window-position=0,0", "--window-size=960,1000"],
  });
  browsers.push(chrome);
  const edge = await chromium.launch({
    channel: "msedge",
    headless: false,
    args: ["--window-position=960,0", "--window-size=960,1000"],
  });
  browsers.push(edge);
  for (const browser of browsers)
    contexts.push(
      await browser.newContext({
        viewport: { width: 960, height: 900 },
        recordVideo: { dir: directory, size: { width: 960, height: 900 } },
        baseURL,
      }),
    );
  [head, assignee] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  head.setDefaultTimeout(30000);
  assignee.setDefaultTimeout(30000);
  await Promise.all([
    head.goto("/register", { timeout: 120000 }),
    assignee.goto("/register", { timeout: 120000 }),
  ]);
  await Promise.all([
    expect(head.getByText("Find your flow.")).toBeVisible(),
    expect(assignee.getByText("Find your flow.")).toBeVisible(),
  ]);
  const videos = [head.video(), assignee.video()];
  startedAt = Date.now();
  stage(
    "Two browsers. Two roles. One shared workspace.",
    "Live deployed app | Chrome on the left, Microsoft Edge on the right",
  );
  await pause(4000);
  stage(
    "Create the Project Head account",
    "Avery will create projects, assign work, and monitor progress.",
    "head",
  );
  await register(head, accounts.head, "PROJECT_HEAD");
  checks.push("Project Head registered in Chrome");
  await pause(3000);
  stage(
    "Create the Assignee account",
    "Riley signs in independently and sees a personal task board.",
    "assignee",
  );
  await register(assignee, accounts.assignee, "ASSIGNEE");
  checks.push("Assignee registered in Edge");
  await pause(4000);
  stage(
    "Create a project",
    "The Project Head owns the project and manages its tasks.",
    "head",
  );
  await head
    .getByRole("button", { name: "Create project", exact: true })
    .last()
    .click();
  await type(head, "Project name", "Website launch");
  await type(
    head,
    "Description",
    "A focused workspace for the next product release.",
  );
  await pause(1500);
  await head
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    head.locator(".project-card").filter({ hasText: "Website launch" }),
  ).toBeVisible();
  await pause(3000);
  await head
    .locator(".project-card")
    .filter({ hasText: "Website launch" })
    .click();
  await expect(
    head.getByRole("heading", { name: "Website launch", exact: true }),
  ).toBeVisible();
  await pause(3500);
  stage(
    "Check who is available",
    "The Assignee is available because there is no active task.",
    "head",
  );
  await head
    .getByRole("button", { name: "Available people", exact: true })
    .click();
  await head
    .getByLabel("Search available people")
    .fill(accounts.assignee.email);
  await expect(
    head.getByRole("dialog").getByText(accounts.assignee.name, { exact: true }),
  ).toBeVisible();
  await pause(3500);
  await head.getByRole("button", { name: "Close dialog", exact: true }).click();
  let first = "Design the onboarding flow";
  stage(
    "Assign work and watch it arrive live",
    "Watch the right-hand board: the task appears without a refresh.",
    "head",
  );
  await assign(
    first,
    "Design the first-run screens and the path to a first task.",
  );
  checks.push("Assignment appeared live in the independent Assignee browser");
  await pause(6500);
  stage(
    "Open the task details",
    "The Assignee can inspect the project, assignment, status, and timestamps.",
    "assignee",
  );
  await card(assignee, first).locator(".task-open").click();
  await expect(assignee.getByText("Task details")).toBeVisible();
  await pause(5500);
  await assignee
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  stage(
    "Drag, confirm, or cancel",
    "Canceling a move keeps the task in its original column.",
    "assignee",
  );
  await drag(assignee, first, "In progress");
  await assignee.getByRole("button", { name: "Cancel", exact: true }).click();
  await inColumn(assignee, first, "To do");
  await inColumn(head, first, "To do");
  checks.push("Canceled drag preserved original status");
  await pause(3000);
  stage(
    "Start work and sync the Project Head board",
    "Confirm the move on the right; the left-hand board updates live.",
    "assignee",
  );
  await drag(assignee, first, "In progress");
  await confirm(assignee);
  await inColumn(head, first, "In progress");
  checks.push("Assignee status change appeared live in Project Head browser");
  await pause(6500);
  stage(
    "Edit task details from the Project Head account",
    "The new title and description sync back to the Assignee.",
    "head",
  );
  await card(head, first).locator(".task-open").click();
  await head.getByRole("button", { name: "Edit task", exact: true }).click();
  const revised = "Design the onboarding flow - reviewed";
  await type(head, "Task title", revised);
  await type(
    head,
    "Description",
    "Include an accessible welcome screen and a short setup checklist.",
  );
  await pause(1500);
  await head.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(card(assignee, revised)).toBeVisible();
  await pause(3000);
  await head.getByRole("button", { name: "Close dialog", exact: true }).click();
  first = revised;
  checks.push("Edited task details appeared live in Assignee browser");
  await pause(3500);
  stage(
    "Complete the task",
    "Moving the task to Done updates both boards and frees the Assignee.",
    "assignee",
  );
  await drag(assignee, first, "Done");
  await confirm(assignee);
  await inColumn(head, first, "Done");
  checks.push("Completion synchronized to both browsers");
  await pause(6500);
  stage(
    "Availability updates immediately",
    "Riley is available again after completing the active task.",
    "head",
  );
  await head
    .getByRole("button", { name: "Available people", exact: true })
    .click();
  await head
    .getByLabel("Search available people")
    .fill(accounts.assignee.email);
  await expect(
    head.getByRole("dialog").getByText(accounts.assignee.name, { exact: true }),
  ).toBeVisible();
  checks.push("Completed task freed Assignee for another assignment");
  await pause(5000);
  await head.getByRole("button", { name: "Close dialog", exact: true }).click();
  const second = "Prepare the release checklist";
  stage(
    "Assign the next task",
    "The finished task remains in history while the next task arrives live.",
    "head",
  );
  await assign(second, "List the final checks for a smooth website release.");
  await pause(5500);
  stage(
    "Enforce one active task per person",
    "Reopening finished work is rejected while another active task exists.",
    "assignee",
  );
  await drag(assignee, first, "In progress");
  await assignee
    .getByRole("button", { name: "Confirm move", exact: true })
    .click();
  await expect(assignee.getByRole("alert")).toContainText(
    "already has an active task",
    { timeout: 30000 },
  );
  await inColumn(head, first, "Done");
  checks.push(
    "One-active-task conflict rejected reopening, preserving completed task",
  );
  await pause(6500);
  await assignee.getByRole("button", { name: "Cancel", exact: true }).click();
  await pause(2000);
  stage(
    "Finish the release checklist",
    "The second task completes and both cards stay visible as history.",
    "assignee",
  );
  await drag(assignee, second, "Done");
  await confirm(assignee);
  await inColumn(head, second, "Done");
  await pause(5500);
  stage(
    "Refresh to verify persistence",
    "Only now refresh the Assignee browser: completed work is restored.",
    "assignee",
  );
  await assignee.reload();
  await inColumn(assignee, first, "Done");
  await inColumn(assignee, second, "Done");
  await expect(assignee.getByText("All changes synced")).toBeVisible();
  checks.push("Refresh restored authentication and completed tasks");
  await pause(5000);
  stage(
    "Live collaboration verified",
    "Assignment, edits, status, availability, validation, and persistence demonstrated.",
  );
  await pause(7000);
  const endedAt = Date.now();
  await head.screenshot({ path: resolve("videos/demo-project-head.png") });
  await assignee.screenshot({ path: resolve("videos/demo-assignee.png") });
  const closedAt = Date.now();
  await Promise.all(contexts.map((context) => context.close()));
  const paths = await Promise.all(videos.map((video) => video.path()));
  await writeFile(
    resolve(directory, "timeline.json"),
    JSON.stringify(
      {
        baseURL,
        startedAt,
        endedAt,
        closedAt,
        stages,
        checks,
        videos: paths,
        success: true,
      },
      null,
      2,
    ),
  );
  console.log("RECORDING COMPLETE. All live synchronization checks passed.");
} catch (error) {
  console.error(error.message);
  if (head)
    await head
      .screenshot({ path: resolve(directory, "failure-head.png") })
      .catch(() => {});
  if (assignee)
    await assignee
      .screenshot({ path: resolve(directory, "failure-assignee.png") })
      .catch(() => {});
  await writeFile(
    resolve(directory, "failure.json"),
    JSON.stringify({ message: error.message, stages, checks }, null, 2),
  );
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  for (const browser of browsers) await browser.close().catch(() => {});
}
