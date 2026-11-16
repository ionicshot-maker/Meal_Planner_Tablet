/**
 * Resilience layer: Food Intelligence is an OPTIONAL enhancement for Meal Planner.
 *
 * Rules enforced here (and tested):
 *  - Not configured  -> every call resolves `null` immediately, no network, no side effects.
 *  - Offline / breaker open / timeout / network error / 5xx -> `null` (caller uses existing behaviour).
 *  - Never throws.  Repeated infrastructure failures open a circuit breaker so a dead
 *    service costs one slow call, not one per scan.
 *  - 4xx responses are *our* mistake or a miss, not an outage: `null`, breaker unaffected.
 *
 * Configuration (all optional): `localStorage['foodIntelligence.config']` =
 * `{"enabled":true,"baseUrl":"https://…","apiKey":"…","credentials":"include"}` (written by Settings ->
 * Integrations -> Food Intelligence), or build-time `VITE_FOOD_INTELLIGENCE_URL` (+ `_API_KEY`, `_CREDENTIALS`).
 * `credentials: "include"` is for deployments behind Cloudflare Access (the Access cookie is sent cross-origin).
 */
import { FoodIntelligenceClient, FoodIntelligenceError } from './foodIntelligenceClient.ts'

export interface FiConfig {
  baseUrl: string
  apiKey?: string
  storeIds?: string[]
  timeoutMs?: number
  credentials?: 'include' | 'same-origin' | 'omit'
}

export const CONFIG_KEY = 'foodIntelligence.config'

type StorageLike = { getItem(key: string): string | null }
type WritableStorage = StorageLike & { setItem(key: string, value: string): void; removeItem(key: string): void }
type Env = Record<string, string | undefined>

const URL_RE = /^https?:\/\//
const CREDENTIAL_MODES = new Set(['include', 'same-origin', 'omit'])

function defaultStorage(): WritableStorage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined
}
function defaultEnv(): Env | undefined {
  return (import.meta as unknown as { env?: Env }).env
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function readConfig(
  storage: StorageLike | undefined = defaultStorage(),
  env: Env | undefined = defaultEnv(),
): FiConfig | null {
  try {
    const raw = storage?.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean } & Partial<FiConfig>
      if (parsed.enabled === true && typeof parsed.baseUrl === 'string' && URL_RE.test(parsed.baseUrl)) {
        return {
          baseUrl: normalizeUrl(parsed.baseUrl), apiKey: parsed.apiKey || undefined, storeIds: parsed.storeIds,
          timeoutMs: parsed.timeoutMs,
          credentials: parsed.credentials && CREDENTIAL_MODES.has(parsed.credentials) ? parsed.credentials : undefined,
        }
      }
      if (parsed.enabled === false) return null   // explicit opt-out beats the build-time default
    }
    const url = env?.VITE_FOOD_INTELLIGENCE_URL
    if (url && URL_RE.test(url)) {
      const cred = env?.VITE_FOOD_INTELLIGENCE_CREDENTIALS
      return {
        baseUrl: normalizeUrl(url), apiKey: env?.VITE_FOOD_INTELLIGENCE_API_KEY || undefined,
        credentials: cred && CREDENTIAL_MODES.has(cred) ? (cred as FiConfig['credentials']) : undefined,
      }
    }
  } catch {
    /* corrupt config == not configured */
  }
  return null
}

/** Persist the user's choice (Settings page). Returns false when the URL is not usable. */
export function writeConfig(
  cfg: { enabled: boolean; baseUrl: string; apiKey?: string; credentials?: FiConfig['credentials'] },
  storage: WritableStorage | undefined = defaultStorage(),
): boolean {
  if (!storage) return false
  if (cfg.enabled && !URL_RE.test(cfg.baseUrl.trim())) return false
  storage.setItem(CONFIG_KEY, JSON.stringify({
    enabled: cfg.enabled, baseUrl: normalizeUrl(cfg.baseUrl), apiKey: cfg.apiKey || undefined, credentials: cfg.credentials,
  }))
  sharedBreaker.success()   // a new configuration deserves a fresh chance
  return true
}

export function clearConfig(storage: WritableStorage | undefined = defaultStorage()): void {
  storage?.removeItem(CONFIG_KEY)
}

