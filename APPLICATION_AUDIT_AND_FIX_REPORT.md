# APPLICATION AUDIT AND FIX REPORT

**Date:** 2026-08-20  
**App:** Talenthub (PrepIndia / RCE T&P)  
**Stack:** Next.js 16 · NextAuth JWT · Prisma · AWS RDS · S3 · Vercel  

---

## Executive Summary

A full-repository audit was performed across authentication, exams, coding runners, AI, resume upload, admin tooling, secrets, and deployment config. **Critical security and exam-integrity issues were fixed in code** in this pass. Remaining blockers are mostly **infrastructure** (self-hosted Piston, Redis rate limits, RDS password rotation) and **product gaps** (heuristic “ATS” / interview, ElevateX client scoring path).

**Overall production readiness: 72/100**

---

## Application Architecture

| Layer | Implementation |
|-------|----------------|
| Frontend | Next.js App Router, React 19, Tailwind |
| Auth | NextAuth v5 Credentials (student / admin), JWT ~8h |
| API | Route handlers under `app/api/*`; edge UI gate in `proxy.ts` |
| DB | Prisma → PostgreSQL (AWS RDS) |
| Storage | AWS S3 (resumes, proctor screenshots) |
| Coding | Self-hosted Piston (optional) → Wandbox → soft fail |
| AI | Provider registry (`lib/ai/providers`); mock gated off in prod |
| Deploy | Vercel (`vercel.json`), optional EC2 docs |

**Main domains:** student exams / ElevateX / placement, admin exam-builder & live dashboard, coding practice, AI helpers, proctoring.

---

## Major Findings

### P0 (critical)

1. Real RDS credentials in `.env*.example` files  
2. Hardcoded default admin password (`RCE_T&P`) used when env unset  
3. Open-exam join: password leaked via API + could overwrite existing user hashes  
4. Sync/minimal complete could overwrite already-submitted attempt scores  
5. Submit access check failed open on timeout / skipped when `elapsedSec > 0`

### P1 (high)

6. Proctor upload lacked attempt ownership check  
7. In-process JS `vm` sandbox usable on production serverless  
8. Mock AI could auto-enable in production without keys  
9. Resume upload: weak MIME validation; no text extraction  
10. Proctor ingest used default internal token + localhost URL  
11. Coding soft-fail not marked `unavailable`  
12. Client-trusted ElevateX scores (partially remaining — see Remaining)

---

## Critical Issues Fixed

| Issue | Fix |
|-------|-----|
| Secrets in env examples | Replaced with placeholders in `.env.local.example`, `.env.vercel-rds.example`, `.env.aws.example` |
| Hardcoded admin password | `getConfiguredAdminPassword()` returns `null` in production; scripts require env |
| Open-link takeover | Existing users must verify **their** password; no hash overwrite; API no longer returns password hint |
| Score overwrite via sync | `completeTestAttemptMinimalPrisma` only updates open attempts; sync returns 409 if already completed |
| Access fall-open | Submit always runs access check; timeout → **deny** |
| Bootstrap defaults | Requires strong password; production needs `X-Setup-Secret` |

---

## High Priority Issues Fixed

| Issue | Fix |
|-------|-----|
| Proctor upload IDOR | Student must own `attemptId` |
| In-process JS | Disabled under `isStrictProduction()` |
| Mock AI in prod | Auto-off unless `AI_MOCK=1`; exam-builder rejects silent mock |
| Resume upload | MIME/extension allowlist + `resumeText` extraction |
| Proctor token | No default token; outbound signals only if URL+token set |
| Coding unavailable | `unavailable: true` when `engine === 'fallback'` |
| Fallback test submit | Rejected on submit/sync |

---

## Medium/Low Issues Fixed

- Join UI no longer auto-fills shared exam password  
- Stale unit test expected “130” slot limit → “150”  
- Added `tests/unit/production-hardening.test.ts`

---

## Security Findings

| Status | Item |
|--------|------|
| FIXED | Credential examples scrubbed (rotate RDS password if those files were ever public) |
| FIXED | Open-link account takeover path |
| FIXED | Admin password hardcode for production runtime |
| FIXED | Proctor upload ownership |
| WARN | In-memory rate limits only (multi-instance weak) — needs Redis/Upstash |
| WARN | ElevateX / placement may still accept client `scorePercent` on some paths |
| WARN | Shared roster default passwords (`Exam2026`) still used for provisioning UX |
| ACTION | **Rotate RDS password** and update Vercel secrets immediately |

---

## Performance Findings

- Live dashboard polls every ~5s — OK for campus scale if queries stay indexed  
- Coding/Wandbox latency can hit Vercel limits — mitigated with soft fail + timeouts  
- N+1 risk on large admin rollups — not rewritten this pass  

---

## Scalability Findings

| Concurrent students | Risk |
|---------------------|------|
| 500 | Acceptable with RDS + Vercel if coding uses remote runner |
| 1,000 | Wandbox SPOF; need self-hosted Piston |
| 5,000 | Need Redis rate limits, connection pooling discipline, async grading queue |

---

## AI / LLM Findings

