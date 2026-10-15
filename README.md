# TaskFlow

A task management app with separate dashboards for Project Heads and Assignees. Project Heads create projects and assign tasks; Assignees manage their work on a Kanban board. Updates sync in real time, and each Assignee can have only one active task across all projects.

[Eraser workspace](https://app.eraser.io/workspace/gknUKkNzJfMigKx05xz5) · [Deployment guide](DEPLOYMENT.md)

## Screenshots

**Project Head dashboard**

![Project Head dashboard with project summaries](screenshots/head-dashboard.png)

**Project Kanban board**

![Project tasks grouped into To do, In progress, and Done](screenshots/project-board.png)

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, dnd-kit
- **Backend:** Express, TypeScript, PostgreSQL, Prisma, Socket.IO
- **Authentication:** JWT sessions in HttpOnly cookies, Argon2id password hashing
- **Tests:** Vitest, React Testing Library, Playwright

## Run locally

Requires Node.js **22.19+ within the 22.x release**, npm, and Docker Compose or PostgreSQL 16+.

From the `taskflow` directory, install dependencies:

```sh
npm install
```

If `server/.env` does not exist, copy `.env.example` to `server/.env`. Set `JWT_SECRET` to a random value of at least 32 characters. The example includes local database and port settings.

Start Docker Desktop, then run:

```sh
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev
```

For an existing PostgreSQL instance, set `DATABASE_URL` in `server/.env` and skip `db:start`.

Open **http://127.0.0.1:5173**. The API health check is at **http://127.0.0.1:4000/api/health**.

## Demo accounts

Password for all seeded accounts: **`TaskflowDemo!2026`**. These accounts are for local use only.

| Role | Email |
|---|---|
| Project Head | alex@taskflow.local |
| Project Head | jordan@taskflow.local |
| Assignee | sam@taskflow.local |
| Assignee | taylor@taskflow.local |
| Assignee | casey@taskflow.local |

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm run test
npm run test:e2e
```

Tests cover authentication, ownership, task visibility, concurrent assignments, status changes, and real-time updates. Integration tests need the local database. Browser tests also need the development servers running and Microsoft Edge installed.
