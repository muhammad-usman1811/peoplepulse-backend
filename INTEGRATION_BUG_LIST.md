# PeoplePulse Integration Bug Tracker

## Review follow-up — 2026-10-09 (late)

**PROD-6 — Password reset would silently stop sending once production mode worked — fixed**
`forgotPassword` built its reset link from `FRONTEND_URL || APP_URL`, falling back to the
request's own origin — but only outside production. In production the fallback was the
empty string, so with neither variable set on Vercel the link had no base, the handler
took its "configuration is missing" branch, and the caller still received the generic
`If an account exists ... a password reset link has been dispatched.` No email, no
token, no error: password reset simply stopped working, visibly to nobody.

Like PROD-4 this was latent, because PROD-1's BOM kept production out of production
mode — so the request-origin fallback was still being used and reset links worked.
Fixing the BOM alone would have broken the flow.

Reproduced faithfully first: the entrypoint run from a directory with no `.env`, so
`dotenv` finds nothing exactly as on Vercel. An earlier attempt looked like it passed
only because `dotenv` had quietly loaded `FRONTEND_URL` from the local gitignored
`.env`, which is never deployed — the log line gave that away.

Refusing the request origin in production is correct, not a bug: a forged `Host` header
would otherwise put an attacker's domain into a reset link emailed to the real account
owner. So the fix keeps that refusal and adds the platform's own deployment URL
(`VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`) as the fallback — the same
platform-supplied value `src/server.js` already trusts for CORS, and one no request can
influence. The API serves `reset-password.html` itself, so its own origin is a working
destination (verified `200` on production).

Now in `src/utils/resetBaseUrl.js` so it is unit-testable, with
`warnIfResetLinksUnavailable()` logging once per cold start when production cannot send
reset links at all — the misconfiguration is now visible in the deployment's own logs
instead of only as users never receiving email.

Verified end to end through `api/index.js`, with a local SMTP sink capturing the message:
with the platform URL present the email contains
`https://peoplepulse-backend.vercel.app/reset-password.html?token=...` **even when the
request carries `Host: attacker.example`**, and the reset token is persisted (it is
cleared on delivery failure, so persistence proves the send succeeded). With nothing
configured it still refuses to build a link and logs the startup warning.

**DOC-1 — 429 was undocumented on all five rate-limited routes — fixed**
Surfaced by accident when a probe run exhausted the 5-per-15-minute reset limiter: the
morning run had used these endpoints too sparingly to ever trip them. `POST /auth/login`
(20/15min), `POST /auth/forgot-password` (20/15min per IP plus a per-address limit),
`POST /auth/reset-password` and `PUT /auth/reset-password/{resetToken}` (5/15min), and
`PUT /profile/password` (10/15min) can all answer 429, and none said so.
`test-swagger-coverage.js` now fails if any of them stops documenting it.

### Verification tooling note

`contract.js` decided whether to skip write-capable probes from the *label* passed on
the command line. A run labelled `prod-final2` therefore sent those 9 operations at the
live deployment. Nothing was written — all probes were tokenless, so the result was
101×401, 4×400 (forgot-password included, rejected at validation before any email) and
one 200 from `GET /api/health` — but the guard was wrong in principle and now derives
from the target host instead, so a mislabelled run cannot aim writes at production.

### Totals after this round

Unit tests 244/244. Through `api/index.js`: contract 412 probes / 0 mismatches / 0
skipped, Try-it-out 121 calls / 0 mismatches, leak probe 0 leaks. Live production
0 mismatches of 97 safe probes. A two-minute sprint summary is in `SPRINT_SUMMARY.md`.

## Audit of the day's work — 2026-10-09 (end of day)

Re-checked this morning's smoke test and this afternoon's Swagger pass. Two further
production-only defects surfaced, both now fixed, plus corrections to what the
earlier sections could legitimately claim.

**PROD-4 — Validation messages collapsed to "Internal Server Error" in production — fixed**
The error handler only ever showed a message in production when the error carried
`expose` (the http-errors/body-parser convention). `AppError`, which the app's own
validation helpers throw, does not set it. So every thrown field error answered
`400` with the body `{"message":"Internal Server Error"}` — a self-contradicting
response that told the client nothing to correct. Reproduced on three real routes
(`POST /employees` with an unknown department, and a bad `manager` on both
`POST /employees` and `PUT /profile`).

This was latent rather than live: PROD-1's BOM meant production never entered
production mode, so it was still returning the real message — along with a stack
trace. Fixing the BOM on its own would therefore have **introduced** this bug.
`errorMiddleware` now treats a sub-500 `AppError` as client-safe, so the `message`
field Easha's client reads is unchanged by the BOM fix, and only the stack
disappears. 5xx responses, unlabelled 4xx, and `AppError` raised with a 500 stay
generic; covered by `test-env-config.js`.

