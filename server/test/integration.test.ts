import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import { app, httpServer, db, io } from "../src/app.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";

const stamp = `test-${Date.now()}`;
const password = "TestingFlow!2026";
const agents = {
  head: request.agent(app),
  other: request.agent(app),
  assignee: request.agent(app),
  spare: request.agent(app),
};
const ids: string[] = [];
const cookies: Record<string, string> = {};
let projectId: string;
let otherProjectId: string;
let taskId: string;
let secondTaskId: string;
let assigneeId: string;
let headId: string;
let url: string;
const sockets: Socket[] = [];
beforeAll(async () => {
  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server address");
  url = `http://127.0.0.1:${address.port}`;
  for (const [key, agent] of Object.entries(agents)) {
    const result = await agent.post("/api/auth/register").send({
      name: `Test ${key}`,
      email: `${stamp}-${key}@example.test`,
      password,
      role: key === "head" || key === "other" ? "PROJECT_HEAD" : "ASSIGNEE",
    });
    expect(result.status).toBe(201);
    ids.push(result.body.user.id);
    cookies[key] = result.headers["set-cookie"][0].split(";")[0];
    if (key === "assignee") assigneeId = result.body.user.id;
    if (key === "head") headId = result.body.user.id;
  }
}, 20000);
afterAll(async () => {
  sockets.forEach((socket) => socket.disconnect());
  await db.project.deleteMany({ where: { headId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await db.$disconnect();
});
async function socket(key?: string) {
  const s = connect(url, {
    transports: ["websocket"],
    ...(key ? { extraHeaders: { Cookie: cookies[key] } } : {}),
    reconnection: false,
  });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
function event(s: Socket, name: string) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`No ${name} received`)),
      3000,
    );
    s.once(name, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
describe.sequential("TaskFlow database and REST integration", () => {
  it("registers exclusive roles, hashes passwords using Argon2id, restores sessions", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: assigneeId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user.passwordHash, password)).toBe(true);
    expect(await argon2.verify(user.passwordHash, "wrong-password")).toBe(
      false,
    );
    expect((await agents.assignee.get("/api/auth/me")).body.user.id).toBe(
      assigneeId,
    );
    expect(
      (await agents.assignee.get("/api/auth/me")).body.user.passwordHash,
    ).toBeUndefined();
    expect(cookies.assignee).toContain("taskflow_session=");
  });
  it("rejects bad credentials, duplicate accounts, invalid roles and anonymous requests", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({
            email: `${stamp}-head@example.test`,
            password: "wrong-password",
          })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({
            name: "Copy",
            email: `${stamp}-head@example.test`,
            password,
            role: "ASSIGNEE",
          })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app).post("/api/auth/register").send({
          name: "Copy",
          email: "new@example.test",
          password,
          role: "ADMIN",
        })
      ).status,
    ).toBe(400);
    expect((await request(app).get("/api/tasks")).status).toBe(401);
    const result = await request(app)
      .post("/api/auth/login")
      .send({ email: `${stamp}-head@example.test`, password });
    expect(result.status).toBe(200);
    expect(result.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(result.headers["set-cookie"][0]).toContain("SameSite=Strict");
  });
  it("enforces roles and ownership while deriving ownership server-side", async () => {
    expect(
      (await agents.assignee.post("/api/projects").send({ name: "Forbidden" }))
        .status,
    ).toBe(403);
    expect((await agents.assignee.get("/api/assignees/available")).status).toBe(
      403,
    );
    const created = await agents.head.post("/api/projects").send({
      name: "Integration project",
      description: "Test workspace",
      headId: assigneeId,
    });
    expect(created.status).toBe(201);
    expect(created.body.headId).toBe(headId);
    projectId = created.body.id;
    otherProjectId = (
      await agents.other.post("/api/projects").send({ name: "Private project" })
    ).body.id;
    expect((await agents.other.get(`/api/projects/${projectId}`)).status).toBe(
      404,
    );
    expect(
      (await agents.assignee.get(`/api/projects/${projectId}`)).status,
    ).toBe(404);
  });
  it("authenticates sockets and denies unauthorized subscriptions", async () => {
    await expect(socket()).rejects.toThrow("Unauthorized");
    const other = await socket("other");
    const denied = await other
      .timeout(2000)
      .emitWithAck("subscribe:project", projectId);
    expect(denied.ok).toBe(false);
    const allowed = await other
      .timeout(2000)
      .emitWithAck("subscribe:project", otherProjectId);
    expect(allowed.ok).toBe(true);
  });
  it("broadcasts persisted task creation only to authorized sessions", async () => {
    const head = await socket("head");
    const assignee = await socket("assignee");
    const outsider = await socket("other");
    let leaked = false;
    outsider.on("task:created", () => {
      leaked = true;
    });
    const headEvent = event(head, "task:created");
    const assigneeEvent = event(assignee, "task:created");
    const created = await agents.head
      .post(`/api/projects/${projectId}/tasks`)
      .send({
        title: "Assigned work",
        description: "Integration details",
        assigneeId,
        status: "DONE",
      });
    expect(created.status).toBe(201);
    taskId = created.body.id;
    expect(created.body.status).toBe("TODO");
    expect((await headEvent).id).toBe(taskId);
    expect((await assigneeEvent).id).toBe(taskId);
    expect(await db.task.findUnique({ where: { id: taskId } })).not.toBeNull();
    expect(leaked).toBe(false);
  });
  it("rejects occupied assignees and Project Heads, and isolates visibility", async () => {
    expect(
      (
        await agents.head
          .post(`/api/projects/${projectId}/tasks`)
          .send({ title: "Conflict", assigneeId })
      ).status,
    ).toBe(409);
    expect(
      (
        await agents.head
          .post(`/api/projects/${projectId}/tasks`)
          .send({ title: "Invalid role", assigneeId: headId })
      ).status,
    ).toBe(400);
    expect(
      (
        await agents.other
          .post(`/api/projects/${projectId}/tasks`)
          .send({ title: "Other head", assigneeId })
      ).status,
    ).toBe(404);
    expect(
      (await agents.assignee.get("/api/tasks")).body.map(
        (t: { id: string }) => t.id,
      ),
    ).toContain(taskId);
    expect((await agents.spare.get("/api/tasks")).body).toEqual([]);
    expect(
      (await agents.other.get(`/api/tasks?projectId=${projectId}`)).body,
    ).toEqual([]);
    expect(
      (
        await agents.spare
          .patch(`/api/tasks/${taskId}/status`)
          .send({ status: "DONE" })
      ).status,
    ).toBe(404);
    expect(
      (
        await agents.assignee
          .patch(`/api/tasks/${taskId}`)
          .send({ title: "Changed" })
      ).status,
    ).toBe(403);
  });
  it("supports direct transitions, completion timestamps and live availability", async () => {
    const head = await socket("head");
    const assignee = await socket("assignee");
    const update = event(head, "task:updated");
    expect(
      (
        await agents.assignee
          .patch(`/api/tasks/${taskId}/status`)
          .send({ status: "IN_PROGRESS" })
      ).status,
    ).toBe(200);
    expect((await update).id).toBe(taskId);
    const completion = event(assignee, "task:completed");
    const available = event(head, "availability:changed");
    const done = await agents.assignee
      .patch(`/api/tasks/${taskId}/status`)
      .send({ status: "DONE" });
    expect(done.body.completedAt).not.toBeNull();
    await completion;
    await available;
    expect(
      (await agents.head.get("/api/assignees/available")).body.map(
        (u: { id: string }) => u.id,
      ),
    ).toContain(assigneeId);
    const reopened = await agents.assignee
      .patch(`/api/tasks/${taskId}/status`)
      .send({ status: "TODO" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.completedAt).toBeNull();
    await agents.assignee
      .patch(`/api/tasks/${taskId}/status`)
      .send({ status: "DONE" });
  });
  it("enforces the partial unique index for concurrent assignments and reopening", async () => {
    const responses = await Promise.all(
      [1, 2].map((n) =>
        agents.head
          .post(`/api/projects/${projectId}/tasks`)
          .send({ title: `Concurrent ${n}`, assigneeId }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    secondTaskId = responses.find((r) => r.status === 201)!.body.id;
    const reopen = await agents.assignee
      .patch(`/api/tasks/${taskId}/status`)
      .send({ status: "IN_PROGRESS" });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error).toContain("active task");
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: taskId } })).status,
    ).toBe("DONE");
    const index = await db.$queryRaw<
      { indexdef: string }[]
    >`SELECT indexdef FROM pg_indexes WHERE indexname = 'one_active_task_per_assignee'`;
    expect(index[0].indexdef).toContain("UNIQUE");
    expect(index[0].indexdef).toContain("WHERE");
  });
  it("edits and deletes only owned tasks and frees availability", async () => {
    expect(
      (await agents.other.delete(`/api/tasks/${secondTaskId}`)).status,
    ).toBe(404);
    expect(
      (
        await agents.head
          .patch(`/api/tasks/${taskId}`)
          .send({ title: "Updated title", description: "Updated description" })
      ).body.title,
    ).toBe("Updated title");
    expect(
      (await agents.head.delete(`/api/tasks/${secondTaskId}`)).status,
    ).toBe(204);
    expect(
      (
        await agents.assignee
          .patch(`/api/tasks/${taskId}/status`)
          .send({ status: "IN_PROGRESS" })
      ).status,
    ).toBe(200);
    expect((await agents.head.delete(`/api/tasks/${taskId}`)).status).toBe(204);
  });
  it("rejects tampered and expired JWTs and cross-origin socket connections", async () => {
    const token = cookies.assignee.split("=")[1];
    const payload = jwt.decode(token) as jwt.JwtPayload;
    const expired = jwt.sign({}, process.env.JWT_SECRET!, {
      subject: assigneeId,
      jwtid: payload.jti,
      expiresIn: -1,
    });
    expect(
      (
        await request(app)
          .get("/api/auth/me")
          .set("Cookie", `taskflow_session=${expired}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/auth/me")
          .set("Cookie", `taskflow_session=${token.slice(0, -8)}tampered`)
      ).status,
    ).toBe(401);
    const s = connect(url, {
      transports: ["websocket"],
      extraHeaders: {
        Cookie: cookies.assignee,
        Origin: "https://evil.example",
      },
      reconnection: false,
    });
    sockets.push(s);
    await expect(
      new Promise<void>((resolve, reject) => {
        s.once("connect", resolve);
        s.once("connect_error", reject);
      }),
    ).rejects.toThrow("Unauthorized");
  });
  it("blocks cross-origin writes and revokes only the logged-out session", async () => {
    const second = request.agent(app);
    const login = await second
      .post("/api/auth/login")
      .send({ email: `${stamp}-assignee@example.test`, password });
    cookies.assigneeSecond = login.headers["set-cookie"][0].split(";")[0];
    const otherSessionSocket = await socket("assigneeSecond");
    expect(
      (
        await agents.head
          .post("/api/projects")
          .set("Origin", "https://evil.example")
          .send({ name: "Attack" })
      ).status,
    ).toBe(403);
    expect((await agents.assignee.post("/api/auth/logout")).status).toBe(204);
    expect((await agents.assignee.get("/api/auth/me")).status).toBe(401);
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", cookies.assignee))
        .status,
    ).toBe(401);
    await expect(socket("assignee")).rejects.toThrow("Unauthorized");
    expect((await second.get("/api/auth/me")).status).toBe(200);
    expect(otherSessionSocket.connected).toBe(true);
  });
});
