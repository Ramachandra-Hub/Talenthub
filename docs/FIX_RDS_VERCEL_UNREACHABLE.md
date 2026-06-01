# Fix: Vercel `/api/health` — Can't reach database server

If health shows:

```json
"database": "unreachable",
"database_error": "Can't reach database server at `....rds.amazonaws.com:5432`"
```

the **URL format is correct** but **Vercel cannot open TCP port 5432** to your RDS instance. This is an **AWS networking** fix, not an app code bug.

## Checklist (AWS Console)

### 1. Public access

1. **RDS** → **Databases** → `prepindia-db` (or your instance).
2. **Modify**.
3. **Connectivity** → **Public access** → **Yes**.
4. **Apply immediately** → wait until status is **Available** (several minutes).

### 2. Security group inbound rule

1. Database → **Connectivity & security** → click the **VPC security group**.
2. **Inbound rules** → **Edit inbound rules** → **Add rule**:

| Type       | Port | Source      |
|------------|------|-------------|
| PostgreSQL | 5432 | `0.0.0.0/0` |

Save. (Trial only — restrict IPs later.)

### 3. Confirm endpoint

Copy **Endpoint** from RDS. It must match the host in Vercel `DATABASE_URL`:

`prepindia-db.cxms2kg60760.ap-south-1.rds.amazonaws.com`

### 4. Vercel environment variables

Set **both** (same password, same host):

```text
DATABASE_URL=postgresql://prepindia_admin:PASSWORD@prepindia-db.cxms2kg60760.ap-south-1.rds.amazonaws.com:5432/postgres?sslmode=require&connection_limit=1
DIRECT_URL=postgresql://prepindia_admin:PASSWORD@prepindia-db.cxms2kg60760.ap-south-1.rds.amazonaws.com:5432/postgres?sslmode=require
```

Redeploy after saving.

### 5. Verify from your PC

```bash
pnpm verify:rds
```

When TCP + Prisma pass locally, Vercel can connect too (same public endpoint).

### 6. Create tables

After health shows `"database": "ok"`:

- `POST https://your-app.vercel.app/api/setup/rds`  
- or run `pnpm init:rds` locally

## If RDS must stay private

Vercel serverless **cannot** connect to a private-only RDS. Options:

- Enable **public access** for the trial, or  
- Run the app on **EC2** in the same VPC as RDS (see `docs/aws-migration/DEPLOYMENT-GUIDE.md`).
