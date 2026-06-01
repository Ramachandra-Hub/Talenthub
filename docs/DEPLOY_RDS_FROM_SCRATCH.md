# Deploy PrepIndia from scratch — Vercel + AWS RDS

Complete step-by-step plan. **No AWS RDS.** **No manual SQL.**  
Tables and columns are created automatically from the app.

---

## What you are building

```
┌─────────────┐         HTTPS          ┌──────────────────────────────┐
│   Students  │ ─────────────────────► │  Vercel                      │
│   Admins    │                        │  Next.js (UI + /api/* routes)  │
└─────────────┘                        └──────────────┬───────────────┘
                                                      │
                                                      │ DATABASE_URL
                                                      │ (PostgreSQL)
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │  AWS RDS PostgreSQL          │
                                       │  Database: prepindia         │
                                       │  Tables: auto-created        │
                                       └──────────────────────────────┘
```

| Component | Role |
|-----------|------|
| **Vercel** | Hosts the website and all API routes |
| **AWS RDS** | Stores users, tests, questions, attempts, schedules |
| **Prisma** | Creates/updates tables from `prisma/schema.prisma` |
| **NextAuth** | Login (no AWS RDS Auth) |

**You do not deploy a separate backend server.** Vercel + RDS is enough for the student trial.

**Repo config (already in the project):** root [`vercel.json`](../vercel.json), [`.vercelignore`](../.vercelignore), and [`deploy/vercel/`](../deploy/vercel/) (env checklist, production template, post-deploy smoke test).

---

## Before you start (checklist)

- [ ] AWS account
- [ ] Vercel account (project already connected to this GitHub repo)
- [ ] Node.js 20+ on your PC (optional, for local testing)
- [ ] 30–60 minutes for first-time setup

---

## Phase 1 — Create AWS RDS (≈15 min)

### Step 1.1 — Open RDS in AWS Console

