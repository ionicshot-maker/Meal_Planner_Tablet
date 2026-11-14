# Running Meal Planner on the mini PC

One small Node process (the **server**) holds the household's database and also serves the web app, so there is nothing else to run
and no CORS. It listens only on `127.0.0.1`; **Tailscale Serve** puts HTTPS in front of it, **tailnet-only** (never Funnel).

```
phone / tablet / laptop --https--> Tailscale Serve :8447 --http--> 127.0.0.1:8791  (Meal Planner server)
   (each needs Tailscale)                                                  |
                                                              C:\MealPlanner\data\meal-planner.sqlite
```

| What | Where |
|---|---|
| Address people use | `https://angelo-server.tail1d14cc.ts.net:8447` |
| Local port | `8791` (loopback only) |
| Service | Scheduled Task `MealPlannerServer`, runs as SYSTEM at boot, restarts itself |
| Release | `C:\MealPlanner\release` (previous one kept as `release.previous`) |
| Data | `C:\MealPlanner\data` (database, `backups\`, `logs\`, `server.env`) -- never inside OneDrive |
| Needs | Node 24+ on the machine |

Nothing here touches Bill Planner (ports 8787-8790 and Tailscale 443/8443-8445), the old app on 8446, or `C:\Services\MealPlanner`.

## First install (once)

In an **elevated** PowerShell, from `deploy\windows`:

```powershell
.\deploy-mealplanner.ps1 -PreflightOnly     # read-only: checks ports, Node, Tailscale, existing task/database. Needs no elevation.
.\deploy-mealplanner.ps1 -WhatIf            # shows the plan
.\deploy-mealplanner.ps1                    # does it
```

The preflight refuses to continue if the local port or the Tailscale port is taken, the task or a database already exists, or Node is
too old. Add `-NasBackupPath '\\?\UNC\truenas.local\<share>\<folder>'` for a second copy of every nightly backup (use a UNC path: the
service runs as SYSTEM and cannot see mapped drive letters).

Then open the address, go to **Settings > Data**, and create the owner account. It offers this only once. Add everyone else in the
**People** panel.

## Updating

```powershell
.\redeploy.ps1            # builds what is checked out
.\redeploy.ps1 -Pull      # git pull first
```

Every time, in this order: stop the **task** (not just the process, so the wrapper can't restart it mid-build); take a database backup
while the server is quiet; build; start; wait for `/api/health`; **if the new version doesn't come up, roll back to the previous
release by itself**; show status. A failed build leaves the running version untouched and restarts it.

## Everyday checks

```powershell
.\status.ps1              # task, port, health, Tailscale mapping, newest backup, last log lines
```

Logs: `C:\MealPlanner\data\logs\server.log` (rotates at 10 MB). Settings: `C:\MealPlanner\data\server.env`; edit, then
`Restart-ScheduledTask MealPlannerServer`.

## Backups and restoring

The server writes a verified backup every night at 03:00 (keeps 14) into `data\backups`, plus the NAS copy if configured. Take one
on demand with the service running: `node C:\MealPlanner\release\server\dist\index.js backup` (set `ENV_FILE` and `DATA_DIR` first, as
`redeploy.ps1` does).

To restore: **stop the task**, delete `meal-planner.sqlite` (and its `-wal`/`-shm` files), copy the chosen backup in as
`meal-planner.sqlite`, start the task. On start the server notices the database is older than anything it has served before
(`epoch.json`), mints a new epoch, and every device re-syncs from scratch **keeping its own data** and re-sending whatever the restore
lost. (Restoring a copy that is *newer* than anything this folder has served is not detected; the server must be stopped while the
file is swapped.)

## Moving the data over (one time)

The household's real data lives in the tablets' browsers at the **old** address. Capture it once from the device that holds it.

1. **Export** (read-only): in that browser, on the old app, open the console (F12), paste all of `deploy\export-live-data.js`, press
   Enter. It downloads `meal-planner-live-export-<date>.json` and prints counts per kind. It includes the recipe collections and kitchen
   reference pages that the app's own Export button leaves out, and removes API keys from the file. Do it on more than one device if you
   are unsure which has the most recent data, and compare (`compare-exports.ts`, below).
2. **Rehearse** on a scratch server (from `meal-planner-server`):
   ```powershell
   $env:PORT=19793; $env:DATA_DIR='C:\temp\mp-staging'; $env:PUBLIC_ORIGIN='http://localhost:19793'; $env:FRONTEND_DIR='..\dist'; node dist\index.js
   # in another window, after creating a throwaway owner in the browser at http://localhost:19793:
   node --env-file=test/tsx.env --import tsx scripts/import-backup.ts --url http://localhost:19793 --user <owner> --file <export.json>
   node --env-file=test/tsx.env --import tsx scripts/verify-join.ts  --url http://localhost:19793 --user <owner> --file <export.json>
   ```
   `verify-join` plays a brand-new tablet joining with the real sync code and compares what it ends up with, record by record, to the
   file. It must say **VERIFIED**. The tools ask for the password at a prompt (or read `MP_PASSWORD`); never put it on the command line.
3. **For real**: after the first install and creating the owner, run the same two commands against
   `https://angelo-server.tail1d14cc.ts.net:8447`. Then each tablet: remove the old home-screen app, open the new address, add it to the
   home screen, sign in, and tap **Join** when offered.

Other tools (all in `meal-planner-server\scripts`): `compare-exports.ts --a x.json --b y.json` (two exports, or an export vs. a
pg_dump conversion) and `from-pgdump.mjs --in <dump.sql> --out export.json` (converts a `pg_dump` of the old self-hosted Supabase database;
the dump must be unzipped; the nightly PowerShell backups are UTF-16 and are read as-is).

> Restoring one of those nightly **PostgreSQL** backups with `psql` needs a conversion first: they are UTF-16 (a side effect of
> PowerShell 5.1's `>` redirect), which `psql` cannot read directly.

## Removing it

```powershell
.\uninstall-service.ps1 -RemoveServe     # removes the task and the :8447 mapping; the data folder is left alone
```
