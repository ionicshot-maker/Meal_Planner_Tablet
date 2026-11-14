# Meal Planner server

Self-hosted backend for Meal Planner: Fastify + SQLite (`node:sqlite`, Node 24+). **One server instance per household**, several
logins. It is a fork of `bill-planner-server` (same auth, sessions, sync protocol, backups and deploy pattern) with Meal Planner's
tables and an owner / contributor / readonly role on each account.

Status: Phase 1 (server, auth, roles, sync, import, backup, tests). The AI proxy routes (ported from `netlify/functions`) arrive
in Phase 2; the client sync engine and UI in Phases 3-4.

## Run it

```
npm install
npm run build
PUBLIC_ORIGIN=http://localhost:8791 FRONTEND_DIR=../dist DATA_DIR=./data npm start
```

Same variables as Bill Planner's server (each instance reads its own env file, so sharing names is safe). Defaults differ only in
the port (`8791`).

| Variable | Meaning | Default |
|---|---|---|
| `HOST` / `PORT` | where it listens (loopback by default; put Tailscale Serve in front) | `127.0.0.1` / `8791` |
| `PUBLIC_ORIGIN` | the exact origin people type (`https://<machine>.<tailnet>.ts.net:8447`); drives cookie `Secure` and the origin check | `http://localhost:PORT` |
| `TRUST_PROXY` | honour `X-Forwarded-*` when a proxy is in front | off |
| `FRONTEND_DIR` | the built app (`dist`) to serve from the same origin | none (API only) |
| `DATA_DIR` | folder for `meal-planner.sqlite` and `backups\` (never inside OneDrive) | `./data` |
| `ALLOWED_ORIGINS` | extra origins allowed alongside `PUBLIC_ORIGIN` (comma-separated) | none |
| `BACKUP_KEEP` / `BACKUP_HOUR` | nightly verified backups: how many to keep (0 = off) / local hour | `14` / `3` |
| `NAS_BACKUP_PATH` | optional second copy of each nightly backup (use a UNC path: a scheduled task running as SYSTEM can't see mapped drives) | off |
| `ENV_FILE` | a `KEY=VALUE` file loaded at start (real environment variables win) | `./.env` |
| `SESSION_DAYS` | how long a sign-in lasts | `60` |
| `WATCH_PARENT_PID` | set by the service wrapper: exit when that process disappears | none |

`node dist/index.js backup` takes one backup now and exits.

## Accounts and roles

- First run: `POST /api/auth/setup` creates the first account, who is an **owner**, then closes for good. There is no sign-up.
- Owners add everyone else (`POST /api/users`, with a role), change roles, disable/enable, reset passwords and remove accounts.
  At least one enabled owner always remains (the server refuses anything that would strand the household).
- **owner**: everything, including account management and imports. **contributor**: read and write household data.
  **readonly**: pull only. The server returns 403 to a read-only account's push regardless of what the UI shows, and a role change
  applies to sessions that are already signed in.
- Sessions: a random 32-byte token, stored hashed, sent as the `mp_session` httpOnly cookie **or** an `Authorization: Bearer`
  header (home-screen web apps sometimes drop cookies). Failed logins are throttled per username + IP. Passwords are scrypt;
  minimum 10 characters.
- Writes carrying a browser `Origin` other than `PUBLIC_ORIGIN` / `ALLOWED_ORIGINS` are refused.

## API

| | |
|---|---|
| `GET /api/health` | `{ ok, rev, needsSetup }` (no auth) |
| `GET /api/me` | the signed-in user: `{ id, username, displayName, role }` |
| `POST /api/auth/setup` `login` `logout` `password` | accounts (see above) |
| `GET/POST /api/users`, `POST /api/users/:id/{disable,enable,role,password}`, `DELETE /api/users/:id` | owner only |
| `GET /api/sync/pull?since=<rev>&limit=` | every record changed after `since`, tombstones included; any signed-in account |
| `POST /api/sync/push` `{ deviceId, changes: [{ table, id, baseRev, record }] }` | owner / contributor |
| `POST /api/admin/import` | one-time bootstrap from a native "Full backup" JSON (owner; refuses a non-empty server unless `?allowNonEmpty=true`) |
| `POST /api/admin/replace-data` | "make the server match this device" (owner; safety backup first; extras become tombstones) |
| `GET /api/admin/stats` | revision and per-table live/deleted counts (owner) |

### Sync protocol

Same as Bill Planner's. The server keeps one global revision; every accepted write gets the next one. A push is accepted when the
record's `baseRev` equals the server's current revision for it (0 for a new record), is `unchanged` when the content is identical,
and otherwise comes back as a `conflict` carrying the server's copy -- nothing is ever overwritten silently. The client resolves
conflicts (newer `updatedAt` wins; the loser is kept in a local log).

Tables (named exactly like the app's IndexedDB stores): `ingredients`, `recipes`, `mealPlanDays`, `groceryLists`,
`householdItems`, `collections`, `references` (kitchen reference), `settings`.

Wire record = the stored record plus `id` (the date for a `mealPlanDays` row, `"singleton"` for `settings`) and a required
`updatedAt`. **A delete is a tombstone**: `{ id, updatedAt, deletedAt }`.

**Secrets never live here.** Settings pushed to the server have `geminiApiKey`, `openaiApiKey`, `groqApiKey`, `usdaApiKey`,
the whole `ai` object and the old Supabase / household-code / Family Share fields **removed** (not nulled). When you add a new
provider key to the app, add it to `SETTINGS_SECRET_FIELDS` in `src/sync.ts` and to the client's settings whitelist.

Not synced (as before): `macroLogs`, `mealPlanTemplates`, `processedReceipts`, and device-local settings.

## Tests

`npm test` -- in-memory SQLite only (plus temp folders for backup/static tests). Covers first-run setup, login/throttle/cookies,
owner-only account management, the last-owner guard, role enforcement on push (including mid-session demotion), the sync
protocol (conflicts, idempotency, tombstones, validation, atomic pushes, paging, gzip), secret redaction, backup import,
replace-data, nightly/NAS backups and static serving.
