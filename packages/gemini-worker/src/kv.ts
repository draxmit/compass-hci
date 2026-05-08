import type { ChatMessage, WorkerEnv } from './types';

/**
 * Per-user chat history operations against the Cloudflare KV namespace
 * `compass-gemini-history`. Cap at 10 turns to keep:
 *   - token cost predictable (history × ~500 tokens = 5k of context)
 *   - free-tier KV writes within budget (1k writes/day = 100 chats/day)
 *
 * Eventually-consistent KV semantics are fine here — chat is single-
 * device single-session in practice, and a millisecond-level read-
 * after-write race wouldn't be visible to the user.
 */

const HISTORY_TTL_S = 60 * 60 * 24 * 30; // 30 days
const MAX_TURNS = 10;

function key(uid: string): string {
  return `chat:${uid}`;
}

export async function getHistory(
  env: WorkerEnv,
  uid: string,
): Promise<ChatMessage[]> {
  const raw = await env.HISTORY.get(key(uid));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive shape check — discard any malformed entries rather
    // than throwing (we'd rather lose history than break the chat).
    return (parsed as ChatMessage[])
      .filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string',
      )
      .slice(-MAX_TURNS);
  } catch {
    return [];
  }
}

export async function appendHistory(
  env: WorkerEnv,
  uid: string,
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const existing = await getHistory(env, uid);
  const updated = [...existing, ...messages].slice(-MAX_TURNS);
  await env.HISTORY.put(key(uid), JSON.stringify(updated), {
    expirationTtl: HISTORY_TTL_S,
  });
  return updated;
}

export async function clearHistory(
  env: WorkerEnv,
  uid: string,
): Promise<void> {
  await env.HISTORY.delete(key(uid));
}
