/**
 * Banking-app-style balance privacy mask.
 *
 * When the user has flipped `users.balancesHidden` on, large balance
 * displays should hide both digits AND magnitude behind a fixed-length
 * dot run — same UX pattern as BCA, Jenius, Mandiri Livin', Stripe
 * Dashboard, etc. Showing the same digit count would still leak
 * 'is this user broke or rich' (Rp 100 vs Rp 100,000,000); a fixed
 * length removes that signal too.
 *
 * Implementation: replace any run of digits + thousands/decimal
 * separators with a constant 6-bullet string. Currency prefix
 * ('Rp ', '$', etc.) and trailing labels are preserved so the
 * shape still reads as 'an amount goes here'.
 *
 * Per-transaction amounts intentionally stay visible — that matches
 * the convention banking apps use; the privacy concern is the
 * shoulder-surfeable big number, not the per-row entry.
 */

const MASK_BULLETS = '••••••';

/**
 * Mask any numeric run in `formatted` with a fixed-length bullet
 * string when `hidden` is true. Returns the formatted string
 * unchanged when `hidden` is false.
 *
 * @example
 *   maskAmount('Rp 85,491,000', true)   // 'Rp ••••••'
 *   maskAmount('Rp 0', true)            // 'Rp ••••••'
 *   maskAmount('$ 2,150', true)         // '$ ••••••'
 *   maskAmount('↑ Rp 200,000 more', true) // '↑ Rp •••••• more'
 */
export function maskAmount(formatted: string, hidden: boolean): string {
  if (!hidden) return formatted;
  return formatted.replace(/\d[\d.,]*/g, MASK_BULLETS);
}
