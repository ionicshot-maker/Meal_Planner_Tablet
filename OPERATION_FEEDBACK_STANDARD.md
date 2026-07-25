# Operation Feedback & Trust Standard

This document defines the shared status/progress pattern for every long-running operation in
the app. It exists because the app has at least five independent long-running operations —
Cloud Sync, JSON Import, Bulk Entry, Starter Library loading, Backup Import — each built with
its own ad-hoc feedback (or none). That's the problem this standard closes: a user should
only ever have to learn "what a working operation looks like" once, not once per screen.

**This is one shared pattern, reused everywhere — not a per-screen design decision.** Any new
long-running operation added to the app in the future should use this pattern by default,
not invent its own. See `OPEN_ITEMS.md` for the phased rollout plan and which screens have
adopted it so far.

## 1. The shared surface

A persistent status region — a banner or card that stays visible in the flow, **not a modal
that blocks the screen**. It has exactly three states:

- **Working**
- **Done**
- **Failed**

All three states are styled identically across every operation that adopts this standard —
same component, same layout, same visual language. What differs between operations is only
the specific text and numbers shown inside it, never the shape of the thing itself.

## 2. Immediately after starting

Within the **first 200–300ms**, the user must see something change. Do not wait for real
progress data to arrive before showing anything — a greyed-out button alone is not enough; it
reads as "did my click even register?"

**Minimum**: the status region appears immediately in the Working state, with a generic
"Starting…" label and an indeterminate spinner, even before the app knows how many items
there are to process.

## 3. What to show over time

| Elapsed time | What the user should see |
|---|---|
| 0–5 seconds | Indeterminate spinner + "Starting…" — no numbers needed yet, just visible motion. |
| ~30 seconds | Should have transitioned to real numbers if at all possible — e.g. "Syncing… 340 of 6,290" or a percentage. If the total genuinely isn't knowable yet, switch at minimum to "Working — this may take a few minutes," so silence itself doesn't become the signal something's wrong. |
| 1 minute+ | Reassurance matters as much as data here — a small explanatory line like "Large syncs can take several minutes — you can close this and check back, or wait here" turns a scary silence into an expected, bounded wait. |
| Several minutes | Keep the count/percentage updating live if possible. If genuinely stuck — no change in 60+ seconds — that's the trigger for the app itself to show a "this is taking longer than expected" state, rather than making the user guess. |

## 4. Success state

Brief, positive, and specific — never just "Done!" Always real numbers: e.g. "0 new items
added, 6,290 uploaded, 0 updated." Success **auto-dismisses** after a few seconds or on the
next user interaction — it does not require a manual close.

## 5. Error state

The opposite of success in tone, but the same principle: specific, never generic. "Import
failed" alone is close to useless. Minimum bar for an error state:

- What step it was on when it failed
- How many items succeeded before the failure
- One plain-language next step (e.g. "3 of 12 items were saved before this happened — you
  can retry, already-saved items won't be duplicated")

Unlike success, errors **never auto-dismiss** — they require an explicit acknowledgment from
the user.

## 6. Indicator priority, ranked

When more than one indicator is available for a given operation, prefer them in this order —
higher-ranked indicators build more trust and should be favored when there's a choice:

1. **Item counts** ("340 of 6,290") — the single most trust-building signal, because it's
   concrete and falsifiable; a user can watch the number climb and knows it isn't fake.
2. **Current step** ("Uploading ingredients…" → "Uploading recipes…") — especially valuable
   for multi-stage operations, since it explains *why* it's taking a while, not just *that*
   it is.
3. **Progress bar** — good when a real total is known, but secondary to the count itself; a
   bar with no numbers is actually less trustworthy than numbers with no bar.
4. **Spinner** — necessary as a baseline "something is happening" signal, but weakest alone;
   only use it standalone during the first few seconds before real data is available.
5. **Estimated time remaining** — lowest priority, and actually risky to get wrong — a wildly
   inaccurate estimate erodes trust faster than no estimate at all. Only worth adding once
   the other four are solid.

## 7. How this applies per operation

**Cloud Sync** is the flagship implementation of this pattern, not a special case — it's the
operation most likely to run long (thousands of rows) and most likely to run unattended-ish
(someone clicks it and looks away). It already has good per-stage semantics internally
(uploading vs. pulling vs. updating), so it's well-suited to show **current step + item count
together**: "Uploading ingredients… 4,200 of 6,290."

**Backup Import** has the same risk profile as Cloud Sync — large, multi-table, currently
silent — and the existing atomic-transaction work already tracks per-store progress
internally, so adopting this standard here should mostly be surfacing existing data, not
building new tracking logic from scratch.

**JSON Import, Bulk Entry, and Starter Library loading** are shorter-lived and more
single-purpose than the two above. They should use a simpler version of the same visual
pattern — spinner + count, no need for multi-step "current step" language — but still the
*same component*, not a separate lighter-weight one.

## 8. What this standard does not cover

**Batching/bulk-vs-row-by-row performance is a separate concern, not part of this standard.**
Cloud Sync's current row-by-row push pattern (one request per item rather than a bulk
`.upsert()` call) is a real, tracked issue, but it's an orthogonal performance question —
fixing it changes how fast an operation completes; this standard changes how an operation
*communicates* while it's running, regardless of how fast it actually is. See `OPEN_ITEMS.md`
for the batching item, tracked independently.
