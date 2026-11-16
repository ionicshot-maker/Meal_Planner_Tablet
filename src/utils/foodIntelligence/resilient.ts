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
 * `{"enabled":true,"baseUrl":"https://…","apiKey":"…"}` or `VITE_FOOD_INTELLIGENCE_URL`.
 */
import { FoodIntelligenceClient, FoodIntelligenceError } from './foodIntelligenceClient.ts'

export interface FiConfig {
  baseUrl: string
  apiKey?: string
  storeIds?: string[]
  timeoutMs?: number
}

export const CONFIG_KEY = 'foodIntelligence.config'

type StorageLike = { getItem(key: string): string | null }

export function readConfig(
  storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined,
  env: Record<string, string | undefined> | undefined =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env,
): FiConfig | null {
  try {
    const raw = storage?.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean } & Partial<FiConfig>
      if (parsed.enabled === true && typeof parsed.baseUrl === 'string' && /^https?:\/\//.test(parsed.baseUrl)) {
        return { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey, storeIds: parsed.storeIds, timeoutMs: parsed.timeoutMs }
      }
      if (parsed.enabled === false) return null   // explicit opt-out beats the build-time default
    }
    const url = env?.VITE_FOOD_INTELLIGENCE_URL
    if (url && /^https?:\/\//.test(url)) return { baseUrl: url }
  } catch {
    /* corrupt config == not configured */
  }
  return null
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
}

export const sharedBreaker = new CircuitBreaker()

export interface GuardDeps {
  config?: FiConfig | null
  breaker?: CircuitBreaker
  fetchImpl?: typeof fetch
  isOnline?: () => boolean
  getToken?: () => string | undefined | Promise<string | undefined>
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
    const client = new FoodIntelligenceClient({
      baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, fetchImpl: deps.fetchImpl,
      timeoutMs: cfg.timeoutMs ?? 4000, getToken: deps.getToken,
    })
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
