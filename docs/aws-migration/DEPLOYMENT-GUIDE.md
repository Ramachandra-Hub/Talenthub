# Complete AWS Deployment Guide — PrepIndia Exam Platform

Step-by-step guide from **zero** to **500 concurrent students** on AWS.

**App path:** `apps/prepindia-web`  
**Stack:** EC2 + ALB + RDS PostgreSQL + S3 + CloudFront + NextAuth JWT + Prisma + PM2 + NGINX

---

## Overview

| Layer | AWS Service | Purpose |
|-------|-------------|---------|
| DNS / HTTPS | Route 53 + ACM | `exam.yourcollege.edu.in` |
| CDN (optional) | CloudFront | Static assets `/_next/static` |
| Load balancer | Application Load Balancer | Distribute traffic, health checks |
| App servers | EC2 (2–6 instances) | Next.js + PM2 cluster + NGINX |
| Database | RDS PostgreSQL 15+ | All exam data |
| Connection pool | RDS Proxy | Handle 500 concurrent DB connections |
| File storage | S3 | Proctor screenshots |
| Auth | NextAuth (JWT) | Stateless sessions across EC2 |

---

## Phase 1 — AWS account & networking (Day 1)

### Step 1.1 — Create VPC

1. AWS Console → **VPC** → **Create VPC**
2. Choose **VPC and more**
3. Name: `prepindia-vpc`
4. IPv4 CIDR: `10.0.0.0/16`
5. **2 Availability Zones**
6. **1 public subnet** per AZ (for ALB)
7. **1 private subnet** per AZ (for EC2 + RDS)
8. **NAT Gateway:** 1 per AZ (or 1 total to save cost in dev)
9. Create

Note the subnet IDs:
- Public: `subnet-public-a`, `subnet-public-b`
- Private: `subnet-private-a`, `subnet-private-b`

### Step 1.2 — Security groups

Create three security groups in `prepindia-vpc`:

**ALB SG (`prepindia-alb-sg`)**
| Inbound | Port | Source |
|---------|------|--------|
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |

**EC2 SG (`prepindia-ec2-sg`)**
| Inbound | Port | Source |
|---------|------|--------|
| HTTP | 80 | `prepindia-alb-sg` |
| SSH | 22 | Your IP only |

**RDS SG (`prepindia-rds-sg`)**
| Inbound | Port | Source |
|---------|------|--------|
| PostgreSQL | 5432 | `prepindia-ec2-sg` |

---

## Phase 2 — RDS PostgreSQL (Day 1)

### Step 2.1 — Create RDS instance

1. **RDS** → **Create database**
2. Engine: **PostgreSQL 15** (or 16)
3. Template: **Production** (or Dev/Test for staging)
4. DB identifier: `prepindia-db`
5. Master username: `prepindia_admin`
6. Master password: *(strong password — save in Secrets Manager)*
7. Instance: `db.t4g.medium` (minimum for ~500 users; use `db.r6g.large` for production exams)
8. Storage: 50 GB gp3, autoscaling enabled
9. VPC: `prepindia-vpc`
10. Subnet group: **private subnets only**
11. Public access: **No**
12. Security group: `prepindia-rds-sg`
13. Database name: `prepindia`
14. **Multi-AZ:** Yes (production)
15. Create (takes ~10 minutes)

### Step 2.2 — RDS Proxy (recommended)

1. **RDS** → **Proxies** → **Create proxy**
2. Name: `prepindia-proxy`
3. Engine: PostgreSQL
4. Target: `prepindia-db`
5. IAM auth: optional; use Secrets Manager secret with DB credentials
6. VPC: same private subnets
7. Security group: allow EC2 SG on port 5432

**Connection strings:**
```env
# Pooled (app runtime — use this in DATABASE_URL)
DATABASE_URL=postgresql://prepindia_app:PASSWORD@prepindia-proxy.xxxxx.ap-south-1.rds.amazonaws.com:5432/prepindia?schema=public&connection_limit=10

# Direct (migrations only — DIRECT_URL)
DIRECT_URL=postgresql://prepindia_admin:PASSWORD@prepindia-db.xxxxx.ap-south-1.rds.amazonaws.com:5432/prepindia?schema=public
```

### Step 2.3 — Create app DB user

Connect via bastion or RDS Query Editor:

```sql
CREATE USER prepindia_app WITH PASSWORD 'your-app-password';
GRANT CONNECT ON DATABASE prepindia TO prepindia_app;
GRANT USAGE ON SCHEMA public TO prepindia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prepindia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prepindia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prepindia_app;
```

---

## Phase 3 — S3 bucket (Day 1)

### Step 3.1 — Create bucket

1. **S3** → **Create bucket**
2. Name: `prepindia-exam-proctoring` (globally unique)
3. Region: `ap-south-1` (same as EC2/RDS)
4. Block all public access: **On**
5. Versioning: optional
6. Encryption: **SSE-S3**

### Step 3.2 — IAM policy for EC2

