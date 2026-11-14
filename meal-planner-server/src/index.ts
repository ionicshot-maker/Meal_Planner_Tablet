import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { buildApp } from './app.js';
import { backupNow, pruneBackups, scheduleNightlyBackup } from './backup.js';
import { ensureEpoch, highWaterRecorder } from './epoch.js';

// Settings come from the environment; for a service, put them in a file instead (ENV_FILE, default ./.env next to where the
// server is started). Variables already set in the real environment win over the file.
const envFile = process.env.ENV_FILE ?? path.resolve('.env');
if (fs.existsSync(envFile)) {
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  for (const k of Object.keys(before)) process.env[k] = before[k];
}

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const dbFile = path.join(config.dataDir, 'meal-planner.sqlite');
const store = new Store(dbFile);
ensureEpoch(store, config.dataDir);

// `node dist/index.js backup` -> take one backup now and exit (for manual use or an external scheduler).
if (process.argv[2] === 'backup') {
  const r = backupNow(store, config.dataDir, new Date(), { path: config.nasBackupPath, keep: config.backupKeep });
  const pruned = config.backupKeep > 0 ? pruneBackups(config.dataDir, config.backupKeep) : 0;
  console.log(`Backup written: ${r.file} (${r.records} records, ${(r.bytes / 1024).toFixed(0)} KB); pruned ${pruned} old.${r.nas?.copied ? ` Copied to NAS ${r.nas.path}.` : ''}`);
  store.close();
  process.exit(0);
}

const app = buildApp(store, config, { afterWrite: highWaterRecorder(store, config.dataDir) });

// Housekeeping: drop expired sessions now and then; back the database up every night.
const timer = setInterval(() => store.purgeExpiredSessions(), 6 * 3600_000);
timer.unref();
if (config.backupKeep > 0) scheduleNightlyBackup(store, { dataDir: config.dataDir, keep: config.backupKeep, hour: config.backupHour, nasPath: config.nasBackupPath });

async function shutdown(signal: string) {
  console.log(`Meal Planner server: ${signal}, shutting down.`);
  try { await app.close(); } finally { store.close(); }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// When started by the service wrapper, exit if the wrapper goes away. Windows terminates only the wrapper itself when a
// scheduled task is stopped, which would otherwise leave this process serving (an orphan holding the port, running old code).
const watchPid = Number(process.env.WATCH_PARENT_PID ?? 0);
if (watchPid > 0) {
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
  setInterval(() => { if (!alive(watchPid)) void shutdown(`parent process ${watchPid} is gone`); }, 3000);
}

await app.listen({ host: config.host, port: config.port });
console.log(`Meal Planner server listening on http://${config.host}:${config.port}`);
console.log(`  public origin: ${config.publicOrigin}${config.allowedOrigins.length > 1 ? `  (also allowed: ${config.allowedOrigins.slice(1).join(', ')})` : ''}`);
console.log(`  data: ${dbFile}   backups: ${config.backupKeep > 0 ? `nightly at ${String(config.backupHour).padStart(2, '0')}:00, keep ${config.backupKeep}` : 'off'}${config.nasBackupPath ? `  NAS copy: ${config.nasBackupPath}` : ''}`);
console.log(`  frontend: ${config.frontendDir ?? '(API only)'}   proxy trusted: ${config.trustProxy}`);