export class CircuitBreaker {
  private failures = 0
  private openUntil = 0
  private threshold: number
  private cooldownMs: number
  private now: () => number
  constructor(threshold = 3, cooldownMs = 5 * 60_000, now: () => number = Date.now) {
    this.threshold = threshold
    this.cooldownMs = cooldownMs
    this.now = now
  }
  /** Closed, or half-open (cooldown elapsed: one probe allowed). */
  allow(): boolean {
    return this.now() >= this.openUntil
  }
  success(): void {
    this.failures = 0
    this.openUntil = 0
  }
  failure(): void {
    this.failures += 1
    if (this.failures >= this.threshold) this.openUntil = this.now() + this.cooldownMs
  }
  get isOpen(): boolean {
    return !this.allow()
  }
  get failureCount(): number {
    return this.failures
  }
}

export const sharedBreaker = new CircuitBreaker()

export interface GuardDeps {
  config?: FiConfig | null
  breaker?: CircuitBreaker
  fetchImpl?: typeof fetch
  isOnline?: () => boolean
  /** Supabase access token of the signed-in Meal Planner user (household endpoints). */
  getToken?: () => string | undefined | Promise<string | undefined>
  /** Active Meal Planner household id; the API verifies membership with Supabase as that user. */
  householdId?: () => string | undefined | Promise<string | undefined>
}

function buildClient(cfg: FiConfig, deps: GuardDeps): FoodIntelligenceClient {
  return new FoodIntelligenceClient({
    baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, fetchImpl: deps.fetchImpl, timeoutMs: cfg.timeoutMs ?? 4000,
    getToken: deps.getToken, householdId: deps.householdId, credentials: cfg.credentials,
  })
}

/** Run `call` against Food Intelligence; resolve `null` on ANY problem. Never throws. */
export async function guarded<T>(
  call: (client: FoodIntelligenceClient, cfg: FiConfig) => Promise<T>,
  deps: GuardDeps = {},
): Promise<T | null> {
  try {
    const cfg = deps.config === undefined ? readConfig() : deps.config
    if (!cfg) return null
    const breaker = deps.breaker ?? sharedBreaker
    const online = deps.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)
    if (!online() || !breaker.allow()) return null
    const client = buildClient(cfg, deps)
    try {
      const result = await call(client, cfg)
      breaker.success()
      return result
    } catch (err) {
      const clientError = err instanceof FoodIntelligenceError && err.status >= 400 && err.status < 500
      if (!clientError) breaker.failure()
      return null
    }
  } catch {
    return null
  }
}

// ── connection check (Settings -> "Test connection") ──────────────────────────────────────────
export type ConnectionState = 'disabled' | 'ready' | 'not_ready' | 'blocked_or_unreachable' | 'offline'

export interface ConnectionStatus {
  state: ConnectionState
  message: string
  breakerOpen: boolean
}

/**
 * Probe `/health/ready` without involving the circuit breaker (a manual test must always try).
 * A browser cannot tell "server down" from "CORS/Cloudflare Access login required" (both surface as a failed
 * fetch), so those are reported together with the likely causes.
 */
export async function checkConnection(deps: GuardDeps = {}): Promise<ConnectionStatus> {
  const cfg = deps.config === undefined ? readConfig() : deps.config
  const breakerOpen = (deps.breaker ?? sharedBreaker).isOpen
  if (!cfg) return { state: 'disabled', message: 'Food Intelligence is not enabled. Meal Planner is using its built-in behaviour.', breakerOpen }
  const online = deps.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)
  if (!online()) return { state: 'offline', message: 'This device is offline.', breakerOpen }
  try {
    const health = await buildClient(cfg, deps).health()
    if (health.status === 'ready') {
      const breaker = deps.breaker ?? sharedBreaker
      breaker.success()
      return { state: 'ready', message: 'Connected. Food Intelligence is ready.', breakerOpen: false }
    }
    return { state: 'not_ready', message: `Reachable but not ready (database: ${health.database ? 'ok' : 'down'}, schema: ${health.migrations ? 'current' : 'out of date'}).`, breakerOpen }
  } catch (err) {
    if (err instanceof FoodIntelligenceError) {
      return { state: 'blocked_or_unreachable', message: `The server answered with an error (${err.status}). ${err.status === 403 ? 'Cloudflare Access may be rejecting this device - open the Food Intelligence address once in this browser and sign in.' : ''}`.trim(), breakerOpen }
    }
    return {
      state: 'blocked_or_unreachable',
      message: 'Could not reach Food Intelligence. Possible causes: the server is down, the address is wrong, this site is not in the server\'s allowed origins (CORS), or Cloudflare Access needs you to sign in (open the address once in this browser).',
      breakerOpen,
    }
  }
}
