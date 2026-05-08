/**
 * Receipt-OCR text parser. Takes the raw text ML Kit returns from a
 * receipt photo and extracts:
 *
 *   - amount  — best-guess total. Heuristic: scan for IDR-style numbers
 *               (with `Rp` prefix, or thousand separators), prefer the
 *               LARGEST number on the receipt (which is almost always
 *               the total — line items are smaller).
 *   - merchant — first non-empty line that isn't all numbers/symbols.
 *               Receipts almost universally print the merchant name at
 *               the top.
 *
 * Pure function, no side effects, fully unit-testable. Returns null
 * fields when the receipt didn't contain a parseable signal — caller
 * leaves those fields blank instead of inventing values.
 */

import { parseLooseAmount } from '@/shared/utils/amountInput';

export type ParsedReceipt = {
  /** Amount in minor units (×100), or null if no amount found. */
  amountMinor: number | null;
  /** Merchant name from the first usable line, or null. */
  merchant: string | null;
  /** The full OCR'd text — useful for debugging / fallback display. */
  rawText: string;
};

/**
 * Parse OCR'd receipt text into structured fields.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return {
    amountMinor: extractAmount(lines, rawText),
    merchant: extractMerchant(lines),
    rawText,
  };
}

/**
 * IDR amount detection. Scans the entire text for number-like
 * substrings (with optional `Rp`, optional thousand separators of
 * `.` or `,`, optional decimals), then picks the LARGEST. Receipts
 * place line items above and the total at the bottom — but order
 * isn't reliable enough; magnitude is.
 *
 * Filters out absurdly small numbers (< 100 IDR — nothing real costs
 * less than that) and absurdly large (> 1,000,000,000 — typo in OCR).
 */
function extractAmount(lines: string[], rawText: string): number | null {
  // Match patterns like:  Rp 25.000  Rp25,000  25.000  25000  Rp 2.500.000,00
  const regex = /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{4,})/gi;

  const candidates: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rawText)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    // parseLooseAmount handles both Indonesian (2.500.000,00) and
    // English (2,500,000.00) conventions: the last separator's right-
    // hand side decides — 1-2 digits = decimal, 3 digits = thousands.
    const major = parseLooseAmount(raw);
    if (Number.isNaN(major)) continue;
    if (major < 100 || major > 1_000_000_000) continue;
    candidates.push(major);
  }

  if (candidates.length === 0) return null;
  // Prefer the largest — totals are larger than any single line item.
  const max = Math.max(...candidates);
  return Math.round(max * 100); // → minor units
}

/**
 * First non-empty line that isn't a number-only sequence — receipts
 * print the merchant name at the top of the page. Caps at 60 chars
 * so we don't accidentally swallow the address line.
 */
function extractMerchant(lines: string[]): string | null {
  for (const line of lines) {
    // Skip lines that are all digits / punctuation
    if (!/[a-zA-Z]/.test(line)) continue;
    // Skip very short lines (often single-letter section dividers)
    if (line.length < 3) continue;
    // Cap at 60 chars
    return line.slice(0, 60);
  }
  return null;
}