Create IAM role `prepindia-ec2-role` with policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::prepindia-exam-proctoring/*"
    }
  ]
}
```

Attach role to EC2 instances (no access keys in `.env` if using instance role).

---

## Phase 4 — Build & migrate database (Day 2)

On your **local machine** (or CI):

```bash
cd apps/prepindia-web

# Copy environment template
cp .env.aws.example .env.production
# Edit: DATABASE_URL, DIRECT_URL, AUTH_SECRET, AWS_*, PREPINDIA_ADMIN_*

pnpm install
pnpm db:push          # creates all tables from prisma/schema.prisma
# OR for production migrations:
# pnpm db:migrate

# Create admin user in RDS
pnpm bootstrap:admin:aws
```

### Migrate data from AWS RDS (one-time)

Add to `.env.local`:
```env
SUPABASE_DATABASE_URL=postgresql://postgres:...@db.xxx.rds.co:5432/postgres
DATABASE_URL=<your RDS URL>
MIGRATION_DEFAULT_PASSWORD=TempReset@2025
```

```bash
node scripts/migrate-rds-to-rds.mjs --dry-run
node scripts/migrate-rds-to-rds.mjs
```

Tell students to reset passwords after migration (or run a password reset campaign).

---

## Phase 5 — EC2 application servers (Day 2–3)

### Step 5.1 — Launch AMI

1. **EC2** → **Launch instance**
2. Name: `prepindia-app-1`
3. AMI: **Amazon Linux 2023**
4. Instance type: `t3.large` (2 vCPU, 8 GB — good for ~250 users per node; use 2+ nodes for 500)
5. Key pair: create/download `.pem`
6. Network: `prepindia-vpc`, **private subnet**
7. Security group: `prepindia-ec2-sg`
8. IAM role: `prepindia-ec2-role`
9. Storage: 30 GB gp3
10. Launch **2 instances** (prepindia-app-1, prepindia-app-2)

### Step 5.2 — Install software on each EC2

SSH via bastion or Session Manager:

```bash
# Node.js 20
sudo dnf module enable nodejs:20 -y
sudo dnf install -y nodejs git nginx

# pnpm
sudo npm install -g pnpm pm2

# App directory
sudo mkdir -p /opt/prepindia /var/log/prepindia
sudo chown ec2-user:ec2-user /opt/prepindia /var/log/prepindia
cd /opt/prepindia

# Clone your repo (or deploy via CI artifact)
git clone https://github.com/Ramachandra-Hub/Talenthub.git .
cd apps/prepindia-web
```

### Step 5.3 — Environment file on EC2

```bash
sudo nano /opt/prepindia/apps/prepindia-web/.env.production
```

Paste from `.env.aws.example` with real values:

```env
USE_AWS_STACK=true
USE_PRISMA_AUTH=true
NEXT_PUBLIC_USE_AWS_STACK=true
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://exam.yourcollege.edu.in

AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://exam.yourcollege.edu.in
AUTH_TRUST_HOST=true

DATABASE_URL=postgresql://prepindia_app:...@prepindia-proxy.../prepindia?schema=public
DIRECT_URL=postgresql://prepindia_admin:...@prepindia-db.../prepindia?schema=public

AWS_REGION=ap-south-1
AWS_S3_BUCKET=prepindia-exam-proctoring
# Omit keys if using EC2 instance role

PREPINDIA_ADMIN_EMAIL=admin@rce.ac.in
PREPINDIA_ADMIN_PASSWORD=<secure>
```

### Step 5.4 — Build & start

```bash
cd /opt/prepindia/apps/prepindia-web
pnpm install --frozen-lockfile
pnpm build

# PM2 cluster (uses all CPU cores)
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup   # run the command it prints

# NGINX
sudo cp deploy/nginx.conf /etc/nginx/conf.d/prepindia.conf
# Edit server_name in the file
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl start nginx
```

Repeat on **every EC2 instance**.

---

## Phase 6 — Application Load Balancer (Day 3)

### Step 6.1 — Create target group

1. **EC2** → **Target groups** → **Create**
2. Name: `prepindia-tg`
3. Target type: Instances
4. Protocol: HTTP, Port: **80** (NGINX on EC2)
5. VPC: `prepindia-vpc`
6. Health check path: `/api/health`
7. Healthy threshold: 2, interval: 30s
8. Register both EC2 instances

### Step 6.2 — Create ALB

1. **EC2** → **Load balancers** → **Create ALB**
2. Name: `prepindia-alb`
3. Scheme: Internet-facing
4. Subnets: **public** subnets only
5. Security group: `prepindia-alb-sg`
6. Listener: HTTPS 443 → forward to `prepindia-tg`
7. SSL certificate: ACM certificate for your domain

### Step 6.3 — HTTP → HTTPS redirect

Add listener on port 80 → redirect to 443.

**Important:** Disable sticky sessions (JWT is stateless).

---

## Phase 7 — DNS & SSL (Day 3)

### Step 7.1 — ACM certificate

1. **ACM** → **Request certificate**
2. Domain: `exam.yourcollege.edu.in`
3. Validation: DNS (add CNAME in Route 53)

### Step 7.2 — Route 53

1. Create **A record** (alias) → `prepindia-alb`
2. Name: `exam.yourcollege.edu.in`

Wait 5–15 minutes for DNS propagation.

---

## Phase 8 — CloudFront (optional, Day 4)

1. **CloudFront** → Create distribution
2. Origin: ALB domain name
3. Behaviors:
   - `/_next/static/*` → cache 1 year
   - Default → forward all to ALB, no cache for `/api/*`
4. SSL: ACM certificate
5. Update `NEXT_PUBLIC_CDN_URL` if serving static from CloudFront

---

## Phase 9 — Verify deployment (Day 4)

### Health check

```bash
curl -s https://exam.yourcollege.edu.in/api/health | jq
```

Expected:
```json
{
  "status": "healthy",
  "checks": {
    "app": "ok",
    "auth_mode": "prisma_jwt",
    "database": "ok",
    "s3": "ok"
  }
}
```

### Functional tests

1. **Admin login:** `https://exam.yourcollege.edu.in/auth/login/admin`
2. **Student login:** roll number + password
3. **Start exam** → answer questions → wait 3 min → check RDS `test_attempts.answers` updated
4. **Submit exam** → result page loads
5. **Admin dashboard** → stats load without 504

### Load test (500 users)

```bash
# Install k6: https://k6.io/docs/get-started/installation/
k6 run load-tests/k6-exam-load.js \
  -e BASE_URL=https://exam.yourcollege.edu.in \
  -e ATTEMPT_ID=<uuid> \
  -e AUTH_COOKIE="next-auth.session-token=..."
```

---

## Phase 10 — Autoscaling (exam day)

### Auto Scaling Group

1. **EC2** → **Auto Scaling Groups** → Create
2. Launch template: same as prepindia-app (AMI after golden image)
3. Min: 2, Desired: 2, Max: 6
4. Target tracking: ALB request count per target OR CPU 70%
5. Health check: ELB, grace period 300s

### Golden AMI (recommended)

After first successful deploy:
1. Create AMI from configured EC2
2. Update launch template to use AMI
3. New instances boot in ~2 minutes without manual setup

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `USE_AWS_STACK` | Yes | `true` = Prisma + NextAuth |
| `NEXT_PUBLIC_USE_AWS_STACK` | Yes | Client uses cookie auth |
| `DATABASE_URL` | Yes | RDS Proxy URL |
| `DIRECT_URL` | Yes | Direct RDS for migrations |
| `AUTH_SECRET` | Yes | 32+ byte random |
| `AUTH_URL` | Yes | Public app URL |
| `AWS_S3_BUCKET` | Yes | Proctor bucket |
| `AWS_REGION` | Yes | e.g. `ap-south-1` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 502 Bad Gateway | Check PM2: `pm2 logs`; NGINX upstream port 3000 |
| 401 on APIs | `AUTH_SECRET` same on all EC2; cookies need `Secure` + correct domain |
| DB connection exhausted | Use RDS Proxy; lower `connection_limit` in DATABASE_URL |
| Admin dashboard 504 | Scale to 2+ EC2; check RDS CPU; indexes on `test_attempts(user_id, status)` |
| Sessions lost between servers | Ensure ALB stickiness is **off**; JWT cookies must work |
| S3 upload fails | EC2 IAM role or `AWS_ACCESS_KEY_ID` / `SECRET` |

---

## Quick command reference

```bash
# On EC2 — deploy update
cd /opt/prepindia && git pull
cd apps/prepindia-web && pnpm install && pnpm build
pm2 reload prepindia-web

# Logs
pm2 logs prepindia-web
sudo tail -f /var/log/nginx/error.log

# DB migrate
pnpm db:migrate

# Admin bootstrap
pnpm bootstrap:admin:aws
```

---

## Cost estimate (ap-south-1, monthly)

| Service | Approx cost |
|---------|-------------|
| 2× t3.large EC2 | ~$120 |
| RDS db.t4g.medium Multi-AZ | ~$100 |
| RDS Proxy | ~$25 |
| ALB | ~$25 |
| S3 + data transfer | ~$10–30 |
| **Total** | **~$280–300/mo** |

Scale up instance sizes on exam day if needed.

---

## Migration checklist

- [ ] VPC + security groups created
- [ ] RDS + Proxy running
- [ ] S3 bucket + IAM role
- [ ] `pnpm db:push` / migrate on RDS
- [ ] Data migrated from AWS RDS
- [ ] `USE_AWS_STACK=true` on all EC2
- [ ] 2+ EC2 behind ALB
- [ ] HTTPS + DNS working
- [ ] `/api/health` returns healthy
- [ ] Admin + student login tested
- [ ] Full exam flow tested
- [ ] k6 load test passed
- [ ] Remove AWS RDS env vars from production
