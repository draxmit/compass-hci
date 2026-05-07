import Papa from 'papaparse';

/**
 * CSV-import helpers for the bank-statement import flow.
 *
 * Indonesian-bank CSVs vary widely (BCA / Mandiri / Jenius / etc.) but
 * usually have at least three columns: date, amount, description.
 * We don't attempt to special-case each bank — we parse generically
 * and let the user map columns in the UI.
 *
 * The parser:
 *   1. Reads the file via PapaParse (handles quoting, line endings,
 *      and BOM stripping).
 *   2. Sniffs delimiter automatically (banks use either , or ; or \t).
 *   3. Tries to find a header row — first non-empty row whose cells
 *      look like field names ("date" / "tanggal" / "amount" /
 *      "jumlah" / etc.). If none, indices are used as labels.
 *   4. Returns the parsed rows + a guess at which columns are
 *      date / amount / description.
 *
 * Final import logic (in the screen) walks each row, parses date
 * + amount per the chosen columns, and creates a transaction via
 * `createTransaction` with the user-picked account + default category.
 */

export type CsvParseResult = {
  /** Header labels — same length as each row. */
  headers: string[];
  /** Data rows; each is a string[] aligned with `headers`. */
  rows: string[][];
  /** Auto-detected best guess: column index for date / amount / description. -1 if no candidate. */
  guess: { dateCol: number; amountCol: number; descCol: number };
  /** Skipped rows that were empty / shorter than expected. */
  skipped: number;
};

const DATE_KEYWORDS = ['date', 'tanggal', 'tgl'];
const AMOUNT_KEYWORDS = ['amount', 'jumlah', 'mutasi', 'nominal', 'value', 'debit', 'credit'];
const DESC_KEYWORDS = ['description', 'keterangan', 'note', 'desc', 'narration', 'memo', 'remarks'];

function indexOfKeyword(headers: string[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const lower = (headers[i] ?? '').toString().trim().toLowerCase();
    if (keywords.some((k) => lower.includes(k))) return i;
  }
  return -1;
}

export function parseCsvText(text: string): CsvParseResult {
  // PapaParse with auto-delimiter detection. We don't pass `header: true`
  // because some Indonesian bank exports have a multi-row preamble
  // before the actual headers — easier to grab raw rows and find the
  // header ourselves.
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimiter: '',   // empty = auto-detect
  });

  const allRows: string[][] = (parsed.data || []).filter((r) => Array.isArray(r) && r.some((c) => String(c).trim().length > 0));

  if (allRows.length === 0) {
    return { headers: [], rows: [], guess: { dateCol: -1, amountCol: -1, descCol: -1 }, skipped: 0 };
  }

  // Find the row that's most likely the header: pick the first row
  // where AT LEAST one cell matches a known field-name keyword.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    const row = allRows[i] ?? [];
    const looksLikeHeader =
      indexOfKeyword(row, DATE_KEYWORDS) !== -1
      || indexOfKeyword(row, AMOUNT_KEYWORDS) !== -1
      || indexOfKeyword(row, DESC_KEYWORDS) !== -1;
    if (looksLikeHeader) {
      headerIdx = i;
      break;
    }
  }

  const headerRow = allRows[headerIdx] ?? [];
  const dataRows = allRows.slice(headerIdx + 1);
  const colCount = headerRow.length;

  // Filter out short rows (likely footer / running balance lines).
  const skippedBefore = dataRows.length;
  const goodRows = dataRows.filter((r) => r.length >= colCount - 1);
  const skipped = skippedBefore - goodRows.length;

  const headers = headerRow.map((h, i) => (h && String(h).trim()) || `Col ${i + 1}`);
  const guess = {
    dateCol: indexOfKeyword(headerRow, DATE_KEYWORDS),
    amountCol: indexOfKeyword(headerRow, AMOUNT_KEYWORDS),
    descCol: indexOfKeyword(headerRow, DESC_KEYWORDS),
  };

  return { headers, rows: goodRows, guess, skipped };
}

/**
 * Try to parse a date string in any of the common Indonesian-bank
 * formats. Returns 'YYYY-MM-DD' on success, null on fail.
 */
export function parseImportDate(s: string): string | null {
  const raw = s.trim();
  if (!raw) return null;

  // ISO YYYY-MM-DD or YYYY/MM/DD
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY (Indonesian default)
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  // DD-MMM-YYYY (e.g. 03-Mei-2026 or 03-May-2026)
  m = /^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})$/.exec(raw);
  if (m) {
    const [, d, monStr, y] = m;
    const mon = monthFromName(monStr!);
    if (mon !== null) {
      return `${y}-${String(mon).padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }
  }
  return null;
}

const ID_MONTHS = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
];
const EN_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const SHORT_MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'mei', 'may', 'jun',
  'jul', 'agu', 'aug', 'sep', 'okt', 'oct', 'nov', 'des', 'dec',
];
const SHORT_TO_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6,
  jul: 7, agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

function monthFromName(s: string): number | null {
  const lower = s.toLowerCase();
  let idx = ID_MONTHS.indexOf(lower);
  if (idx !== -1) return idx + 1;
  idx = EN_MONTHS.indexOf(lower);
  if (idx !== -1) return idx + 1;
  if (lower in SHORT_TO_NUM) return SHORT_TO_NUM[lower] ?? null;
  // SHORT_MONTHS lookup as last resort (some odd locales)
  idx = SHORT_MONTHS.indexOf(lower);
  if (idx !== -1) return SHORT_TO_NUM[lower] ?? null;
  return null;
}

/**
 * Parse an amount string, handling Indonesian (1.234.567,89) and
 * English (1,234,567.89) conventions. Returns integer minor units
 * (×100) on success, null on fail. Negative amounts retain their
 * sign — caller decides whether to interpret sign as expense vs
 * income.
 */
export function parseImportAmount(s: string): number | null {
  let raw = s.trim();
  if (!raw) return null;

  // Strip currency symbols + spaces.
  raw = raw.replace(/[Rp$€£¥\s]/gi, '');

  // Handle parens-as-negative ("1.234,56)" → -1234.56)
  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }
  if (raw.startsWith('-')) {
    negative = true;
    raw = raw.slice(1);
  }
  if (raw.startsWith('+')) {
    raw = raw.slice(1);
  }

  // Decide which separator is the decimal: the LAST non-digit
  // character is treated as decimal if it's followed by 1-2 digits.
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot !== -1) {
    // Single dot — decimal only if followed by ≤ 2 digits AND there are
    // no other dots before (otherwise Indonesian thousands).
    const after = raw.length - lastDot - 1;
    if (after <= 2 && raw.indexOf('.') === lastDot) decimalSep = '.';
  } else if (lastComma !== -1) {
    const after = raw.length - lastComma - 1;
    if (after <= 2 && raw.indexOf(',') === lastComma) decimalSep = ',';
  }

  let cleaned: string;
  if (decimalSep === '.') {
    // Strip all commas (thousand separators), keep dot as decimal.
    cleaned = raw.replace(/,/g, '');
  } else if (decimalSep === ',') {
    // Strip all dots (thousand separators), convert comma to dot.
    cleaned = raw.replace(/\./g, '').replace(',', '.');
  } else {
    // No decimal — strip all separators (assume thousands)
    cleaned = raw.replace(/[.,]/g, '');
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  const minor = Math.round(value * 100);
  return negative ? -minor : minor;
}
