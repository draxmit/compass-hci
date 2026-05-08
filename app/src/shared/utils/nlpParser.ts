import type {
  Account, Category, TransactionType,
} from '@compass/shared-types';

import { parseLooseAmount } from '@/shared/utils/amountInput';

/**
 * Parsed transaction from a free-text input. All fields can be null/empty
 * if the parser couldn't infer them — the UI shows the form pre-populated
 * with whatever WAS inferred and lets the user fill the rest.
 *
 * Ported + extended from `legacy/src/lib/nlp-parser.ts` (Vite prototype).
 * Significant changes vs. legacy:
 *   - Returns Firestore IDs from the user's actual categories/accounts,
 *     not enum strings.
 *   - Indonesian-first vocabulary expanded for T4's preset set (Warteg,
 *     BPJS, Pulsa, KRL, etc.) plus colloquial slang (nongki, nge-grab).
 *   - Type detection (expense / income / transfer) added.
 *   - Returns minor units (×100) per ADR-06's storage rule.
 */
export type NlpResult = {
  type: TransactionType;
  typeConfidence: number;
  amount: number | null;          // integer minor units
  amountConfidence: number;
  date: string;                   // YYYY-MM-DD; defaults to today
  accountId: string | null;
  accountConfidence: number;
  toAccountId: string | null;     // transfer only
  toAccountConfidence: number;
  categoryId: string | null;
  categoryConfidence: number;
  description: string;
  confidence: number;             // overall, 0..1
};

export type ParseContext = {
  categories: Category[];   // current workspace's non-archived categories
  accounts: Account[];      // current workspace's non-archived accounts
  today?: string;           // YYYY-MM-DD; defaults to local-tz today
};

/**
 * Indonesian-first keyword map: which preset *category-key* each phrase
 * suggests. Keys here match the preset `name.id` (lowercased) for direct
 * lookup against user categories. Custom user categories don't appear
 * here — they're matched separately via direct name-substring search.
 *
 * Maintenance note: when T4's preset list changes, update this map too.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Makanan & Minuman / children
  'warteg':         ['warteg', 'warung tegal', 'nasi padang', 'padang'],
  'restoran':       ['restoran', 'resto', 'sushi', 'pizza', 'mcd', 'kfc', 'starbucks', 'dinner', 'lunch', 'makan siang', 'makan malam'],
  'cafe':           ['cafe', 'coffee', 'kopi', 'kopi kenangan', 'fore', 'tomoro', 'janji jiwa', 'nongki'],
  'belanja dapur':  ['groceries', 'belanja dapur', 'sayur', 'pasar', 'superindo', 'transmart', 'hypermart'],
  'delivery':       ['gofood', 'grabfood', 'shopeefood', 'delivery', 'pesan antar'],
  'jajan':          ['jajan', 'snack', 'cilok', 'cireng', 'martabak', 'siomay', 'es teh'],
  'makanan & minuman': ['makan', 'minum', 'food'],

  // Transportasi
  'grab':           ['grab', 'grabbike', 'grabcar', 'nge-grab', 'ngegrab'],
  'gojek':          ['gojek', 'goride', 'gocar', 'goride'],
  'bbm':            ['bbm', 'bensin', 'pertamax', 'pertalite', 'shell', 'isi bensin'],
  'parkir':         ['parkir'],
  'krl/mrt':        ['krl', 'mrt', 'transjakarta', 'lrt', 'commuter', 'kereta'],
  'tol':            ['tol', 'e-toll'],
  'transportasi':   ['ojek', 'taxi', 'transport'],

  // Tagihan
  'listrik':        ['listrik', 'pln', 'token listrik'],
  'air':            ['air', 'pdam'],
  'internet':       ['internet', 'wifi', 'indihome', 'biznet', 'first media', 'iconnet'],
  'pulsa':          ['pulsa', 'paket data', 'top up data', 'kuota'],
  'streaming':      ['netflix', 'spotify', 'youtube premium', 'disney+', 'vidio', 'iqiyi', 'streaming', 'langganan'],
  'bpjs':           ['bpjs', 'kesehatan', 'jkn'],
  'tagihan':        ['tagihan', 'bayar tagihan'],

  // Belanja
  'pakaian':        ['pakaian', 'baju', 'celana', 'sepatu', 'uniqlo', 'h&m', 'zara'],
  'elektronik':     ['elektronik', 'gadget', 'hp', 'laptop', 'tokopedia', 'shopee', 'lazada'],
  'rumah tangga':   ['rumah tangga', 'ace hardware', 'ikea', 'informa'],
  'skincare':       ['skincare', 'kosmetik', 'somethinc', 'wardah', 'sociolla'],
  'belanja':        ['belanja', 'mall', 'toko'],

  // Hiburan
  'bioskop':        ['bioskop', 'cgv', 'xxi', 'cinepolis', 'nonton'],
  'konser':         ['konser', 'concert', 'tiket konser'],
  'game':           ['game', 'steam', 'playstation', 'mobile legend', 'genshin'],
  'liburan':        ['liburan', 'travel', 'hotel', 'tiket pesawat', 'traveloka', 'tiket.com'],
  'hiburan':        ['hiburan', 'fun'],

  // Kesehatan
  'dokter':         ['dokter', 'klinik', 'rs', 'rumah sakit', 'halodoc', 'alodokter'],
  'obat':           ['obat', 'apotik', 'apotek', 'kimia farma', 'guardian', 'watson'],
  'olahraga':       ['olahraga', 'gym', 'fitness', 'yoga', 'pilates'],
  'kesehatan':      ['kesehatan', 'health'],

  // Pendidikan
  'buku':           ['buku', 'gramedia', 'periplus'],
  'kursus':         ['kursus', 'course', 'udemy', 'coursera', 'skillacademy'],
  'sekolah':        ['sekolah', 'spp', 'uang sekolah'],
  'pendidikan':     ['pendidikan', 'education'],

  // Pemasukan
  'gaji':           ['gaji', 'salary', 'payroll'],
  'bonus':          ['bonus', 'thr'],
  'freelance':      ['freelance', 'project', 'klien'],
  'hadiah':         ['hadiah', 'gift', 'angpao', 'angpau'],
  'pemasukan':      ['pemasukan', 'income', 'masuk', 'terima'],

  // Investasi
  'saham':          ['saham', 'stocks', 'bibit', 'stockbit', 'ajaib'],
  'reksa dana':     ['reksa dana', 'reksadana', 'mutual fund'],
  'emas':           ['emas', 'gold', 'antam', 'pegadaian'],
  'investasi':      ['investasi', 'invest'],
};

/**
 * Account-subtype keyword hints. Maps each subtype key to phrases that
 * suggest that account. The parser scans for these in the input and picks
 * the user's account whose subtype matches OR whose name contains the
 * keyword.
 */
