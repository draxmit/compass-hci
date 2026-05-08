import type {
  ChatContext,
  ParsedTransactionFields,
  WorkerEnv,
} from './types';

/**
 * Multimodal Gemini endpoints — text-only NLP parsing and image OCR
 * extraction for transaction entry. Both return the same
 * `ParsedTransactionFields` shape so the app's entry form has a single
 * pre-fill path regardless of which input modality the user picked.
 *
 * Why a separate file from `gemini.ts`: chat is a stateful streaming-
 * style API with conversation history; parse / scan-receipt are pure
 * one-shot transforms with no history. Different prompts, different
 * generation configs, different failure modes — easier to reason
 * about side-by-side than threaded into the chat client.
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * JSON-mode response schema for both parse-text and scan-receipt.
 * Field names match the app's `ParsedTransactionFields`.
 */
const parseSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
    amountMinor: { type: 'number' },
    merchant: { type: 'string' },
    description: { type: 'string' },
    date: { type: 'string' },
    categoryId: { type: 'string' },
    accountId: { type: 'string' },
    toAccountId: { type: 'string' },
    confidence: { type: 'number' },
    // For scan-receipt only — Gemini may include the OCR'd text here
    // so the Worker can hoist it into the response without two calls.
    rawText: { type: 'string' },
  },
  required: ['confidence'],
};

const PARSE_TEXT_SYSTEM_PROMPT = `You are a transaction-entry parser for an Indonesian banking app.
Given a free-text description of a transaction (typed or dictated by the user),
extract the structured fields. The user's existing categories and accounts are
listed below — ALWAYS reference real ids from the snapshot, never invent ones.

Rules:
- Output amounts in MINOR UNITS (×100). E.g. "Rp 50.000" → amountMinor: 5000000.
- "rb" / "ribu" / "k" = thousands. "jt" / "juta" / "M" = millions.
- Indonesian thousands separator is "." not ",". "50.000" = 50,000 not 50.0.
- type: "expense" by default. "transfer" if the text mentions moving between accounts. "income" if it mentions salary / bonus / received.
- date: leave blank for "today" — caller fills in the current date.
- merchant: short, the place / brand / counterparty. Capitalised properly.
- description: cleaned-up summary of the user's text, suitable for a transaction note. Keep it concise.
- categoryId / accountId: pick the BEST match from the snapshot below. Use the bracketed id ([abc123]).
- confidence: 0.0 (no clue) to 1.0 (certain). Average of how confident you are about each populated field.
- If a field can't be inferred, OMIT it entirely (don't return null / "" / 0).

Today: {today}. User locale: {locale}.

Output JSON only.`;

const SCAN_RECEIPT_SYSTEM_PROMPT = `You are a receipt OCR + parser for an Indonesian banking app.
The image is a photo of a paper receipt (struk). Extract the transaction
details and return structured fields.

Rules:
- Output amounts in MINOR UNITS (×100). E.g. "Rp 50.000" → amountMinor: 5000000.
- Indonesian receipts use "." as thousands separator and "," as decimal: "50.000,00" = 50000.00 (50,000 IDR).
- type: always "expense" for receipts.
- amountMinor: the GRAND TOTAL on the receipt, NOT individual line items. Indonesian receipts label it "Total", "Grand Total", "Bayar", "Tunai", "Total Bayar".
- merchant: the business name, usually printed at the top.
- description: short summary like "Lunch at Warteg" or "Groceries". If the receipt has 1-3 distinct items, list them; if many, use a category word (e.g. "Belanja", "Makan").
- date: extract from the receipt if printed; format as 'YYYY-MM-DD'. If unclear, omit.
- categoryId: pick the BEST match from the snapshot below based on the merchant + items. Use the bracketed id.
- accountId: leave blank — receipts don't say which account.
- rawText: include the FULL OCR'd text from the receipt for the user's reference.
- confidence: 0.0 (illegible) to 1.0 (perfectly clear). Drop sharply if you're guessing the total.

Today: {today}. User locale: {locale}.

Output JSON only.`;

