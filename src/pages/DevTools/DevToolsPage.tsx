import { Navigate } from 'react-router-dom'
import { AlertTriangle, Download, FileWarning } from 'lucide-react'
import { useIsHouseholdOwner } from '@/hooks/useIsHouseholdOwner'
import { Card } from '@/components/ui'
import { PageHelpButton } from '@/components/layout/PageHelpButton'
import styles from './DevToolsPage.module.css'

// Extensible by design: each tool is its own <ToolSection> below the shared
// warning banner. To add a second tool, add another <ToolSection> — nothing
// about the access-control gate above it needs to change.
export default function DevToolsPage() {
  const { isOwner, loading } = useIsHouseholdOwner()

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
          </Card>
        </section>

        {/* Add future Dev Tools entries as additional <section className={styles.toolSection}> blocks here. */}
      </div>
    </div>
  )
}