const ACCOUNT_KEYWORDS: Record<string, string[]> = {
  cash: ['tunai', 'cash'],
  bca: ['bca'],
  mandiri: ['mandiri'],
  bri: ['bri'],
  bni: ['bni'],
  cimb: ['cimb', 'cimb niaga'],
  permata: ['permata'],
  danamon: ['danamon'],
  btn: ['btn'],
  bsi: ['bsi'],
  jago: ['jago'],
  jenius: ['jenius'],
  blu: ['blu'],
  seabank: ['seabank'],
  gopay: ['gopay'],
  ovo: ['ovo'],
  dana: ['dana'],
  shopeepay: ['shopeepay', 'shopee pay'],
  linkaja: ['linkaja', 'link aja'],
  doku: ['doku'],
  visa: ['visa'],
  mastercard: ['mastercard', 'master card'],
  jcb: ['jcb'],
  amex: ['amex', 'american express'],
};

const INCOME_KEYWORDS = ['gaji', 'salary', 'bonus', 'freelance', 'thr', 'hadiah', 'angpao', 'angpau', 'masuk', 'terima', 'topup', 'top up'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'tarik tunai', 'tarik', 'setor'];

// Match numeric amounts with arbitrary separator counts so Indonesian
// thousand-formatted output ('50.000', '1.500.000') isn't truncated to
// the first separator group. The greedy `\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?`
// pattern picks up:
//   - '50'         (bare integer)
//   - '50.000'     (one thousands separator)
//   - '1.500.000'  (multiple thousands separators)
//   - '50,5' / '50.5' (decimal — \d{1,2} after sep)
//   - '25.000,50'  (Indonesian thousands + decimal)
// Followed by an optional Indonesian / English magnitude suffix.
const AMOUNT_RE = /(\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(rb|ribu|k|jt|juta|m)?\b/i;

export function parseTransaction(raw: string, ctx: ParseContext): NlpResult {
  const lower = raw.toLowerCase();
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);

  // ---- Amount ----
  let amount: number | null = null;
  let amountConfidence = 0;
  const amountMatch = AMOUNT_RE.exec(lower);
  if (amountMatch) {
    const numText = amountMatch[1] ?? '';
    const suffix = (amountMatch[2] ?? '').toLowerCase();
    // parseLooseAmount disambiguates Indonesian (1.500.000,00) vs
    // English (1,500,000.00) vs unseparated (1500000) by looking at
    // the LAST separator's right-hand side: 3 digits → thousands;
    // 1-2 digits → decimal. Voice transcripts on id-ID overwhelmingly
    // emit the Indonesian form (50.000 = 50,000), which the previous
    // parseFloat-with-replace logic was reading as 50.0.
    const n = parseLooseAmount(numText);
    if (Number.isFinite(n)) {
      let multiplier: number;
      if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') multiplier = 1000;
      else if (suffix === 'jt' || suffix === 'juta' || suffix === 'm') multiplier = 1_000_000;
      else multiplier = 1;
      // Convert to minor units (×100) for ADR-06 storage.
      amount = Math.round(n * multiplier * 100);
      amountConfidence = 0.95;
    }
  }

  // ---- Type ----
  let type: TransactionType = 'expense';
  let typeConfidence = 0.7;
  if (TRANSFER_KEYWORDS.some((k) => lower.includes(k))) {
    type = 'transfer';
    typeConfidence = 0.95;
  } else if (INCOME_KEYWORDS.some((k) => lower.includes(k))) {
    type = 'income';
    typeConfidence = 0.95;
  }

  // ---- Category ----
  let categoryId: string | null = null;
  let categoryConfidence = 0;
  // Transfers don't have a category; skip matching entirely.
  if (type !== 'transfer') {
    categoryId = matchCategoryByKeyword(lower, ctx.categories);
    if (categoryId) {
      categoryConfidence = 0.85;
    } else {
      // Fallback: direct substring match on category name in the active locale.
      categoryId = matchCategoryByName(lower, ctx.categories);
      if (categoryId) categoryConfidence = 0.95;
    }
  }

  // ---- Account ----
  // For expense/income: the account that pays. For transfer: the from-account.
  let accountId: string | null = null;
  let accountConfidence = 0;
  let toAccountId: string | null = null;
  let toAccountConfidence = 0;

  const accountMatches = matchAccountsByKeyword(lower, ctx.accounts);
  if (type === 'transfer') {
    // Transfer convention: first match = from, second = to.
    if (accountMatches[0]) {
      accountId = accountMatches[0];
      accountConfidence = 0.95;
    }
    if (accountMatches[1]) {
      toAccountId = accountMatches[1];
      toAccountConfidence = 0.95;
    }
  } else if (accountMatches[0]) {
    accountId = accountMatches[0];
    accountConfidence = 0.95;
  }

  // ---- Description ----
  // Strip amount tokens to leave a cleaner human-readable description.
  const description = raw
    .replace(/\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|m)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // ---- Overall confidence ----
  // Mean of the 4 component confidences, weighted equally.
  const components: number[] = [amountConfidence, categoryConfidence, accountConfidence, typeConfidence];
  // For transfers, replace categoryConfidence with toAccountConfidence in the average
  // (a transfer with no to-account is incomplete; with one, it's well-formed).
  if (type === 'transfer') components[1] = toAccountConfidence;
  const overall = components.reduce((s, c) => s + c, 0) / components.length;

  return {
    type,
    typeConfidence,
    amount,
    amountConfidence,
    date: today,
    accountId,
    accountConfidence,
    toAccountId,
    toAccountConfidence,
    categoryId,
    categoryConfidence,
    description: description || raw,
    confidence: overall,
  };
}