**PROD-5 — The serverless entrypoint read env before normalizing it — fixed**
`api/index.js` is what Vercel actually invokes, and it requires `src/config/db.js`
(line 12) before `src/server.js` (line 13), where `normalizeEnv()` lived. `db.js`
calls `dns.setServers(process.env.DNS_SERVERS || ...)` in its module body, so that
read saw the raw value. With a BOM on `DNS_SERVERS` the function dies at import with
`Invalid IP address: ﻿8.8.8.8` — verified both ways. `api/index.js` now
normalizes first. Every suite below was then re-run **through this entrypoint**
rather than through `src/server.js`.

### Corrections to the earlier sections

- The morning and afternoon runs exercised `src/server.js`, not the deployed
  `api/index.js` entrypoint. Both now pass through the entrypoint: the per-role
  contract is **412 probes, 0 mismatches, 0 skipped**, and the "Try it out"
  walkthrough is **121 calls, 0 mismatches**.
- The afternoon figure of "0 of 379" skipped 9 write operations (clock-in/out,
  profile and notification updates, mark-all-read, onboarding create, both upload
  routes, forgot-password). Those are now covered by the 412-probe run against the
  throwaway database. They remain deliberately unexercised against live production,
  because succeeding there would write real records.
- Live production still matches the committed spec exactly: **0 mismatches of 97**
  safe probes.
- Swagger documents only response descriptions, not response schemas, so "matches
  production" means status codes, roles, parameters and request examples — not
  response bodies, which are unverified against the docs because the docs make no
  claim about them.

### Still open

- **Seed accounts are not confirmed on production.** `POST /api/auth/login` returns
  an identical `401 Invalid corporate email or password` for a known and an unknown
  address, so production correctly refuses to leak which accounts exist — which also
  means existence cannot be established from outside. Confirming them needs either
  the production `SEED_PASSWORD` (via a gitignored `.env.smoke` holding
  `PP_SEED_PASSWORD=`) or approval to read the Atlas `peoplepulse` database.
- **`.env` hygiene checked and clean:** no BOM, whitespace or leftover
  `replace_with_` placeholder in any of its 13 keys, and `npm run seed` is
  double-guarded against the Atlas database (`ALLOW_DESTRUCTIVE_SEED=false`, and no
  `SEED_PASSWORD` set). `BASE_URL` is read only by `src/test_api.js`, which defaults
  it. Production's own Vercel variables cannot be inspected from here — `NODE_ENV`
  there is still the one that needs re-typing.

### Deliberately not fixed (already owned elsewhere)

- **`pagination.totalPages` on `/api/audit-logs`** (STG-1): `origin/fix/audit-pagination-pages`
  already adds `pages` alongside `totalPages`, which is the right additive fix.
- **Blocked CORS origin returns 500** (STG-2): fixed on
  `origin/security-backend-hardening-pass`, which also moves CORS into
  `src/config/cors.js`. Both are left alone so this work does not conflict with them.

## Swagger vs production — 2026-10-09 (afternoon)

Production serves exactly the same `/api-docs.json` as `main`. Three checks:

1. **Route coverage:** all 106 documented operations exist, with matching methods
   and path-parameter names. The only undocumented paths are the legacy
   `/api/audit-log` alias, now noted in the `/audit-logs` description.
2. **Status-code contract:** every operation was called as no-token, superadmin,
   HR, and employee, and each returned status was checked against the documented
   responses. Before: 79 undocumented statuses (32 of them reproduced on live
   production with no token). After: **0 of 379** locally and **0 of 97** on live
   production.
3. **"Try it out" walkthrough:** each module's documented request examples were
   run end to end on a throwaway database, chaining real IDs (create → read →
   update → approve → delete). After the fixes: **121 calls, 0 mismatches**.

### Fixed in `src/config/swagger.js` (docs only, no behaviour change)

- **Missing 401** on 32 secured operations (leave/WFH, onboarding, documents,
  recruitment GETs, `GET /employees/{id}`, self-review, cycle create).
- **Missing role 403s:** leave/WFH and self-review submissions are employee-only;
  the recruitment router is HR/admin only; onboarding writes and document status
  are HR/admin only; document delete is blocked once approved.
- **Missing 400/404/409s:** `POST /performance/cycles`, `POST /auth/register`,
  document upload/status, onboarding update/delete/tasks/trigger, candidate
  hire/onboarding, and `GET /documents/{id}`.
- **Wrong response:** `GET /recruitment/candidates/{id}` documented a 409
  ("invalid stage transition") that a GET can never return.
