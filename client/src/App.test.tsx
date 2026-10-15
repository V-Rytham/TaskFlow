// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), disconnect: vi.fn(), io: { on: vi.fn() } }),
}));
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const head = {
  id: "head",
  name: "Alex Morgan",
  email: "alex@example.test",
  role: "PROJECT_HEAD",
};
function mount(path = "/") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function respond(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: 200,
    json: async () => data,
  } as Response);
}
describe("Critical frontend flows", () => {
  it("protects routes and presents login errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      respond({ error: "Email or password is incorrect." }, false),
    );
    mount();
    const user = userEvent.setup();
    await screen.findByText("Welcome back.");
    await user.type(
      screen.getByLabelText("Email address"),
      "alex@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "invalid-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "incorrect",
    );
  });
  it("registers with an explicit mutually exclusive role", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) =>
        String(url).endsWith("/auth/me")
          ? respond({ error: "Unauthorized" }, false)
          : String(url).endsWith("/auth/register")
            ? respond({ user: { ...head, role: "ASSIGNEE" } })
            : respond([]),
      );
    mount("/register");
    const user = userEvent.setup();
    await screen.findByText("Find your flow.");
    await user.type(screen.getByLabelText("Full name"), "Casey Chen");
    await user.type(
      screen.getByLabelText("Email address"),
      "casey@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "SecurePass!2026");
    await user.click(screen.getByRole("button", { name: /Assignee Focus/ }));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, options]) =>
            String(url).endsWith("/auth/register") &&
            JSON.parse(options!.body as string).role === "ASSIGNEE",
        ),
      ).toBe(true),
    );
    await screen.findByRole("heading", { name: "My tasks" });
  });
  it("redirects after successful login and logout without losing the session query observer", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      String(url).endsWith("/auth/me")
        ? respond({ error: "Unauthorized" }, false)
        : String(url).endsWith("/auth/login")
          ? respond({ user: head })
          : respond([]),
    );
    mount("/login");
    const user = userEvent.setup();
    await screen.findByText("Welcome back.");
    await user.type(
      screen.getByLabelText("Email address"),
      "alex@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "SecurePass!2026");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Hello, Alex");
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByText("Welcome back.");
  });
  it("restores a head session and creates a project through the form", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) =>
        String(url).endsWith("/auth/me")
          ? respond({ user: head })
          : respond([]),
      );
    mount();
    const user = userEvent.setup();
    await screen.findByText("Hello, Alex");
    await user.click(
      screen.getAllByRole("button", { name: "Create project" })[1],
    );
    await user.type(screen.getByLabelText("Project name"), "A new launch");
    await user.type(
      screen.getByLabelText("Description"),
      "Make a useful thing",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Create project",
      }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, options]) =>
            String(url).endsWith("/projects") && options?.method === "POST",
        ),
      ).toBe(true),
    );
    expect((await screen.findByRole("status")).textContent).toContain("ready");
  });
  it("shows accessible task details, requires confirmation, and preserves status on cancel", async () => {
    const task = {
      id: "task",
      title: "Review the designs",
      description: "A useful review",
      status: "TODO",
      projectId: "project",
      assigneeId: "user",
      project: { name: "Website" },
      assignee: { name: "Casey Chen" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) =>
        String(url).endsWith("/auth/me")
          ? respond({ user: { ...head, role: "ASSIGNEE" } })
          : String(url).includes("/tasks")
            ? respond([task])
            : respond([]),
      );
    mount();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: /Review the designs A useful/,
      }),
    );
    expect(screen.getByText("Task details")).toBeDefined();
    await user.selectOptions(screen.getByLabelText("Task status"), "DONE");
    expect(screen.getByText("Move this task?")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === "PATCH"),
    ).toBe(false);
    await user.selectOptions(screen.getByLabelText("Task status"), "DONE");
    await user.click(screen.getByRole("button", { name: "Confirm move" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([, options]) => options?.method === "PATCH"),
      ).toBe(true),
    );
  });
});
