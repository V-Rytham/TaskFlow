# Deploy TaskFlow for $0: Render Free + Neon Free

Verified against provider documentation on 15 October 2026. This setup is suitable for a demo or small personal app, with free-tier quotas and cold starts. It is not an always-on hosting guarantee.

## 1. Create a free PostgreSQL database

1. Open https://neon.com and sign up. Stay on the **Free** plan; no credit card is required.
2. Create one project named `taskflow`. Use PostgreSQL 16 if offered. Keep the standard database and role names Neon provides.
3. Choose a region near your intended Render region. Keep scale-to-zero enabled and use the smallest compute size available.
4. Click **Connect**. Select the project's default branch, database, and database owner role.
5. Turn **Connection pooling off**. This procedure uses the direct connection for both Prisma migrations and the small single-server app.
6. Copy the `postgresql://...` connection string without any surrounding quotes or `psql` command. Preserve its SSL options. Append `&connection_limit=3&connect_timeout=30&pool_timeout=30` to its existing query string.

Example shape, with placeholders:
```text
postgresql://ROLE:PASSWORD@HOST.neon.tech/DATABASE?sslmode=require&connection_limit=3&connect_timeout=30&pool_timeout=30
```

Keep the actual URL private. Paste it only into Render's secret environment variables. Do not commit it or replace your local `server/.env` with it.

## 2. Publish only TaskFlow to a new GitHub repository

1. Open https://github.com/new.
2. Create an empty repository named `taskflow`, preferably private. Do not initialize a README, license, or `.gitignore`.
3. In PowerShell, run the following, replacing `YOUR_USERNAME` in the final line. TaskFlow currently lives inside another Git repository, so `subtree` exports only this application's files without creating a nested repository.

```powershell
Set-Location 'D:\1.cortexAI\1.cortexAI'
git add -- taskflow
git diff --cached --stat -- taskflow
git ls-files --cached -- taskflow/server/.env taskflow/.env
```

The final command must print nothing. The staged summary must exclude `.local`, `node_modules`, and `.env`. Then:

```powershell
git commit --only -m "Prepare TaskFlow for deployment" -- taskflow
git subtree split --prefix=taskflow -b codex/taskflow-deploy
git push https://github.com/YOUR_USERNAME/taskflow.git codex/taskflow-deploy:main
```

Complete GitHub authentication if prompted. The new repository should show `client`, `server`, `package.json`, and `render.yaml` at its root.

## 3. Create a free Render web service

1. Open https://dashboard.render.com and sign in.
2. Use a free personal/Hobby workspace. Do not choose a paid workspace or paid compute tier.
3. Select **New → Web Service**, connect GitHub, and authorize the new `taskflow` repository.
4. Select the repository and use these settings:

| Setting | Value |
|---|---|
| Name | Any available name, such as `taskflow-yourname` |
| Branch | `main` |
| Region | The closest available region to your Neon database |
| Root Directory | Leave blank |
| Language / Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build:deploy` |
| Start Command | `npm start` |
| Instance Type | **Free — $0/month** |
| Health Check Path, under Advanced | `/healthz` |

The root directory is blank because the subtree export places the application at the new repository's root. Do not enter `taskflow` there.

5. Add these environment variables before deploying:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | Your private Neon direct connection string from step 1 |
| `JWT_SECRET` | A fresh random secret generated below |

Generate the JWT secret locally with Node:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copy that output into `JWT_SECRET`. Do not put it in source control or share it. Keep the value unchanged on subsequent deployments so existing sessions remain valid.

Leave `CLIENT_ORIGIN`, `HOST`, and `PORT` unset. The app automatically uses Render's public HTTPS URL and assigned port, and binds to `0.0.0.0` in production. Frontend, REST API, and Socket.IO use the same public origin.

Use `/healthz` for automatic health probes. `/api/health` queries PostgreSQL; probing that endpoint repeatedly would prevent Neon from sleeping and consume its free compute allowance.

6. Verify that **Free** is selected and click **Deploy Web Service**. Do not add a payment method, persistent disk, paid database, or paid domain. If an account check requires payment details, stop rather than approving a charge.
7. Watch the logs. The build generates Prisma Client and builds the frontend and backend. The start command applies database migrations and launches Express. No paid pre-deploy job or dashboard shell is needed.
8. Wait for **Live**, then open the exact `https://...onrender.com` URL shown in Render.

The included `render.yaml` describes the same service for Blueprint users. The dashboard steps above are sufficient; do not create a second service from the Blueprint as well.

## 4. Verify your deployed application

1. Open `https://YOUR-ACTUAL-RENDER-HOST.onrender.com/api/health`. Expect:
```json
{"status":"ok","database":"connected"}
```
2. Open the app and create your own **Project Head** account with a unique password.
3. Open a private/incognito browser window and register a separate **Assignee** account.
4. Create a project, assign a task, and confirm that it appears in the Assignee window without refreshing.
5. Move the task to In Progress, confirm, and verify the Head's board updates. Complete it and verify the Assignee appears in Available people.
6. Refresh a project URL directly to verify that navigation and session restoration work.

This creates a fresh online database; your local users and projects remain local. Do not run the demo seed against the public database: its passwords are published in the local README. Production builds hide the local demo credentials panel.

## 5. Stay free and publish future changes

- Render Free provides 750 instance-hours per workspace per month, shared by its free services. Keep this deployment to one web service. It may sleep after 15 minutes without HTTP traffic or WebSocket messages; waking can take about a minute.
- Neon Free currently includes 1 GB storage and 100 CU-hours per project each month. Leave scale-to-zero enabled and monitor Usage in both dashboards.
- Keep both accounts on their free plans and do not add a payment method or upgrade. Render documents service/build suspension instead of overage charges when no payment method is present.
- Use the supplied `onrender.com` address. Do not set up paid domains, uptime pingers, or extra hosted services for this procedure.
- Render's free PostgreSQL database expires after 30 days, which is why this setup uses Neon instead.

After editing local files, publish only the application again:

```powershell
Set-Location 'D:\1.cortexAI\1.cortexAI'
git add -- taskflow
git commit --only -m "Update TaskFlow" -- taskflow
git subtree push --prefix=taskflow https://github.com/YOUR_USERNAME/taskflow.git main
```

Render redeploys from `main` automatically when auto-deploy is enabled. Do not run local automated integration or browser tests against the public database.

## Troubleshooting

- **Database connection or migration failure:** recopy the direct Neon URL, preserve `sslmode=require`, and check that no quotes or `psql` prefix were pasted. Ensure the Neon compute allowance has not been exhausted.
- **Missing frontend build / port detection error:** confirm the root directory is blank and the build/start commands match the table exactly.
- **Login rejected with Untrusted request origin:** remove an old localhost `CLIENT_ORIGIN` value. The Render URL is detected automatically. If you deliberately add a custom domain later, set `CLIENT_ORIGIN` to its exact HTTPS origin without a trailing path.
- **First load is slow:** allow the free Render service to wake up. A cold start is expected on this plan.

Sources: https://render.com/docs/free, https://render.com/docs/deploy-node-express-app, https://render.com/docs/environment-variables, https://render.com/docs/health-checks, https://neon.com/pricing, https://neon.com/docs/connect/connect-from-any-app.
