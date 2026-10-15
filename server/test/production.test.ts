import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
const previousEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  origin: process.env.CLIENT_ORIGIN,
};
process.env.NODE_ENV = "production";
process.env.CLIENT_ORIGIN = "https://taskflow.example";
const { app, db } = await import("../src/app.js");
const email = `production-${Date.now()}@example.test`;
afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
  if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment.nodeEnv;
  if (previousEnvironment.origin === undefined)
    delete process.env.CLIENT_ORIGIN;
  else process.env.CLIENT_ORIGIN = previousEnvironment.origin;
});
describe("Single-origin production deployment", () => {
  it("serves the built client and supports direct navigation to React routes", async () => {
    const index = await request(app).get("/");
    expect(index.status).toBe(200);
    expect(index.type).toBe("text/html");
    expect(index.text).toContain('id="root"');
    const deep = await request(app).get(
      "/projects/2491530b-26a5-4c5e-9621-3d7dac6e3edb",
    );
    expect(deep.status).toBe(200);
    expect(deep.text).toBe(index.text);
    const asset = index.text.match(/src="([^"]+\.js)"/)?.[1];
    expect(asset).toBeDefined();
    expect((await request(app).get(asset!)).status).toBe(200);
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/missing.js")).status).toBe(404);
  });
  it("has a liveness endpoint independent of database queries", async () => {
    expect((await request(app).get("/healthz")).body).toEqual({ status: "ok" });
  });
  it("uses secure cookies on the deployed origin and rejects other origins", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://taskflow.example")
      .send({
        name: "Production check",
        email,
        password: "ProductionCheck!2026",
        role: "ASSIGNEE",
      });
    expect(registered.status).toBe(201);
    expect(registered.headers["set-cookie"][0]).toContain("Secure");
    expect(registered.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", "https://other.example")
          .send({ email, password: "ProductionCheck!2026" })
      ).status,
    ).toBe(403);
  });
});
