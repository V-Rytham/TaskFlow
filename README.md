# TaskFlow

> Full-stack real-time project management engine with role-based access control, strict workload concurrency controls, and live WebSocket synchronization.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma_ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

[Live App](https://taskflow-ir9c.onrender.com/) · [Architecture Specs (Eraser)](https://app.eraser.io/workspace/gknUKkNzJfMigKx05xz5)

---

## Overview

Most task management tools treat board updates as simple CRUD operations without workload constraints. Team members frequently end up assigned to multiple active tasks simultaneously, causing context-switching bottlenecks and stale boards.

I built **TaskFlow** to enforce strict workflow constraints:
- **Database-Level Invariant**: An assignee can have only **one active task** in progress across all projects. Enforced via a **PostgreSQL partial unique index**, preventing race conditions at the database level.
- **Dual Dashboards**: Project Heads get visibility over team workload, project health, and member availability, while Assignees have a clean Kanban board synced in real time over WebSockets.

---

## Screenshots

| Project Head Dashboard | Kanban Project Board |
| :---: | :---: |
| ![Project Head Dashboard](screenshots/head-dashboard.png) | ![Kanban Project Board](screenshots/project-board.png) |

| Assignee Focused Board | Task Detail & Activity Modal |
| :---: | :---: |
| ![Assignee Board](screenshots/assignee-board.png) | ![Task Details](screenshots/task-details.png) |

| Team Availability Tracker | Mobile Responsive View |
| :---: | :---: |
| ![Available Team](screenshots/available-people.png) | ![Mobile View](screenshots/mobile.png) |

---

## Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend (React + Vite + TanStack Query)"]
        Head["Project Head View"]
        Assignee["Assignee Kanban (dnd-kit)"]
    end

    subgraph Server ["Backend (Node.js + Express + TypeScript)"]
        API["REST API Layer + Zod Validation"]
        Auth["Argon2id + HttpOnly Cookie Auth"]
        WS["Socket.IO Event Gateway"]
    end

    subgraph Data ["Database (PostgreSQL + Prisma)"]
        DB[("PostgreSQL")]
        Constraint["Partial Unique Index: (assignee_id) WHERE status = 'IN_PROGRESS'"]
    end

    Head -->|REST / Mutations| API
    Assignee -->|Drag & Drop Drop-Event| API
    API --> Auth
    API --> DB
    Constraint -.->|Guarantees 1 active task| DB
    API -->|Emit task:updated| WS
    WS -.->|Real-time broadcast| Head
    WS -.->|Real-time broadcast| Assignee
```

---

## Key Highlights

- **PostgreSQL Partial Unique Index**: `CREATE UNIQUE INDEX ON tasks (assignee_id) WHERE status = 'IN_PROGRESS';` guarantees data integrity regardless of concurrent API requests.
- **Optimistic Drag-and-Drop**: Built with `@dnd-kit` and TanStack Query for instantaneous visual feedback with clean rollback if an operation fails.
- **Room-Based WebSockets**: Socket.IO isolates real-time updates to project subscriber rooms.
- **Authentication**: JWTs stored in HttpOnly, SameSite cookies with Argon2id password hashing and Zod schema validation.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, `@dnd-kit`, Lucide Icons
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, Socket.IO, Zod
- **Database**: PostgreSQL 16
- **Testing**: Playwright, Vitest, React Testing Library

---

## Setup & Local Run

### Prerequisites
- Node.js `22.x` and npm
- Docker Desktop (or local PostgreSQL)

### 1. Clone & Install
```bash
git clone https://github.com/V-Rytham/TaskFlow.git
cd TaskFlow
npm install
```

### 2. Configure Environment
Create `server/.env`:
```ini
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://127.0.0.1:5173
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/taskflow?schema=public"
JWT_SECRET="your-32-character-secret"
```

### 3. Database Migration & Seed
```bash
npm run db:start      # Starts PostgreSQL container on port 5434
npm run db:generate   # Generates Prisma client
npm run db:migrate    # Runs migrations
npm run db:seed       # Seeds demo projects and users
```

### 4. Start Development Servers
```bash
npm run dev
```
- Frontend: `http://127.0.0.1:5173`
- API Health: `http://127.0.0.1:4000/api/health`

---

## Demo Accounts

Password for all seeded accounts is: **`TaskflowDemo!2026`**

| Role | Email |
| :--- | :--- |
| **Project Head** | `alex@taskflow.local` |
| **Project Head** | `jordan@taskflow.local` |
| **Assignee** | `sam@taskflow.local` |
| **Assignee** | `taylor@taskflow.local` |