- Real providers: OpenAI / Gemini / Anthropic / HF / Ollama via registry  
- **No ModelGateway class** — `generateWithAi` is the gateway  
- Interview / “ATS” UIs are largely **heuristic** (documented as product debt)  
- Production no longer silently serves mock MCQs for exam builder  

---

## Database Findings

- Prisma schema present; attempt complete now guarded by open-status  
- Unique “one completed attempt” constraints still best-effort at runtime — migrate formally recommended  
- Indexes on live dashboard paths assumed present; verify under load  

---

## API Findings

- Most admin/student routes use `requireAuth`  
- Setup routes blocked in strict production (`guardSetupRoute`)  
- Bootstrap remains available with secret for first admin only  

---

## Frontend Findings

- Student `/dashboard` redirects to exams (intentional)  
- No separate faculty app — faculty under admin exam-builder  
- Join page hardened against password autofill from API  

---

## DevOps Findings

- Vercel build via `scripts/vercel-build.mjs`  
- Env verification scripts exist  
- CI GitHub Actions not fully verified in this pass  

---

## Testing Results

| Command | Result |
|---------|--------|
| `pnpm run test:unit` | **PASS** (38 tests) |
| `pnpm run typecheck` | **PASS** |
| `pnpm run build` | (run in same session — see summary) |
| E2E Playwright | Not expanded (smoke-only coverage remains) |

---

## Remaining Issues

| Sev | Module | Problem | Impact | Solution | Infra? |
|-----|--------|---------|--------|----------|--------|
| P0 | Ops | Historical RDS password may be compromised if examples were pushed | DB breach | Rotate password, tighten SG | Yes |
| P1 | ElevateX submit | Client `scorePercent` still used for ElevateX path | Fake scores | Server-score MCQs like non-ElevateX | Code |
| P1 | Placement coding | Client `passedCases` trusted | Fake coding marks | Server grade via runner | Code+Infra |
| P1 | Rate limit | In-memory only | Weak under multi-instance | Upstash Redis | Infra |
| P1 | Coding | Wandbox SPOF on Vercel | Exam compile failures | Self-host Piston | Infra |
| P2 | AI interview/ATS | Heuristic not LLM | Misleading UX | Label or wire `/api/v2/ai/generate` | Code |
| P2 | Faculty | No dedicated faculty role UI | Confusion | RBAC surface | Product |
| P2 | Tests | Limited E2E auth exam coverage | Regressions | Playwright fixtures | Code |

---

## Infrastructure Dependencies

1. AWS RDS (rotated credentials)  
2. Optional self-hosted Piston (`PISTON_API_URL`)  
3. Optional Redis for distributed rate limits  
4. S3 for resumes/proctor  
5. At least one real AI key for exam-builder in production  

---

## Production Readiness Score

| Area | Score |
|------|------:|
| Architecture | 75 |
| Frontend | 70 |
| Backend | 74 |
| Database | 72 |
| Authentication | 78 |
| Authorization | 76 |
| Security | 70 |
| AI | 58 |
| Coding engine | 68 |
| Resume/ATS | 62 |
| Testing | 55 |
| Performance | 68 |
| Scalability | 60 |
| DevOps | 72 |
| Monitoring | 45 |
| UX | 70 |
| Documentation | 65 |
| **Overall** | **72** |

---

## Recommended Next Steps

1. **Rotate RDS password** and scrub any private remotes that ever contained the old examples  
2. Server-score ElevateX MCQs on submit (same path as department exams)  
3. Provision self-hosted Piston; set `PISTON_API_URL` on Vercel  
4. Add Upstash Redis rate limiting for login / coding / AI  
5. Expand Playwright: login → take exam → submit → re-entry blocked  
6. Label or replace heuristic ATS/interview with real LLM calls  

---

## Files Changed (this hardening pass)

- `lib/admin-defaults.ts` — no prod password fallback  
- `lib/exams/open-exam-link.ts` — no account takeover  
- `app/api/exams/open/[token]/route.ts` — no password leak  
- `app/join/[token]/page.tsx` — no autofill password  
- `lib/db/test-attempts-prisma.ts` — open-only complete + sync conflict  
- `app/api/student/test-attempts/route.ts` — fail-closed access; reject fallback  
- `app/api/student/test-attempts/sync/route.ts` — 409 + reject fallback  
- `app/api/storage/proctor-upload/route.ts` — ownership check  
- `app/api/student/profile/upload-resume/route.ts` — MIME + text extract  
- `lib/ai/providers/mock.ts` — mock off in prod  
- `app/api/exam-builder/ai-generate/route.ts` — reject silent mock  
- `lib/coding/execute-inprocess-js.ts` — disabled in prod  
- `app/api/v2/proctor/ingest/route.ts` — no default token  
- `app/api/v2/coding/run/route.ts` — `unavailable` flag  
- `app/api/admin/bootstrap/route.ts` / signin / providers / seed — password hardening  
- Env examples + bootstrap scripts + `deploy/vercel/required-env.json`  
- `tests/unit/production-hardening.test.ts`  
- `tests/unit/exam-schedule-slots.test.ts` (expectation fix)  
