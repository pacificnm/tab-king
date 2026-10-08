/** Max-abs envelope over `buckets` equal slices of `data` (0–1 for normalised audio). */
export function computePeaks(data: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets)
  if (data.length === 0 || buckets <= 0) return out
  const size = data.length / buckets
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size)
    const to = Math.min(data.length, Math.max(from + 1, Math.floor((b + 1) * size)))
    let peak = 0
    for (let i = from; i < to; i++) {
      const v = Math.abs(data[i]!)
      if (v > peak) peak = v
    }
    out[b] = peak
  }
  return out
}
