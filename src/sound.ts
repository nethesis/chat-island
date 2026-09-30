let ctx: AudioContext | undefined

/** A short two-note chime made on the fly: nothing to ship, quiet enough for an office. */
export function chime() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    for (const [freq, at, len] of [
      [880, 0, 0.09],
      [1174.7, 0.1, 0.16],
    ] as const) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t + at)
      g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len)
      o.connect(g).connect(ctx.destination)
      o.start(t + at)
      o.stop(t + at + len + 0.02)
    }
  } catch {
    /* no audio output here */
  }
}
