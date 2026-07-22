import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getCurrentSession, onAuthStateChange } from '@/db/auth'

// Tracks the current Supabase auth session for a given project (url/key),
// restoring it from Supabase's own persisted session on mount and staying
// live via onAuthStateChange — covers sign-in/sign-out from this tab and a
// token refresh happening in the background.
export function useSupabaseAuth(url: string, key: string) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!url || !key) {
      setSession(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getCurrentSession(url, key).then(s => {
      if (!cancelled) {
        setSession(s)
        setLoading(false)
      }
    })
    const unsubscribe = onAuthStateChange(url, key, s => setSession(s))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [url, key])

  return { session, user: session?.user ?? null, loading }
}
