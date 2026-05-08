import type {
  ChatContext,
  ChatMessage,
  SuggestedAction,
  WorkerEnv,
} from './types';

/**
 * Gemini 2.0 Flash client. Uses JSON mode so the response strictly
 * conforms to our `{ content, actions[] }` schema — no parsing
 * gymnastics for free-form text replies.
 *
 * Free tier limits (as of 2026-05): 15 RPM, 1M tokens/day input on
 * generativelanguage.googleapis.com — plenty for a class-demo app.
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are Compass, a personal financial assistant for Indonesian users.
You have READ-ONLY access to the user's financial data via the snapshot below.
Respond in the user's locale (id = Bahasa Indonesia, en = English) and match their tone.

Rules:
- ALWAYS reference specific numbers from the snapshot. Never invent data.
- For amounts in Indonesian context, use "Rp 50.000" formatting (period as thousands separator).
- Keep replies concise — 2-3 sentences for simple Q&A. Longer only when explicitly asked.
- When you spot a budgeting opportunity, populate the actions[] array. Don't restate the action in prose.
- Action types you may emit:
  * createBudget: { categoryId, amountMinor } — propose a monthly limit for an EXISTING category
  * viewTransactions: { filter: { categoryId?, dateRange? } } — link to a filtered tx list
  * navigate: { target } — link to a specific app screen (use sparingly)
- amountMinor is in IDR×100 minor units (e.g. Rp 500.000 = 50000000).
- Only suggest categoryIds that appear in the snapshot below.
- Today is {today}. The user's locale is {locale}.

Output JSON only, in this exact shape:
{ "content": "<your text reply>", "actions": [<0 or more SuggestedAction objects>] }`;

const responseSchema = {
  type: 'object',
  properties: {
    content: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['createBudget', 'viewTransactions', 'navigate'],
          },
          label: { type: 'string' },
          categoryId: { type: 'string' },
          amountMinor: { type: 'number' },
          filter: {
            type: 'object',
            properties: {
              categoryId: { type: 'string' },
              dateRange: {
                type: 'string',
                enum: ['thisMonth', 'lastMonth', 'last7d', 'last30d'],
              },
            },
          },
          target: { type: 'string' },
        },
        required: ['type', 'label'],
      },
    },
  },
  required: ['content', 'actions'],
};

function buildSystemPrompt(ctx: ChatContext): string {
  return SYSTEM_PROMPT.replace('{today}', ctx.today).replace('{locale}', ctx.locale);
}

/** Render the user data snapshot as a structured context block. */
function buildContextBlock(ctx: ChatContext): string {
  const lines: string[] = [];
  lines.push(`# User snapshot (${ctx.today})`);
  lines.push(`Total balance (IDR-equivalent, major units): ${ctx.totalBalanceMinor / 100}`);
  lines.push('');
  lines.push('## Accounts');
  for (const a of ctx.accounts) {
    lines.push(
      `- [${a.id}] ${a.name} (${a.type}/${a.subtype}, ${a.currency}): ${a.balanceMinor / 100}`,
    );
  }
  lines.push('');
  lines.push('## Active budgets (this month)');
  if (ctx.budgets.length === 0) lines.push('(none)');
  for (const b of ctx.budgets) {
    lines.push(
      `- [${b.categoryId}] ${b.categoryName}: ${b.spentMinor / 100} of ${b.limitMinor / 100}`,
    );
  }
  lines.push('');
  lines.push('## Goals');
  if (ctx.goals.length === 0) lines.push('(none)');
  for (const g of ctx.goals) {
    lines.push(
      `- [${g.id}] ${g.name}${g.isPinned ? ' (pinned)' : ''}: ${g.currentMinor / 100} of ${g.targetMinor / 100}` +
        (g.targetDate ? ` by ${g.targetDate}` : ''),
    );
  }
  lines.push('');
  lines.push('## Category totals (last 90 days, expense)');
  for (const c of ctx.categoryTotals90d) {
    lines.push(
      `- [${c.categoryId}] ${c.categoryName}: ${c.totalSpentMinor / 100} (${c.count} txs)`,
    );
  }
  lines.push('');
  lines.push('## Recent transactions (last 90 days)');
  for (const t of ctx.transactions) {
    const tagPart = t.tags.length ? ` | tags: ${t.tags.join(',')}` : '';
    lines.push(
      `- ${t.date} | ${t.type} | ${t.amountMinor / 100} ${t.currency} | ` +
        `${t.categoryName ?? '(uncategorized)'} | ${t.accountName} | ${t.description}${tagPart}`,
    );
  }
  return lines.join('\n');
}

export async function callGemini(
  env: WorkerEnv,
  history: ChatMessage[],
  userMessage: string,
  context: ChatContext,
): Promise<{ content: string; actions: SuggestedAction[] }> {
  const systemPrompt = buildSystemPrompt(context);
  const contextBlock = buildContextBlock(context);

  // Gemini uses 'user' / 'model' roles; map our 'assistant' to 'model'.
  // The system prompt + context go in as the first user turn, with a
  // canned model ack. This keeps the schema simple and lets Gemini
  // continue from the most recent user message.
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPrompt }, { text: contextBlock }],
    },
    {
      role: 'model',
      parts: [
        {
          text: 'Understood. I have your snapshot loaded and will respond in JSON.',
        },
      ],
    },
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  const body = {
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema,
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
    throw new Error(`gemini api ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: { content?: string; actions?: SuggestedAction[] };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // Gemini occasionally returns plain text despite JSON mode. Treat
    // as a content-only reply with no actions.
    return { content: text, actions: [] };
  }
  return {
    content: parsed.content ?? '',
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}
