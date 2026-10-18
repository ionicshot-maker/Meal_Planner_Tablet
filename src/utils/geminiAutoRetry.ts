// Shared "Gemini is busy" retry logic, used by every AI (Gemini) import/scan
// tab. Gemini occasionally returns a 503 ("model overloaded") or 429 (rate
// limited), or a call simply outruns the client-side timeout — all
// transient, all usually gone within a few seconds. Each Gemini edge
// function already retries once on 404 ("model not found") internally, but
// none of them retry a busy/overloaded response, so that's handled here on
// the client, opt-in per tab via a checkbox the UI renders alongside it.
//
// A real failure (bad key, unreadable photo, malformed response, etc.) does
// not match this pattern, so it still surfaces immediately instead of
// silently retrying something that can't succeed.
export const RETRYABLE_ERROR_PATTERN = /high demand|overloaded|try again later|rate limit|\b429\b|\b503\b|timed? ?out/i

export const MAX_AUTO_RETRIES = 3
export const RETRY_DELAY_MS = 3000

export function isRetryableErrorMessage(message: string | undefined | null): boolean {
  return Boolean(message) && RETRYABLE_ERROR_PATTERN.test(message!)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// For result-object style calls (e.g. { status: 'error', errorMessage }) —
// re-runs `run` while `enabled` and the result's error message looks
// transient, up to MAX_AUTO_RETRIES times. `onRetry` fires before each
// retry attempt (1-indexed) so the caller can show "retrying (n/N)…".
export async function withAutoRetryOnResult<T>(
  run: () => Promise<T>,
  getErrorMessage: (result: T) => string | undefined | null,
  enabled: boolean,
  onRetry?: (attempt: number) => void,
): Promise<T> {
  let result = await run()
  let attempt = 0
  while (enabled && attempt < MAX_AUTO_RETRIES && isRetryableErrorMessage(getErrorMessage(result))) {
    attempt++
    onRetry?.(attempt)
    await sleep(RETRY_DELAY_MS)
    result = await run()
  }
  return result
}

// For throw-style calls (e.g. importRecipeFromUrl, which throws Error on
// failure) — re-runs `run` while `enabled` and the thrown error's message
// looks transient, up to MAX_AUTO_RETRIES times, then rethrows.
export async function withAutoRetryOnThrow<T>(
  run: () => Promise<T>,
  enabled: boolean,
  onRetry?: (attempt: number) => void,
): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await run()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      attempt++
      if (!enabled || attempt > MAX_AUTO_RETRIES || !isRetryableErrorMessage(message)) {
        throw err
      }
      onRetry?.(attempt)
      await sleep(RETRY_DELAY_MS)
    }
  }
}
