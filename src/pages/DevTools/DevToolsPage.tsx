import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { AlertTriangle, Download, FileWarning, ScanSearch } from 'lucide-react'
import { useIsHouseholdOwner } from '@/hooks/useIsHouseholdOwner'
import { Card, Button, Modal } from '@/components/ui'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import { findLeadingZeroBarcodeDupes, type BarcodeDupeGroup, type BarcodeDupeEntry } from '@/utils/barcodeDuplicateScan'
import { deleteIngredient } from '@/db/ingredients'
import { mergeIngredients, countIngredientReferences, totalReferences, type IngredientReferenceCounts } from '@/db/mergeIngredients'
import styles from './DevToolsPage.module.css'

// Extensible by design: each tool is its own <ToolSection> below the shared
// warning banner. To add a second tool, add another <ToolSection> — nothing
// about the access-control gate above it needs to change.
type ScanStatus = 'idle' | 'scanning' | 'done'

// The default "keep" pick for a group — the entry with the longer raw
// barcode string. This directly matches the bug's own signature: the
// leading-zero-intact string (13 digits) is the more complete/original one,
// the stripped string (12 digits) is the corrupted one. Ties keep the first
// entry encountered.
function defaultKeepEntry(entries: BarcodeDupeEntry[]): BarcodeDupeEntry {
  return entries.reduce((longest, e) => (e.rawBarcode.length > longest.rawBarcode.length ? e : longest), entries[0])
}