function buildContextBlock(ctx: ChatContext): string {
  const lines: string[] = [];
  lines.push(`# Available categories`);
  for (const c of ctx.categoryTotals90d) {
    lines.push(`- [${c.categoryId}] ${c.categoryName}`);
  }
  lines.push('');
  lines.push(`# Available accounts`);
  for (const a of ctx.accounts) {
    lines.push(`- [${a.id}] ${a.name} (${a.type}/${a.subtype})`);
  }
  return lines.join('\n');
}

function fillSystemPrompt(template: string, ctx: ChatContext): string {
  return template.replace('{today}', ctx.today).replace('{locale}', ctx.locale);
}

async function callGeminiJson(
  env: WorkerEnv,
  contents: unknown[],
): Promise<Record<string, unknown>> {
  const body = {
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: parseSchema,
    },
  };
  const url = `${GEMINI_URL}?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`gemini multimodal ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asParsedFields(raw: Record<string, unknown>): ParsedTransactionFields {
  const out: ParsedTransactionFields = {
    confidence:
      typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0,
  };
  if (raw.type === 'expense' || raw.type === 'income' || raw.type === 'transfer') {
    out.type = raw.type;
  }
  if (typeof raw.amountMinor === 'number' && raw.amountMinor > 0) {
    out.amountMinor = Math.round(raw.amountMinor);
  }
  if (typeof raw.merchant === 'string' && raw.merchant.trim()) {
    out.merchant = raw.merchant.trim();
  }
  if (typeof raw.description === 'string' && raw.description.trim()) {
    out.description = raw.description.trim();
  }
  if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    out.date = raw.date;
  }
  if (typeof raw.categoryId === 'string' && raw.categoryId.trim()) {
    out.categoryId = raw.categoryId.trim();
  }
  if (typeof raw.accountId === 'string' && raw.accountId.trim()) {
    out.accountId = raw.accountId.trim();
  }
  if (typeof raw.toAccountId === 'string' && raw.toAccountId.trim()) {
    out.toAccountId = raw.toAccountId.trim();
  }
  return out;
}

/**
 * Text-only NLP parsing. Faster and cheaper than multimodal — for
 * voice flows we keep using expo-speech-recognition for transcription
 * and only call Gemini to PARSE the resulting text.
 */
export async function parseText(
  env: WorkerEnv,
  text: string,
  context: ChatContext,
): Promise<ParsedTransactionFields> {
  const systemPrompt = fillSystemPrompt(PARSE_TEXT_SYSTEM_PROMPT, context);
  const ctxBlock = buildContextBlock(context);

  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPrompt }, { text: ctxBlock }],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood. Provide the user text.' }],
    },
    {
      role: 'user',
      parts: [{ text: `User input:\n${text}` }],
    },
  ];

  const raw = await callGeminiJson(env, contents);
  return asParsedFields(raw);
}

/**
 * Multimodal vision — parse a receipt image directly. Gemini does both
 * the OCR AND the field extraction in one shot, replacing the previous
 * ML Kit OCR + receipt regex parser pipeline.
 */
export async function scanReceipt(
  env: WorkerEnv,
  imageBase64: string,
  mimeType: string,
  context: ChatContext,
): Promise<{ parsed: ParsedTransactionFields; rawText: string }> {
  const systemPrompt = fillSystemPrompt(SCAN_RECEIPT_SYSTEM_PROMPT, context);
  const ctxBlock = buildContextBlock(context);

  const contents = [
    {
      role: 'user',
      parts: [
        { text: systemPrompt },
        { text: ctxBlock },
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: 'Extract the receipt details.' },
      ],
    },
  ];

  const raw = await callGeminiJson(env, contents);
  const parsed = asParsedFields(raw);
  const rawText = typeof raw.rawText === 'string' ? raw.rawText : '';
  return { parsed, rawText };
}
