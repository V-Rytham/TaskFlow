# TaskFlow

TaskFlow brings projects, people, and task progress into a responsive workspace. Project Heads manage their own projects; Assignees see their assigned work. One active task per Assignee is enforced globally by a PostgreSQL partial unique index. Socket.IO keeps authenticated sessions synchronized.

## Technology stack
React, Vite, TypeScript, Tailwind CSS, React Router, dnd-kit, TanStack Query, Express, PostgreSQL, Prisma, Argon2id, JWT cookies, Socket.IO, Zod, Vitest, and Playwright.

## Prerequisites
Node.js 22.19+ and npm. Docker with Compose, or PostgreSQL 16+. This Windows workspace includes a project-local PostgreSQL runtime under the ignored `.local` folder because Docker Desktop could not start.

## Setup instructions
From this folder:
```sh
npm install
```
Copy `.env.example` to `server/.env` if it does not already exist. Set `JWT_SECRET` to a random value of at least 32 characters. Then:
```sh
npm run db:start
npm run db:migrate
npm run db:seed
```
Migrations include the partial unique index, completion timestamp constraint, and an Assignee-role trigger. The seed is repeatable and preserves existing projects.

## Environment variables
`server/.env` is read by the backend, Prisma, and tests. `DATABASE_URL` selects the database; `JWT_SECRET` signs eight-hour sessions; `CLIENT_ORIGIN` defaults to `http://127.0.0.1:5173`; `PORT` defaults to `4000`. Sessions are recorded in PostgreSQL so logout revokes only the current JWT. `NODE_ENV=production` enables Secure cookies and requires HTTPS. Never commit `.env`. Local database credentials are development-only. The frontend uses the Vite proxy and same-origin API requests.

## Running instructions
```sh
npm run dev
```
Open **http://127.0.0.1:5173**. The backend is at **http://127.0.0.1:4000/api/health**. Keep this terminal running. On subsequent starts, run `npm run db:start` first. `docker compose up -d --wait` is the Docker alternative; it binds the database to localhost port 5434. `npm run build` produces `client/dist` and `server/dist`. In production, `npm start` applies migrations and serves the built frontend, API, and Socket.IO together. See [DEPLOYMENT.md](DEPLOYMENT.md) for the free Render + Neon setup and HTTPS hosting instructions.

## Demo credentials
All demo accounts use **TaskflowDemo!2026**, for local development only.

| Role | Email |
|---|---|
| Project Head | alex@taskflow.local |
| Project Head | jordan@taskflow.local |
| Assignee | sam@taskflow.local |
| Assignee | taylor@taskflow.local |
| Assignee, initially available | casey@taskflow.local |

## Testing instructions
```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```
Integration tests require the migrated database in `server/.env`. They create uniquely named users and remove their own records afterward. Browser tests require running services and Microsoft Edge; they use two isolated browser contexts and save screenshots to `screenshots/`. They verify live assignment, confirmed drag and drop, cancellation, completion, availability, edits, deletion, refresh, mobile layout, registration, and logout. The browser demo creates a project and a QA account. `npm run format` applies Prettier formatting.