export default function DevToolsPage() {
  const { isOwner, loading } = useIsHouseholdOwner()
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [dupeGroups, setDupeGroups] = useState<BarcodeDupeGroup[]>([])
  // Session-only dismissal — "Skip" hides a pair from the current results
  // without changing any data; it reappears if the page is scanned again
  // later (e.g. next visit), which is deliberate: nothing about a skip is
  // persisted, so it can't silently suppress a real duplicate forever.
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set())
  // Which entry (by ingredientId) is picked as "keep" per group — keyed by
  // normalizedBarcode. Falls back to defaultKeepEntry() when a group has no
  // explicit pick yet.
  const [keepPicks, setKeepPicks] = useState<Record<string, string>>({})
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeResult, setMergeResult] = useState<{ keepName: string; counts: IngredientReferenceCounts } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BarcodeDupeEntry | null>(null)
  const [pendingDeleteCounts, setPendingDeleteCounts] = useState<IngredientReferenceCounts | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  async function runBarcodeDupeScan() {
    setScanStatus('scanning')
    setActionError('')
    const groups = await findLeadingZeroBarcodeDupes()
    setDupeGroups(groups)
    setScanStatus('done')
  }

  function skipGroup(normalizedBarcode: string) {
    setDismissedGroups(prev => new Set(prev).add(normalizedBarcode))
  }

  async function handleMerge(keepEntry: BarcodeDupeEntry, mergeAwayEntry: BarcodeDupeEntry) {
    setMergingId(mergeAwayEntry.variantId)
    setActionError('')
    try {
      const counts = await mergeIngredients(keepEntry.ingredientId, mergeAwayEntry.ingredientId)
      setMergeResult({ keepName: keepEntry.ingredientName, counts })
      await runBarcodeDupeScan()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Merge failed — nothing was changed.')
    } finally {
      setMergingId(null)
    }
  }

  async function openDeleteConfirm(entry: BarcodeDupeEntry) {
    setPendingDelete(entry)
    setPendingDeleteCounts(null)
    setActionError('')
    const counts = await countIngredientReferences(entry.ingredientId)
    setPendingDeleteCounts(counts)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeletingId(pendingDelete.variantId)
    setActionError('')
    try {
      await deleteIngredient(pendingDelete.ingredientId)
      setPendingDelete(null)
      setPendingDeleteCounts(null)
      await runBarcodeDupeScan()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  // While the owner check is in flight, render nothing rather than either the
  // page or a redirect — avoids both a flash of protected content for a real
  // owner on a slow connection, and a flash of "redirecting" for one who was
  // always going to pass the check a moment later.
  if (loading) return null

  // Contributors/readonly members, anyone not signed in, and any household
  // that never set up Account/Cloud Sync at all land here — same outcome
  // for all three, no distinction shown. See useIsHouseholdOwner.ts and
  // MealPlannerApp_Reference.md for why this is deliberately the only gate.
  if (!isOwner) return <Navigate to="/ingredients" replace />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Dev Tools</h1>
        <PageHelpButton />
      </header>

      <div className={styles.content}>
        <div className={styles.warningBanner}>
          <AlertTriangle size={20} className={styles.warningIcon} aria-hidden="true" />
          <div>
            <p className={styles.warningTitle}>Dev Tools is for the household owner only.</p>
            <p className={styles.warningBody}>
              These are advanced, technical features. Data produced here (like ingredient
              conversions) is not guaranteed to be 100% accurate and should be spot-checked
              against real product labels before being fully trusted for nutrition tracking —
              especially for anyone with strict dietary or medical needs.
            </p>
          </div>
        </div>

        {/* ── Ingredient Converter ─────────────────────────────────────── */}
        <section className={styles.toolSection}>
          <h2 className={styles.toolTitle}>Ingredient Converter</h2>
          <p className={styles.toolDesc}>
            A local Python tool that converts Open Food Facts export files into a JSON file
            this app can import — useful for bulk-adding branded/packaged products beyond
            what's already in the app (see Import Ingredients → JSON Import). Runs entirely on
            your own computer; nothing about running it touches this app directly.
          </p>

          <Card padding="md">
            <a
              href="/dev-tools/script.py"
              download="ingredient_converter.py"
              className={styles.downloadBtn}
            >
              <Download size={16} />
              Download script.py
            </a>

            <h3 className={styles.stepsHeading}>Setup &amp; usage — no Python experience required</h3>
            <ol className={styles.steps}>
              <li>
                <strong>Install Python (skip if you already have it).</strong> Go to{' '}
                <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">python.org/downloads</a>{' '}
                and download the installer for your computer. Run it — on Windows, make sure to
                check the box that says <strong>"Add python.exe to PATH"</strong> on the first
                install screen before clicking Install, or the next step won't work.
              </li>
              <li>
                <strong>Install the one dependency this script needs (pandas).</strong> Open a
                terminal — on Windows, search the Start menu for "Command Prompt" or
                "PowerShell"; on Mac, open "Terminal" from Applications → Utilities — and type:
                <pre className={styles.codeBlock}>pip install pandas</pre>
                Press Enter and wait for it to finish. You only need to do this once, ever, on
                a given computer.
              </li>
              <li>
                <strong>Download the script above</strong> and save it somewhere easy to find,
                like your Desktop or Downloads folder.
              </li>
              <li>
                <strong>Get an Open Food Facts export file.</strong> Open Food Facts is a free,
                public database of grocery products. Go to{' '}
                <a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">world.openfoodfacts.org</a>,
                search or browse for the brand/category you want, and use their export feature
                to download the results as a <strong>CSV or XLSX file</strong>. This is a
                third-party site, not part of this app — the script just reads whatever file it
                gives you.
              </li>
              <li>
                <strong>Run the script.</strong> Double-click the downloaded <code>script.py</code>{' '}
                file. If double-clicking doesn't open a window, open a terminal, type{' '}
                <code>python </code> (with a trailing space), drag the script file into the
                terminal window to fill in its path automatically, and press Enter.
              </li>
              <li>
                <strong>In the app that opens:</strong> click <strong>+ Add Files</strong> and
                pick the CSV/XLSX file(s) you downloaded from Open Food Facts, then click{' '}
                <strong>Convert Files to JSON</strong>. Pick where to save the output when
                prompted (Downloads is fine).
              </li>
              <li>
                <strong>Check the output.</strong> The script writes two files: a{' '}
                <code>.json</code> file (the actual data to import) and, if anything needed a
                second look, a matching <code>_REVIEW.md</code> file — see the callout below
                before moving on.
              </li>
              <li>
                <strong>Import it into the app.</strong> Come back here, go to{' '}
                <strong>Import Ingredients → JSON Import</strong>, and drop in the{' '}
                <code>.json</code> file the script produced. You'll get a preview and brand
                breakdown before anything is actually saved.
              </li>
            </ol>

            <div className={styles.reviewCallout}>
              <FileWarning size={18} className={styles.reviewIcon} aria-hidden="true" />
              <p>
                <strong>The <code>_REVIEW.md</code> file is not optional reading.</strong> If the
                script produces one, open it before you import the JSON. It lists specific items
                the converter itself wasn't fully confident about — brand names that might
                actually be product descriptions, or nutrition values that look internally
                inconsistent. Nothing in that file was dropped from the JSON output; it converted
                normally either way. Skipping the review means trusting data the tool is
                explicitly telling you it isn't sure about.
              </p>
            </div>

            <div className={styles.reviewCallout}>
              <AlertTriangle size={18} className={styles.reviewIcon} aria-hidden="true" />
              <p>
                <strong>If you've run this converter before v5, your data may have a known bug.</strong>{' '}
                Versions before v5 could silently drop a leading zero off a barcode (e.g.{' '}
                <code>0079492041754</code> became <code>79492041754</code>), which let the same
                product get imported twice under two different-looking barcodes — real duplicates
                were found this way in production. Use the <strong>Barcode Duplicate Finder</strong>{' '}
                below to check your existing ingredients for this exact pattern. Re-downloading and
                re-running the script won't fix data already imported — only the finder below (and a
                manual merge) will.
              </p>
            </div>
          </Card>
        </section>

        {/* ── Barcode Duplicate Finder ─────────────────────────────────── */}
        <section className={styles.toolSection}>
          <h2 className={styles.toolTitle}>Barcode Duplicate Finder</h2>
          <p className={styles.toolDesc}>
            One-time cleanup check for the leading-zero barcode bug described above. Scans your
            existing ingredients for variants whose barcodes match once leading zeros are stripped,
            but are stored as different strings — the exact signature that bug left behind. This
            only reports candidates; nothing is merged or changed automatically. Review each pair
            and merge/delete manually in Ingredients if they're really the same product.
          </p>

          <Card padding="md">
            <Button
              variant="secondary"
              onClick={runBarcodeDupeScan}
              disabled={scanStatus === 'scanning'}
            >
              <ScanSearch size={16} />
              {scanStatus === 'scanning' ? 'Scanning…' : 'Scan for Leading-Zero Barcode Duplicates'}
            </Button>

            {actionError && <p className={styles.actionError}>{actionError}</p>}

            {mergeResult && (
              <div className={styles.mergeResultBanner}>
                <span>
                  ✓ Merged into <strong>{mergeResult.keepName}</strong>. Updated {mergeResult.counts.recipes} recipe(s),{' '}
                  {mergeResult.counts.groceryLists} grocery list(s), {mergeResult.counts.macroLogs} macro log entr(y/ies).
                </span>
                <button type="button" className={styles.dismissBanner} onClick={() => setMergeResult(null)} aria-label="Dismiss">×</button>
              </div>
            )}

            {scanStatus === 'done' && dupeGroups.filter(g => !dismissedGroups.has(g.normalizedBarcode)).length === 0 && (
              <p className={styles.scanEmpty}>
                ✓ No leading-zero barcode duplicates found{dismissedGroups.size > 0 ? ' (some were skipped this session)' : ''}.
              </p>
            )}

            {scanStatus === 'done' && dupeGroups.filter(g => !dismissedGroups.has(g.normalizedBarcode)).length > 0 && (
              <div className={styles.dupeResults}>
                {(() => {
                  const visibleGroups = dupeGroups.filter(g => !dismissedGroups.has(g.normalizedBarcode))
                  return (
                    <>
                      <p className={styles.dupeResultsSummary}>
                        Found {visibleGroups.length} candidate pair{visibleGroups.length !== 1 ? 's' : ''} —
                        review each below. The pre-selected "Keep" is whichever entry has the longer (more complete)
                        barcode.
                      </p>
                      {visibleGroups.map(group => {
                        const defaultKeep = defaultKeepEntry(group.entries)
                        const keepIngredientId = keepPicks[group.normalizedBarcode] ?? defaultKeep.ingredientId
                        const keepEntry = group.entries.find(e => e.ingredientId === keepIngredientId) ?? defaultKeep
                        return (
                          <div key={group.normalizedBarcode} className={styles.dupeGroup}>
                            <div className={styles.dupeGroupHeader}>
                              <p className={styles.dupeGroupLabel}>
                                Barcodes matching digits: <code>{group.normalizedBarcode}</code>
                              </p>
                              <button
                                type="button"
                                className={styles.skipBtn}
                                onClick={() => skipGroup(group.normalizedBarcode)}
                              >
                                Skip this pair
                              </button>
                            </div>
                            {group.entries.map(entry => {
                              const isKeep = entry.ingredientId === keepEntry.ingredientId
                              return (
                                <div key={entry.variantId} className={styles.dupeEntry}>
                                  <label className={styles.dupeEntryKeep}>
                                    <input
                                      type="radio"
                                      name={`keep-${group.normalizedBarcode}`}
                                      checked={isKeep}
                                      onChange={() => setKeepPicks(prev => ({ ...prev, [group.normalizedBarcode]: entry.ingredientId }))}
                                    />
                                    <span className={styles.dupeEntryKeepLabel}>Keep</span>
                                  </label>
                                  <div className={styles.dupeEntryInfo}>
                                    <span className={styles.dupeEntryName}>{entry.ingredientName}</span>
                                    <span className={styles.dupeEntryMeta}>
                                      {entry.brand} · {entry.category} · barcode <code>{entry.rawBarcode}</code>
                                      {entry.ingredientId === defaultKeep.ingredientId ? ' (longer barcode)' : ''}
                                    </span>
                                  </div>
                                  <div className={styles.dupeEntryActions}>
                                    <Link className={styles.dupeEntryLink} to={`/ingredients?edit=${entry.ingredientId}`}>
                                      Open →
                                    </Link>
                                    {!isKeep && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={mergingId === entry.variantId}
                                        onClick={() => handleMerge(keepEntry, entry)}
                                      >
                                        {mergingId === entry.variantId ? 'Merging…' : `Merge into "${keepEntry.ingredientName}"`}
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={deletingId === entry.variantId}
                                      onClick={() => openDeleteConfirm(entry)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
            )}
          </Card>
        </section>

        {pendingDelete && (
          <Modal
            open
            onClose={() => { setPendingDelete(null); setPendingDeleteCounts(null) }}
            title="Delete Ingredient"
            size="sm"
            footer={
              <>
                <Button variant="secondary" onClick={() => { setPendingDelete(null); setPendingDeleteCounts(null) }}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDelete} disabled={deletingId === pendingDelete.variantId}>
                  {deletingId === pendingDelete.variantId ? 'Deleting…' : 'Delete Permanently'}
                </Button>
              </>
            }
          >
            {pendingDeleteCounts === null ? (
              <p>Checking for references…</p>
            ) : totalReferences(pendingDeleteCounts) > 0 ? (
              <p>
                <strong>{pendingDelete.ingredientName}</strong> is referenced by {pendingDeleteCounts.recipes} recipe(s),{' '}
                {pendingDeleteCounts.groceryLists} grocery list(s), and {pendingDeleteCounts.macroLogs} macro log entr(y/ies).
                Deleting it (instead of merging) will leave those pointing at nothing — they won't crash, but will show
                as unlinked/unresolved. Consider <strong>Merge</strong> instead if this is really a duplicate of another
                ingredient. Delete anyway?
              </p>
            ) : (
              <p>
                Permanently delete <strong>{pendingDelete.ingredientName}</strong>? No recipes, grocery lists, or macro
                logs currently reference it. This cannot be undone.
              </p>
            )}
          </Modal>
        )}

        {/* Add future Dev Tools entries as additional <section className={styles.toolSection}> blocks here. */}
      </div>
    </div>
  )
}
