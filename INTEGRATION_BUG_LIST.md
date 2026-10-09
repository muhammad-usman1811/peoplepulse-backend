# PeoplePulse Integration Bug Tracker

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