/**
 * Try to match a category by scanning the keyword map. Returns the first
 * user category whose `name.id` (lowercased) matches a key whose keyword
 * list contains the input substring.
 */
function matchCategoryByKeyword(lower: string, categories: Category[]): string | null {
  for (const [key, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!kws.some((k) => lower.includes(k))) continue;
    const cat = categories.find((c) => c.name.id.toLowerCase() === key);
    if (cat) return cat.id;
  }
  return null;
}

/**
 * Fallback: direct substring match against each category's name (id or en),
 * lowercased. Catches custom categories the user named themselves.
 */
function matchCategoryByName(lower: string, categories: Category[]): string | null {
  for (const cat of categories) {
    const idName = cat.name.id.toLowerCase();
    const enName = cat.name.en.toLowerCase();
    if (lower.includes(idName) || lower.includes(enName)) return cat.id;
  }
  return null;
}

/**
 * Match accounts by scanning the subtype-keyword map AND by direct substring
 * match against each account's `name`. Returns matched account ids in input
 * order — for transfers we use the first two.
 */
function matchAccountsByKeyword(lower: string, accounts: Account[]): string[] {
  const matched: string[] = [];
  // Pass 1: subtype keyword match (more reliable than free-text name match).
  for (const [subtype, kws] of Object.entries(ACCOUNT_KEYWORDS)) {
    if (!kws.some((k) => lower.includes(k))) continue;
    const acct = accounts.find((a) => a.subtype === subtype && !matched.includes(a.id));
    if (acct) matched.push(acct.id);
  }
  // Pass 2: direct name match for accounts not yet matched (catches custom
  // names like "BCA Tahapan" → already matched by subtype pass; here we
  // catch unique custom names like "Dompet Lebaran").
  for (const acct of accounts) {
    if (matched.includes(acct.id)) continue;
    const name = acct.name.toLowerCase();
    if (name && lower.includes(name)) matched.push(acct.id);
  }
  return matched;
}
