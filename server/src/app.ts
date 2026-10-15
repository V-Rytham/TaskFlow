import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer } from "node:http";
import { mountClient } from "./client.js";
import { PrismaClient, Prisma, type User } from "@prisma/client";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { z } from "zod";

export const db = new PrismaClient();
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
const origin = (
  process.env.CLIENT_ORIGIN ??
  process.env.RENDER_EXTERNAL_URL ??
  "http://127.0.0.1:5173"
).replace(/\/$/, "");
export const app = express();
if (process.env.RENDER === "true") app.set("trust proxy", 1);
export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: { origin, credentials: true },
});
type AuthRequest = Request & { user?: User; sessionId?: string };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const safeUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
const authFromToken = async (token: string | undefined) => {
  if (!token) throw new HttpError(401, "Please sign in to continue.");
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    if (!payload.jti || !z.uuid().safeParse(payload.jti).success)
      throw new Error("Invalid session");
    const session = await db.session.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw new Error("Expired or revoked session");
    return {
      user: session.user,
      sessionId: session.id,
      expiresAt: session.expiresAt.getTime(),
    };
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }
};
app.use(
  helmet(),
  cors({ origin, credentials: true }),
  express.json({ limit: "32kb" }),
  cookieParser(),
);
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
if (process.env.NODE_ENV === "production") mountClient(app);
app.use((req, _res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== origin
  )
    return next(new HttpError(403, "Untrusted request origin."));
  next();
});
app.get("/api/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ok", database: "connected" });
});
const authSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(10).max(128),
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
const session = async (res: Response, user: User) => {
  await db.session.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });
  const stored = await db.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
    },
  });
  const token = jwt.sign({}, secret, {
    subject: user.id,
    jwtid: stored.id,
    expiresIn: "8h",
    algorithm: "HS256",
  });
  res.cookie("taskflow_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 3600 * 1000,
    path: "/",
  });
  res.json({ user: safeUser(user) });
};
app.post("/api/auth/register", async (req, res) => {
  const data = authSchema
    .extend({
      name: z.string().trim().min(2).max(80),
      role: z.enum(["PROJECT_HEAD", "ASSIGNEE"]),
    })
    .parse(req.body);
  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
  });
  const user = await db.user.create({
    data: { name: data.name, email: data.email, role: data.role, passwordHash },
  });
  res.status(201);
  await session(res, user);
  io.to("heads").emit("availability:changed");
});
app.post("/api/auth/login", async (req, res) => {
  const data = authSchema.parse(req.body);
  const user = await db.user.findUnique({ where: { email: data.email } });
  const valid = user
    ? await argon2.verify(user.passwordHash, data.password)
    : await argon2.verify(dummyHash, data.password);
  if (!user || !valid)
    throw new HttpError(401, "Email or password is incorrect.");
  await session(res, user);
});
const dummyHash = await argon2.hash("unused-password-for-timing", {
  type: argon2.argon2id,
});
app.use("/api", async (req: AuthRequest, _res, next) => {
  try {
    const auth = await authFromToken(req.cookies.taskflow_session);
    req.user = auth.user;
    req.sessionId = auth.sessionId;
    next();
  } catch (error) {
    next(error);
  }
});
app.get("/api/auth/me", (req: AuthRequest, res) =>
  res.json({ user: safeUser(req.user!) }),
);
app.post("/api/auth/logout", async (req: AuthRequest, res) => {
  await db.session.deleteMany({ where: { id: req.sessionId! } });
  io.in(`session:${req.sessionId}`).disconnectSockets(true);
  res
    .clearCookie("taskflow_session", { path: "/", sameSite: "strict" })
    .status(204)
    .end();
});
const head = (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (req.user!.role !== "PROJECT_HEAD")
    return next(
      new HttpError(403, "Only Project Heads can perform this action."),
    );
  next();
};
const projectScope = (u: User): Prisma.ProjectWhereInput =>
  u.role === "PROJECT_HEAD"
    ? { headId: u.id }
    : { tasks: { some: { assigneeId: u.id } } };
const taskScope = (u: User): Prisma.TaskWhereInput =>
  u.role === "PROJECT_HEAD"
    ? { project: { headId: u.id } }
    : { assigneeId: u.id };
