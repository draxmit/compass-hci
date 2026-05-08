/**
 * Banking-app-style balance privacy mask.
 *
 * When the user has flipped `users.balancesHidden` on, large balance
 * displays should hide their digits behind dots — same UX pattern as
 * BCA, Jenius, Mandiri Livin', Stripe Dashboard, etc. The user can
 * use the app in public without exposing their balance, and tap the
 * eye icon to reveal again.
 *
 * Implementation: replace runs of digit characters with the same
 * number of bullets (•). Currency prefix, group separators, and
 * decimal separator are preserved so the masked string still reads
 * as a number-shaped placeholder ("Rp •••.•••.•••" for IDR).
 *
 * Per-transaction amounts intentionally stay visible — that matches
 * the convention banking apps use; the privacy concern is the
 * shoulder-surfeable big number, not the per-row entry.
 */

/**
 * Mask any digits in `formatted` with bullets when `hidden` is true.
 * Returns the formatted string unchanged when `hidden` is false.
 */
export function maskAmount(formatted: string, hidden: boolean): string {
  if (!hidden) return formatted;
  return formatted.replace(/\d/g, '•');
}
