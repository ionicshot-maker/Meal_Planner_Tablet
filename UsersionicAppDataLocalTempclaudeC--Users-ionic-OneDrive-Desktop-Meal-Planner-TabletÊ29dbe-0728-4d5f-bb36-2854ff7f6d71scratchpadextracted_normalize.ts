const MIN_SANE_BOX_PCT = 2

export function normalizeDetectionResponse(boxes: CropBoxPercent[]): (CropBoxPercent | null)[] {
  // Step 1 — response-level scale normalization. Never trigger on topPct alone.
  const isInflated = boxes.some(b => b.leftPct > 100 || b.widthPct > 100 || b.heightPct > 100)
  const scaled = isInflated
    ? boxes.map(b => ({ leftPct: b.leftPct / 10, topPct: b.topPct / 10, widthPct: b.widthPct / 10, heightPct: b.heightPct / 10 }))
    : boxes

  // Step 2 (per box, geometric clamp) + Step 3 (per box, discard if unresolvable).
  return scaled.map((b): CropBoxPercent | null => {
    const { leftPct, topPct, widthPct, heightPct } = b
    if (![leftPct, topPct, widthPct, heightPct].every(Number.isFinite)) return null
    if (leftPct < 0 || topPct < 0 || widthPct <= 0 || heightPct <= 0) return null
    if (leftPct >= 100 || topPct >= 100) return null

    let width = widthPct
    let height = heightPct
    if (leftPct + width > 100) width = 100 - leftPct
    if (topPct + height > 100) height = 100 - topPct

    if (width < MIN_SANE_BOX_PCT || height < MIN_SANE_BOX_PCT) return null

    return { leftPct, topPct, widthPct: width, heightPct: height }
  })
}