- **Examples that failed in "Try it out":**
  - `PUT /profile` sent admin-only fields, so an employee got 403.
  - `POST /org/departments` sent `location: "Lahore"`, but the API expects a location ID.
  - `POST /employees` had no email or password.
  - `POST /recruitment/candidates` had no `jobPosting`.
  - `POST /auth/reset-password` had no `token`.
  - `POST /onboarding` didn't say it needs `employee` or `candidate`.
- **Missing examples** added for leave, WFH, self-review, stage move, employee
  update, onboarding update/tasks, and document status.
- **Undocumented inputs:** the optional `note` on leave/WFH approve and reject.
- **Undocumented precondition:** `POST /payroll/generate` needs every active
  employee to have a `salaryStructure` and `monthlySalary` first.

Guard: `test-swagger-coverage.js` (in `npm test`) now fails if a route is added
without docs, a documented route disappears, or a secured operation lacks 401.

**Merge note:** `security-backend-hardening-pass` (12 commits, +583 lines in
`swagger.js`) is not on `main`/production yet. If it merges after this fix,
reconcile `swagger.js` and rerun the contract check.

## Production smoke test — 2026-10-09

- Production: `https://peoplepulse-backend.vercel.app` (Vercel, `main`)
- Staging baseline: the same `main` code run locally against a throwaway MongoDB,
  seeded with `npm run seed` (no hosted staging deployment exists)
- Method: one non-destructive check matrix run against both. Only GETs and writes
  that validation/authorization must reject (empty bodies, missing IDs, wrong role);
  no clock-ins, payroll generation or record creation. Collection counts were
  identical before and after on the baseline database.

### Results by module

| Module | Production | Notes |
| --- | --- | --- |
| Platform (health, docs, 404, CORS) | Issues found | PROD-1, PROD-2 (fixed in code); PROD-3 harmless |
| Auth / seed accounts | Pending | Unauthenticated checks pass; seed logins need the production `SEED_PASSWORD` |
| Org / Employees | Guards pass | Per-role matrix pending seed logins |
| Attendance | Guards pass | Per-role matrix pending seed logins |
| Leave / WFH | Guards pass | Per-role matrix pending seed logins |
| Payroll | Guards pass | Per-role matrix pending seed logins |
| Recruitment | Guards pass | Per-role matrix pending seed logins |
| Onboarding | Guards pass | Per-role matrix pending seed logins |
| Performance | Guards pass | Per-role matrix pending seed logins |
| Documents | Guards pass | Per-role matrix pending seed logins |
| Reports | Guards pass | Per-role matrix pending seed logins |
| Audit | Guards pass | Per-role matrix pending seed logins; STG-1 |

"Guards pass" means every endpoint returns 401 with no token or a malformed token.

### Production-only issues

**PROD-1 — `NODE_ENV` on Vercel starts with a UTF-8 BOM — fixed in code, dashboard action needed**
`GET /api/health` returns `"environment": "﻿production"` (bytes `EF BB BF`).
Every `NODE_ENV === 'production'` check is false in production, so the
production-only behaviour in `errorMiddleware`, `db.js` and the forgot-password
link builder never runs. Staging returns a clean `"staging"`.
- Code fix (branch `fix/production-smoke-env-bom`): `src/config/env.js` strips a
  BOM and whitespace from plain config values at startup; secrets and keys are
  deliberately untouched.
- **Still to do:** in Vercel → Project → Settings → Environment Variables, delete
  `NODE_ENV` and re-type `production` by hand (don't paste it), then redeploy.
  Check the other variables entered the same way, especially `CLIENT_URL`: with
  a BOM, its first origin would never match and the frontend would get CORS errors.

**PROD-2 — Production error responses leak stack traces — fixed in code**
Caused by PROD-1. For example, `POST /api/auth/login` with malformed JSON returns
an `error` field holding the full stack (`/var/task/node_modules/body-parser/...`),
and a blocked CORS origin returns the stack from `server.js`. With the fix,
production returns `{"message":"Unexpected end of JSON input"}` for client errors
and a generic `Internal Server Error` for server errors, with no stack. Verified
by booting both the old and new code with `NODE_ENV="﻿production"`: the old
code reproduces the leak exactly, and the new code passes all 231 checks.

**PROD-3 — `GET /` redirects with 307 instead of 302 — no action**
Vercel's edge rewrites Express's 302. `/api-docs` still loads (200).

### Same on staging and production (not production-only, logged only)

**STG-1 — `/api/audit-logs` paginates with `pagination.totalPages`**
Every other paginated endpoint (employees, payslips, recruitment, onboarding,
performance, documents, notifications) returns `pagination.pages`. A fix already
exists on branch `fix/audit-pagination-pages`.

**STG-2 — A blocked CORS origin returns 500**
The CORS rejection reaches the default error handler as a 500. A 403 would be
more accurate. Low priority: browsers block the response either way.