1. Sign in to [AWS Console](https://console.aws.amazon.com/).
2. Region: choose one close to users (e.g. **Asia Pacific (Mumbai) `ap-south-1`**).
3. Go to **RDS** → **Databases** → **Create database**.

### Step 1.2 — Engine and template

| Setting | Value |
|---------|--------|
| Engine | **PostgreSQL** |
| Version | **15** or **16** |
| Template | **Free tier** (trial) or Dev/Test |

### Step 1.3 — Settings

| Setting | Value |
|---------|--------|
| DB instance identifier | `prepindia-trial` |
| Master username | `prepindia_admin` |
| Master password | Strong password — **save it** |

### Step 1.4 — Instance and storage

| Setting | Value |
|---------|--------|
| Instance class | `db.t3.micro` or `db.t4g.micro` (trial) |
| Storage | 20 GB gp3 (default is fine) |

### Step 1.5 — Connectivity (important for Vercel)

| Setting | Value |
|---------|--------|
| Compute resource | **Don’t connect to an EC2 compute resource** |
| **Public access** | **Yes** |
| VPC security group | Create new → name `prepindia-rds-sg` |

### Step 1.6 — Database name

| Setting | Value |
|---------|--------|
| Initial database name | `prepindia` |

### Step 1.7 — Create

Click **Create database**. Wait until status is **Available** (~5–10 minutes).

### Step 1.8 — Open security group (port 5432)

1. RDS → your database → **Connectivity & security** → click the **VPC security group**.
2. **Inbound rules** → **Edit inbound rules** → **Add rule**:

| Type | Port | Source | Notes |
|------|------|--------|--------|
| PostgreSQL | 5432 | `0.0.0.0/0` | Trial only; restrict later |

Save rules.

### Step 1.9 — Copy connection details

From the RDS database page, note:

- **Endpoint**: e.g. `prepindia-trial.xxxxx.ap-south-1.rds.amazonaws.com`
- **Port**: `5432`
- **Username**: `prepindia_admin`
- **Password**: (what you set)
- **Database**: `prepindia`

Build your connection URL:

```text
postgresql://prepindia_admin:YOUR_PASSWORD@prepindia-trial.xxxxx.ap-south-1.rds.amazonaws.com:5432/prepindia?sslmode=require
```

**Phase 1 done** when you have this URL saved.

---

## Phase 2 — Configure Vercel (≈10 min)

### Step 2.1 — Open project settings

1. [vercel.com](https://vercel.com) → your **Practice-Tests** project.
2. **Settings** → **Environment Variables**.

### Step 2.2 — Add variables (Production)

Add each row. Use **Production** (and **Preview** if you want staging).

| Name | Value | Notes |
|------|--------|--------|
| `USE_AWS_STACK` | `true` | Required |
| `USE_PRISMA_AUTH` | `true` | Required |
| `NEXT_PUBLIC_USE_AWS_STACK` | `true` | Required |
| `AUTO_RDS_SCHEMA` | `true` | Auto-creates tables |
| `DATABASE_URL` | Your RDS URL + `&connection_limit=1` | See example below |
| `DIRECT_URL` | Same RDS URL (no connection_limit) | For Prisma |
| `AUTH_SECRET` | Random 32+ bytes | See Step 2.3 |
| `AUTH_URL` | `https://YOUR-APP.vercel.app` | Your real Vercel URL |
| `AUTH_TRUST_HOST` | `true` | Required |
| `NEXT_PUBLIC_APP_URL` | Same as `AUTH_URL` | Required |
| `PREPINDIA_ADMIN_EMAIL` | `admin@rce.ac.in` | Admin login |
| `PREPINDIA_ADMIN_PASSWORD` | Your secure password | Admin login |
| `NEXT_PUBLIC_SIGNUP_DISABLED` | `true` | Recommended for trial |

**Example `DATABASE_URL`:**

```env
postgresql://prepindia_admin:MyStr0ngP@ss@prepindia-trial.xxxxx.ap-south-1.rds.amazonaws.com:5432/prepindia?sslmode=require&connection_limit=1
```

If the password has special characters (`@`, `#`, `%`), URL-encode them or use a password without those characters.

### Step 2.3 — Generate AUTH_SECRET

On your PC (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Or Git Bash / Mac:

```bash
openssl rand -base64 32
```

Paste the result into `AUTH_SECRET`.

### Step 2.4 — Remove AWS RDS variables (if present)

Delete from Vercel (if they exist):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_URL` (old AWS RDS postgres)

### Step 2.5 — Build settings (from `vercel.json`)

The repo root **`vercel.json`** is picked up automatically when you deploy from Git. You usually **do not** need to change Vercel → **Build & Development Settings** manually.

| Setting | Value (in `vercel.json`) |
|---------|---------------------------|
| Framework | Next.js |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm run vercel-build` → Prisma generate + `db push` + `next build` |
| Region | `bom1` (Mumbai) |

Locally, verify env before pushing:

```bash
pnpm run verify:vercel-aws-env
```

This creates all tables during deploy (when `DATABASE_URL` is set in Vercel), not only on first user visit.

If the dashboard overrides build settings, set **Build Command** to `pnpm run vercel-build` to match the repo.

### Step 2.6 — Deploy

1. **Deployments** → **Redeploy** latest (or push to GitHub `main`).
2. Wait until build status is **Ready**.
3. Copy your production URL, e.g. `https://practice-tests-xxx.vercel.app`.

4. Update `AUTH_URL` and `NEXT_PUBLIC_APP_URL` if you used a placeholder — then **redeploy once**.

**Phase 2 done** when deployment succeeds.

---

## Phase 3 — Initialize database (≈5 min)

Tables are created automatically. You still need **admin user** and **sample tests** once.

### Step 3.1 — Health check (creates schema if needed)

Open in browser or run:

```text
https://YOUR-APP.vercel.app/api/health
```

Expected JSON:

```json
{
  "status": "healthy",
  "checks": {
    "app": "ok",
    "auth_mode": "prisma_jwt",
    "schema_auto_sync": "ok",
    "database": "ok"
  }
}
```

If `database` is an error → see [Troubleshooting](#phase-7--troubleshooting).

### Step 3.2 — Run setup (admin + sample data)

1. Open: `https://YOUR-APP.vercel.app/setup`
2. Click **Start Setup**.
3. Wait for “RDS ready” / completed message.

This creates:

- Admin account (`PREPINDIA_ADMIN_EMAIL` / `PREPINDIA_ADMIN_PASSWORD`)
- Sample test categories and practice tests

### Step 3.3 — Confirm setup status

Open:

```text
https://YOUR-APP.vercel.app/api/setup/rds
```

Expected:

```json
{
  "mode": "aws",
  "schemaReady": true,
  "categoryCount": 8,
  "userCount": 1
}
```

**Phase 3 done** when health + setup succeed.

---

## Phase 4 — Test the application (≈10 min)

### Step 4.1 — Admin login

1. Open: `https://YOUR-APP.vercel.app/auth/login/admin`
2. Email: value of `PREPINDIA_ADMIN_EMAIL`
3. Password: value of `PREPINDIA_ADMIN_PASSWORD`
4. You should reach **Admin dashboard**.

### Step 4.2 — Student flow (after you add a student)

For trial you must have students in RDS. Options:

**A — Use setup seed only**  
Practice tests work; live exam roster needs admin to configure schedules.

**B — Create one test student locally (optional)**

On your PC with `.env.local` pointing to the same RDS:

```env
DATABASE_URL=...same as Vercel...
DIRECT_URL=...
USE_AWS_STACK=true
```

Then use admin UI to add users, or ask your team to import roster via admin exam tools.

### Step 4.3 — Student login test

1. `https://YOUR-APP.vercel.app/auth/login/student`
2. Roll number + password (from roster or admin-created account)
3. Open: `https://YOUR-APP.vercel.app/exams`
4. Start a practice test → submit.

### Step 4.4 — Quick test checklist

| Test | URL | Pass? |
|------|-----|-------|
| Health | `/api/health` | ☐ |
| Admin login | `/auth/login/admin` | ☐ |
| Admin dashboard | `/admin/dashboard` | ☐ |
| Student exams | `/exams` | ☐ |
| Take test | `/tests/take/...` | ☐ |

**Phase 4 done** when admin and one exam flow work.

---

## Phase 5 — Student trial day

### Before students arrive

- [ ] `NEXT_PUBLIC_SIGNUP_DISABLED=true` on Vercel
- [ ] Admin password changed from default
- [ ] Exam schedules published in admin (if using live exams)
- [ ] Roster / roll numbers + passwords loaded
- [ ] Share URL: `https://YOUR-APP.vercel.app/auth/login/student`
- [ ] Test login from a phone on mobile data (not only college Wi‑Fi)

### During trial

- Monitor: `https://YOUR-APP.vercel.app/api/health`
- Vercel → **Logs** for errors
- AWS RDS → **Monitoring** → CPU connections

### Optional: protect setup page after go-live

```env
RDS_SETUP_SECRET=long-random-string
```

Then only requests with header `x-rds-setup-secret` can run setup again.

---

## Phase 6 — Optional local development (same RDS)

Create `.env.local` in project root (copy from `.env.vercel-rds.example`):

```env
USE_AWS_STACK=true
USE_PRISMA_AUTH=true
NEXT_PUBLIC_USE_AWS_STACK=true
AUTO_RDS_SCHEMA=true
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
AUTH_SECRET=local-dev-secret-min-32-chars-long
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
PREPINDIA_ADMIN_EMAIL=admin@rce.ac.in
PREPINDIA_ADMIN_PASSWORD=YourPassword
```

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/setup` once, then `http://localhost:3000`.

---

## Phase 7 — Troubleshooting

### `database` error on `/api/health`

**"Can't reach database server"** → see [FIX_RDS_VERCEL_UNREACHABLE.md](./FIX_RDS_VERCEL_UNREACHABLE.md) and run `pnpm verify:rds`.

| Cause | Fix |
|-------|-----|
| RDS not public | RDS → Modify → Public access **Yes** |
| Security group | Allow inbound **5432** from `0.0.0.0/0` (trial) |
| Wrong password in URL | Reset RDS password; update Vercel env |
| `DIRECT_URL` ≠ `DATABASE_URL` | Use identical connection strings in Vercel |
| Missing `sslmode=require` | Add `?sslmode=require` to URL |
| Special chars in password | URL-encode or change password |

### `schema_auto_sync: failed`

| Cause | Fix |
|-------|-----|
| Build didn’t run `db push` | Set Build Command from Phase 2.5 |
| Prisma not found at runtime | Redeploy after `prisma` is in `package.json` dependencies |
| RDS unreachable | Fix connectivity first |

### Admin login fails

1. Open `/setup` → **Start Setup** again (if DB empty).
2. Confirm `PREPINDIA_ADMIN_EMAIL` / `PASSWORD` match what you type.
3. Check Vercel env was saved for **Production** and you redeployed.

### Student sees empty `/exams`

1. Run `/setup` for sample data, **or**
2. Create exam schedules in admin, **or**
3. Share direct test link: `/tests/take/<test-id>`

### 500 errors on Vercel

**Vercel** → **Logs** → filter errors.  
Most common: bad `DATABASE_URL` or RDS not reachable.

---

## Command reference (your PC)

| Command | When |
|---------|------|
| `pnpm install` | First time |
| `pnpm init:rds` | Fresh RDS from PC (schema + admin + seed) |
| `pnpm dev` | Local testing |
| `npx prisma db push` | After changing `schema.prisma` |

---

## Environment file templates

- Vercel: [`.env.vercel-rds.example`](../.env.vercel-rds.example)
- Local: [`.env.local.example`](../.env.local.example)

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [RDS_FRESH_START.md](./RDS_FRESH_START.md) | Auto-schema details |
| [VERCEL_RDS_TRIAL.md](./VERCEL_RDS_TRIAL.md) | Trial-focused notes |
| [aws-migration/DEPLOYMENT-GUIDE.md](./aws-migration/DEPLOYMENT-GUIDE.md) | Full EC2 + ALB production (later) |

---

## Master checklist (print this)

```
□ Phase 1  RDS created, public, port 5432 open, connection URL saved
□ Phase 2  Vercel env vars set, AWS RDS vars removed, build command set, deployed
□ Phase 3  /api/health healthy, /setup completed
□ Phase 4  Admin login works, exam flow tested
□ Phase 5  Students briefed, roster ready, trial URL shared
```

**Estimated total time:** 45–60 minutes first time; redeploys later take ~5 minutes.

---

## Summary in one sentence

Create empty RDS → point Vercel at it with `USE_AWS_STACK=true` → deploy → open `/setup` once → run student trial on your Vercel URL.
