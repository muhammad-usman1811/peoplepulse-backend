# Sprint Summary — PeoplePulse Backend

Muhammad Usman · sprint of 22 Sep – 9 Oct 2026 · backend

Written to be read aloud in about two minutes at sprint review. The numbers below are
from the verification runs recorded in `INTEGRATION_BUG_LIST.md`.

---

## Read this out (~2 minutes)

This sprint I built a large part of the PeoplePulse HRMS backend, module by module.

**Core HR first.** I set up the initial backend and the MongoDB Atlas connection, then
delivered forgot-password with real email delivery, employee CRUD with the master lists
behind it, and the Leave and Work-From-Home API including manager approvals.

**Then the talent side.** I built the Performance API end to end — review cycles, self
and manager reviews, and goals with KPIs underneath them. On top of that I built the
Recruitment pipeline, where a candidate moves from Applied through to Hired. When
someone is hired, the Onboarding API takes over with checklists and tasks, including
tasks that complete themselves once the required documents are approved. Alongside the
Document API I cleared eight bugs found during integration, plus two edge cases where
the same person is re-hired.

**Supporting the frontend.** Several items were support work for Easha's screens: the
audit log and system config endpoints, fixes to the profile and audit pagination
responses her components depend on, and the finance reports and announcement composer.

**This week was production hardening,** and it's the part I'd highlight. I smoke-tested
every module against the live production API and found that production was never
actually running in production mode — a hidden character in the `NODE_ENV` setting on
Vercel. That one character meant error responses were exposing internal stack traces.

The interesting part is what fixing it uncovered. Turning production mode on correctly
would have broken two things that had been masked by the same bug: every field
validation message would have collapsed to "Internal Server Error", and password reset
would have silently stopped sending email. I found both by reproducing them rather than
reasoning about them, and fixed all three together. I also discovered I'd been testing
the wrong entry file all along — production runs `api/index.js`, not `src/server.js` —
so I re-ran everything through the real one.

Finally I walked Swagger against the live API, every route and every role, and fixed 84
places where the documentation didn't match real behaviour. Production now matches its
docs exactly, and there are tests that fail if they drift apart again.

**Where it stands:** 106 documented endpoints, 244 unit tests green, every module
verified against production. One item is still open — confirming the seed accounts on
production needs the production password, which I don't have.

---

## Numbers, if asked

| | |
|---|---|
| Documented endpoints | 106 |
| Unit tests | 244 passing |
| Per-role contract probes (through `api/index.js`) | 412, 0 mismatches |
| Documented-example walkthrough | 121 calls, 0 mismatches |
| Live production vs committed spec | 97 safe probes, 0 mismatches |
| Swagger mismatches fixed | 84 (79 status codes + 5 rate-limit responses) |
| Production-only bugs found and fixed | 4 |

## The four production-only bugs, if asked

1. **`NODE_ENV` carried a UTF-8 BOM** on Vercel, so no `=== 'production'` check ever
   matched and error responses returned stack traces with internal file paths.
2. **Validation messages collapsed** to `400 Internal Server Error`, because the error
   handler only trusted errors tagged by body-parser, not the app's own `AppError`.
   Latent until bug 1 was fixed.
3. **Password reset would silently stop sending.** With production mode on and no
   `FRONTEND_URL` configured, the reset link had no base, so the API answered "link
   dispatched" and sent nothing. Now falls back to the platform's own deployment URL,
   which is safe because it can't be forged through a request header.
4. **The serverless entry read configuration before normalising it** — `api/index.js`
   loads the database config before the normalisation ran, so a BOM on `DNS_SERVERS`
   would kill the function at startup.

## Still open

- **Seed accounts are not confirmed on production.** Needs the production
  `SEED_PASSWORD`, or approval to read the Atlas database. Production correctly refuses
  to reveal whether an account exists, so this can't be checked from outside.
- **`NODE_ENV` on Vercel still needs re-typing by hand** and a redeploy; the code fix
  defends against it but the stored value is still wrong.
- Two known issues are deliberately left to their existing branches:
  `fix/audit-pagination-pages` and `security-backend-hardening-pass`.
