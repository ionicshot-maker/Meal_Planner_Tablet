import { useState } from 'react'
import { Button, Card, Input, Toggle } from '@/components/ui'
import { checkConnection, clearConfig, guarded, readConfig, writeConfig } from '@/utils/foodIntelligence/resilient.ts'
import type { ConnectionStatus } from '@/utils/foodIntelligence/resilient.ts'
import { currentIdentity, fiIdentityDeps } from '@/utils/foodIntelligence/identity.ts'
import type { DiscoveryProposal, DiscoveryRequest } from '@/utils/foodIntelligence/foodIntelligenceClient.ts'
import styles from './FoodIntelligenceSection.module.css'

// OPTIONAL integration. Meal Planner works exactly the same with this off, unreachable, or never configured.
// Everything here talks to Food Intelligence through the resilient layer (never throws, never blocks Meal Planner).

const ACCESS_LABEL: Record<DiscoveryProposal['access'], string> = {
  open: 'Open source',
  partner_api: 'Needs partner access',
  manual_provision: 'Needs a feed from your operator',
  user_generated: 'From your own receipts / scans',
}

export function FoodIntelligenceSection() {
  const initial = readConfig()
  const [enabled, setEnabled] = useState(initial !== null)
  const [url, setUrl] = useState(initial?.baseUrl ?? '')
  const [behindAccess, setBehindAccess] = useState(initial?.credentials === 'include')
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [retailers, setRetailers] = useState('')
  const [zip, setZip] = useState('')
  const [discovery, setDiscovery] = useState<DiscoveryRequest | null>(null)
  const [discoveryMsg, setDiscoveryMsg] = useState('')

  function save() {
    setError('')
    const ok = writeConfig({ enabled, baseUrl: url, credentials: behindAccess ? 'include' : undefined })
    if (!ok) {
      setError('Enter the full address, starting with https:// (or http:// for a test server).')
      return
    }
    setSaved(true)
    setStatus(null)
    window.setTimeout(() => setSaved(false), 2500)
  }

  function disconnect() {
    clearConfig()
    setEnabled(false)
    setUrl('')
    setBehindAccess(false)
    setStatus(null)
    setDiscovery(null)
  }

  async function test() {
    setBusy(true)
    save()
    setStatus(await checkConnection())
    setBusy(false)
  }

  async function findSources() {
    setDiscoveryMsg('')
    const names = retailers.split(',').map(s => s.trim()).filter(Boolean)
    if (!names.length) { setDiscoveryMsg('Enter at least one store, separated by commas.'); return }
    setBusy(true)
    const identity = await currentIdentity()
    if (!identity.signedIn || !identity.householdId) {
      setDiscoveryMsg('Sign in with your Meal Planner account (Cloud Sync) and join a household first - source discovery is shared by your household.')
      setBusy(false)
      return
    }
    const result = await guarded(c => c.createDiscovery({ retailers: names, area: zip.trim() ? { zip: zip.trim() } : {} }), fiIdentityDeps())
    setBusy(false)
    if (!result) setDiscoveryMsg('Food Intelligence did not answer this request (check the connection test above, and that your role is Contributor or Owner).')
    setDiscovery(result)
  }

  async function decide(p: DiscoveryProposal, approve: boolean) {
    const res = await guarded(c => (approve ? c.approveProposal(p.id) : c.rejectProposal(p.id)), fiIdentityDeps())
    if (!res) { setDiscoveryMsg('That change could not be saved.'); return }
    setDiscovery(d => d && { ...d, proposals: d.proposals.map(x => (x.id === p.id ? { ...x, ...res } : x)) })
  }

  const stateClass = status?.state === 'ready' ? styles.ok : status?.state === 'disabled' ? styles.hint : styles.bad

  return (
    <div className={styles.section}>
      <h3 className={styles.title}>Food Intelligence (optional)</h3>
      <p className={styles.desc}>
        Connects Meal Planner to your Food Intelligence service for richer product data, store prices and sale tracking.
        Meal Planner keeps working exactly as before if this is off, or if the service is ever offline.
      </p>

      <Card padding="md">
        <div className={styles.fields}>
          <Toggle checked={enabled} onChange={setEnabled} label="Use Food Intelligence on this device" />
          <Input
            label="Service address"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://food.example.com"
            disabled={!enabled}
            autoCapitalize="none"
            autoCorrect="off"
            hint="This setting is saved on this device only."
          />
          <Toggle checked={behindAccess} onChange={setBehindAccess} disabled={!enabled}
            label="Protected by Cloudflare Access (send my login)" />
          <p className={styles.hint}>
            If the service is protected by Cloudflare Access, open its address once in this browser and sign in with your email
            code. Then turn the switch above on.
          </p>
          <div className={styles.row}>
            <Button onClick={save} disabled={busy}>Save</Button>
            <Button variant="secondary" onClick={test} disabled={busy || !enabled}>Test connection</Button>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>Turn off &amp; forget</Button>
            {saved && <span className={styles.ok}>Saved</span>}
          </div>
          {error && <span className={styles.bad}>{error}</span>}
          {status && (
            <span className={stateClass} role="status">
              {status.message}{status.breakerOpen && status.state !== 'ready' ? ' (Meal Planner is pausing calls to it for a few minutes.)' : ''}
            </span>
          )}
        </div>
      </Card>

      {enabled && (
        <Card padding="md">
          <div className={styles.fields}>
            <h4 className={styles.title}>Stores &amp; data sources</h4>
            <p className={styles.desc}>
              Tell it where you shop. It will show where product, price and sale data could come from, how reliable each
              source is, and what is still needed. Nothing is turned on until you approve it.
            </p>
            <Input label="Stores you shop at" value={retailers} onChange={e => setRetailers(e.target.value)}
              placeholder="Walmart, Aldi, Harps, Reasor's" hint="Separate with commas." />
            <Input label="ZIP code (optional)" value={zip} onChange={e => setZip(e.target.value)} placeholder="74103" inputMode="numeric" />
            <div className={styles.row}><Button onClick={findSources} disabled={busy}>Find data sources</Button></div>
            {discoveryMsg && <span className={styles.warn}>{discoveryMsg}</span>}

            {discovery && (
              <div className={styles.list}>
                {discovery.stores.length > 0 && (
                  <p className={styles.desc}>Known stores nearby: {discovery.stores.map(s => s.name).join(', ')}</p>
                )}
                {discovery.proposals.map(p => (
                  <div key={p.id} className={styles.proposal}>
                    <div className={styles.proposalHead}>
                      <span>{p.name}</span>
                      <span className={styles.badge}>{p.confidence != null ? `${Math.round(p.confidence * 100)}% confidence` : '—'}</span>
                    </div>
                    <span className={styles.hint}>{ACCESS_LABEL[p.access]} · provides {p.provides.join(', ') || 'data'}</span>
                    {p.evidence[0] && <span className={styles.hint}>{p.evidence[0]}</span>}
                    {p.missing.length > 0 && <span className={styles.missing}>Still needed: {p.missing.map(m => m.replace(/^\w+:/, '')).join(', ')}</span>}
                    <div className={styles.row}>
                      {p.status === 'proposed' && (
                        <>
                          <Button size="sm" onClick={() => decide(p, true)}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide(p, false)}>No thanks</Button>
                        </>
                      )}
                      {p.status === 'enabled' && <span className={styles.ok}>Enabled</span>}
                      {p.status === 'needs_configuration' && <span className={styles.warn}>Approved - waiting for your operator to finish setup</span>}
                      {p.status === 'rejected' && <span className={styles.hint}>Declined</span>}
                      {p.status === 'approved' && <span className={styles.warn}>Approved - waiting for your operator</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
