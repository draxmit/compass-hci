import { verifyFirebaseToken } from './auth';
import { callGemini } from './gemini';
import { appendHistory, clearHistory, getHistory } from './kv';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  SuggestedAction,
  WorkerEnv,
} from './types';

/**
 * Compass Gemini Worker.
 *
 * Routes:
 *   GET  /health             — liveness probe (no auth)
 *   POST /chat               — main chat endpoint
 *   GET  /history            — fetch saved conversation
 *   DELETE /history          — clear saved conversation
 *
 * All non-/health routes require:
 *   Authorization: Bearer <firebase-id-token>
 *
 * The Worker has no Firestore credentials. Each /chat call must include
 * a fresh `ChatContext` snapshot built client-side; Worker forwards
 * that to Gemini in the system prompt.
 */

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...CORS_HEADERS,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
  });
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    // Health check — no auth required so Cloudflare's edge can probe
    // without holding a Firebase session.
    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'compass-gemini' });
    }

    // Everything else requires a valid Firebase ID token.
    const auth = req.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (!match) {
      return jsonResponse({ error: 'missing-bearer-token' }, { status: 401 });
    }

    let uid: string;
    try {
      const verified = await verifyFirebaseToken(match[1], env.FIREBASE_PROJECT_ID);
      uid = verified.uid;
    } catch (err) {
      return jsonResponse(
        {
          error: 'invalid-token',
          message: err instanceof Error ? err.message : 'unknown',
        },
        { status: 401 },
      );
    }

    if (url.pathname === '/history' && req.method === 'GET') {
      const history = await getHistory(env, uid);
      return jsonResponse({ history });
    }

    if (url.pathname === '/history' && req.method === 'DELETE') {
      await clearHistory(env, uid);
      return jsonResponse({ ok: true });
    }

    if (url.pathname === '/chat' && req.method === 'POST') {
      let body: ChatRequest;
      try {
        body = (await req.json()) as ChatRequest;
      } catch {
        return jsonResponse({ error: 'invalid-json' }, { status: 400 });
      }
      if (!body?.userMessage || !body?.context) {
        return jsonResponse({ error: 'missing-fields' }, { status: 400 });
      }
      // Reject suspiciously oversized contexts. 90 days of dense
      // transactions for an Indonesian retail user tops out around
      // 10-20k characters serialised; 200kb is generous.
      if (JSON.stringify(body).length > 200_000) {
        return jsonResponse({ error: 'context-too-large' }, { status: 413 });
      }

      const history = await getHistory(env, uid);

      let result: { content: string; actions: SuggestedAction[] };
      try {
        result = await callGemini(env, history, body.userMessage, body.context);
      } catch (err) {
        return jsonResponse(
          {
            error: 'gemini-failed',
            message: err instanceof Error ? err.message : 'unknown',
          },
          { status: 502 },
        );
      }

      const now = Date.now();
      const userMsg: ChatMessage = {
        role: 'user',
        content: body.userMessage,
        ts: now,
      };
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.content,
        ts: now + 1,
        actions: result.actions,
      };
      const updated = await appendHistory(env, uid, [userMsg, assistantMsg]);

      const response: ChatResponse = {
        reply: assistantMsg,
        history: updated,
      };
      return jsonResponse(response);
    }

    return jsonResponse({ error: 'not-found' }, { status: 404 });
  },
};
