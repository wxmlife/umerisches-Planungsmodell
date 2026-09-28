// Frozen pre-DSL reference, kept only in tests so analytic regressions do not
// compare the new runtime to its own compatibility wrapper.
export function legacyUniformWinProbability(attacker: number, defender: number, min: number, max: number): number {
  if (defender <= 0) return attacker > 0 ? 1 : 0
  const ratio = attacker / defender
  if (!(ratio > 0) || !(max > min)) return 0
  const width = max - min
  const lo = Math.max(min, min / ratio)
  const hi = Math.min(max, max / ratio)
  const linear = hi > lo ? (0.5 * ratio * (hi ** 2 - lo ** 2) - min * (hi - lo)) / width : 0
  const full = Math.max(0, max - Math.max(min, max / ratio))
  return Math.min(1, Math.max(0, (linear + full) / width))
}