const id = (value: unknown) => z.uuid().parse(value);
const taskInclude = {
  project: true,
  assignee: { select: { id: true, name: true, email: true } },
};
const projectInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(3000).default(""),
});
const taskInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).default(""),
});
app.get("/api/projects", async (req: AuthRequest, res) => {
  const u = req.user!;
  res.json(
    await db.project.findMany({
      where: projectScope(u),
      orderBy: { createdAt: "desc" },
      include: {
        tasks: {
          where: taskScope(u),
          select: { status: true, assigneeId: true },
        },
      },
    }),
  );
});
app.post("/api/projects", head, async (req: AuthRequest, res) => {
  const project = await db.project.create({
    data: { ...projectInput.parse(req.body), headId: req.user!.id },
  });
  res.status(201).json(project);
  io.to(`user:${req.user!.id}`).emit("project:changed");
});
app.get("/api/projects/:id", async (req: AuthRequest, res) => {
  const project = await db.project.findFirst({
    where: { id: id(req.params.id), ...projectScope(req.user!) },
  });
  if (!project) throw new HttpError(404, "Project not found.");
  res.json(project);
});
app.get("/api/assignees/available", head, async (req, res) => {
  const search = z
    .string()
    .max(100)
    .parse(req.query.search ?? "");
  res.json(
    await db.user.findMany({
      where: {
        role: "ASSIGNEE",
        tasks: { none: { status: { in: ["TODO", "IN_PROGRESS"] } } },
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  );
});
app.get("/api/tasks", async (req: AuthRequest, res) =>
  res.json(
    await db.task.findMany({
      where: {
        ...taskScope(req.user!),
        ...(req.query.projectId ? { projectId: id(req.query.projectId) } : {}),
      },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
    }),
  ),
);
const broadcast = (
  task: {
    id: string;
    assigneeId: string;
    project: { headId: string };
    status: string;
  },
  event: string,
) => {
  io.to(`user:${task.assigneeId}`)
    .to(`user:${task.project.headId}`)
    .emit(event, { id: task.id });
  if (task.status === "DONE")
    io.to(`user:${task.assigneeId}`)
      .to(`user:${task.project.headId}`)
      .emit("task:completed", { id: task.id });
  io.to("heads").emit("availability:changed");
};
app.post("/api/projects/:id/tasks", head, async (req: AuthRequest, res) => {
  const project = await db.project.findFirst({
    where: { id: id(req.params.id), headId: req.user!.id },
  });
  if (!project) throw new HttpError(404, "Project not found.");
  const data = taskInput.extend({ assigneeId: z.uuid() }).parse(req.body);
  const assignee = await db.user.findFirst({
    where: { id: data.assigneeId, role: "ASSIGNEE" },
  });
  if (!assignee) throw new HttpError(400, "Choose a valid Assignee.");
  const task = await db.task.create({
    data: { ...data, projectId: project.id },
    include: taskInclude,
  });
  broadcast(task, "task:created");
  res.status(201).json(task);
});
app.patch("/api/tasks/:id", head, async (req: AuthRequest, res) => {
  const task = await db.task.findFirst({
    where: { id: id(req.params.id), ...taskScope(req.user!) },
  });
  if (!task) throw new HttpError(404, "Task not found.");
  const updated = await db.task.update({
    where: { id: task.id },
    data: taskInput.parse(req.body),
    include: taskInclude,
  });
  broadcast(updated, "task:updated");
  res.json(updated);
});
app.patch("/api/tasks/:id/status", async (req: AuthRequest, res) => {
  const task = await db.task.findFirst({
    where: { id: id(req.params.id), ...taskScope(req.user!) },
  });
  if (!task) throw new HttpError(404, "Task not found.");
  const { status } = z
    .object({ status: z.enum(["TODO", "IN_PROGRESS", "DONE"]) })
    .parse(req.body);
  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      status,
      completedAt: status === "DONE" ? (task.completedAt ?? new Date()) : null,
    },
    include: taskInclude,
  });
  broadcast(updated, "task:updated");
  res.json(updated);
});
app.delete("/api/tasks/:id", head, async (req: AuthRequest, res) => {
  const task = await db.task.findFirst({
    where: { id: id(req.params.id), ...taskScope(req.user!) },
    include: taskInclude,
  });
  if (!task) throw new HttpError(404, "Task not found.");
  await db.task.delete({ where: { id: task.id } });
  broadcast(task, "task:deleted");
  res.status(204).end();
});
app.use((_req, _res, next) => next(new HttpError(404, "Endpoint not found.")));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({ error: error.issues[0].message });
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const email = String(error.meta?.target).includes("email");
    return res.status(409).json({
      error: email
        ? "This email is already registered."
        : "This Assignee already has an active task. Complete it before assigning or reopening another.",
    });
  }
  if (error instanceof HttpError)
    return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
io.use(async (socket, next) => {
  if (
    socket.handshake.headers.origin &&
    socket.handshake.headers.origin !== origin
  )
    return next(new Error("Unauthorized"));
  const cookie = socket.handshake.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("taskflow_session="))
    ?.slice("taskflow_session=".length);
  try {
    Object.assign(socket.data, await authFromToken(cookie));
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});
io.on("connection", (socket) => {
  const user: User = socket.data.user;
  void socket.join(`user:${user.id}`);
  void socket.join(`session:${socket.data.sessionId}`);
  if (user.role === "PROJECT_HEAD") void socket.join("heads");
  const timer = setTimeout(
    () => socket.disconnect(true),
    Math.max(0, socket.data.expiresAt - Date.now()),
  );
  socket.on("disconnect", () => clearTimeout(timer));
  socket.on(
    "subscribe:project",
    async (projectId: string, ack?: (result: { ok: boolean }) => void) => {
      const project = z.uuid().safeParse(projectId);
      const allowed =
        project.success &&
        (await db.project.findFirst({
          where: { id: project.data, ...projectScope(user) },
        }));
      // Project subscriptions acknowledge access; task payloads stay in private user rooms.
      if (typeof ack === "function") ack({ ok: Boolean(allowed) });
    },
  );
});
