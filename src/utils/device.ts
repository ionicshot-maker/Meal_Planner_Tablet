/** True on touch-primary devices (phones/tablets) — used to skip autoFocus
 *  on the first field of full-screen editors, since autofocusing there
 *  immediately summons the on-screen keyboard and eats a third of the
 *  screen before the user has even seen the form. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}
