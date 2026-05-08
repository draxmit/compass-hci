import Constants from 'expo-constants';

import { auth } from '@/services/firebase';

import type {
  ChatContext, ChatMessage, ChatResponse, ParseTextResponse, ScanReceiptResponse,
} from './types';

/**
 * Client for the Compass Gemini Worker. Reads the worker URL from
 * `app.config.ts > extra.geminiWorkerUrl` (set after one-time deploy)
 * and authenticates each request with the user's current Firebase ID
 * token.
 *
 * If the URL isn't configured (pre-deploy), every operation throws a
 * `not-configured` error which the chat screen surfaces as a friendly
 * empty state directing the user to the README.
 */

class NotConfiguredError extends Error {
  constructor() {
    super('not-configured');
    this.name = 'NotConfiguredError';
  }
}

export class GeminiClientError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, payload: unknown) {
    super(typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `gemini-${status}`);
    this.status = status;
    this.payload = payload;
    this.name = 'GeminiClientError';
  }
}

function getWorkerUrl(): string {
  const url =
    (Constants.expoConfig?.extra as { geminiWorkerUrl?: unknown } | undefined)
      ?.geminiWorkerUrl;
  if (typeof url !== 'string' || url.length === 0) {
    throw new NotConfiguredError();
  }
  return url.replace(/\/+$/, '');
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('not-signed-in');
  }
  // Force-refresh false — Firebase refreshes opportunistically; explicit
  // refresh would burn a network round-trip on every chat send.
  return user.getIdToken();
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const baseUrl = getWorkerUrl();
  const token = await getIdToken();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    Authorization: `Bearer ${token}`,
  };
  if (init.body && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

export async function isConfigured(): Promise<boolean> {
  try {
    getWorkerUrl();
    return true;
  } catch {
    return false;
  }
}

export async function fetchHistory(): Promise<ChatMessage[]> {
  const res = await authedFetch('/history', { method: 'GET' });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new GeminiClientError(res.status, payload);
  }
  const data = (await res.json()) as { history?: ChatMessage[] };
  return Array.isArray(data.history) ? data.history : [];
}

export async function clearHistory(): Promise<void> {
  const res = await authedFetch('/history', { method: 'DELETE' });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new GeminiClientError(res.status, payload);
  }
}

export async function sendChatMessage(
  userMessage: string,
  context: ChatContext,
): Promise<ChatResponse> {
  const res = await authedFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ userMessage, context }),
  });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new GeminiClientError(res.status, payload);
  }
  return (await res.json()) as ChatResponse;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Text-only NLP parsing via Gemini. Used after expo-speech-recognition
 * gives us a voice transcript — Gemini extracts structured fields
 * (amount, merchant, category, account) much more accurately than the
 * regex-based `nlpParser`, especially for Indonesian colloquialisms.
 */
export async function parseTextWithGemini(
  text: string,
  context: ChatContext,
): Promise<ParseTextResponse> {
  const res = await authedFetch('/parse-text', {
    method: 'POST',
    body: JSON.stringify({ text, context }),
  });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new GeminiClientError(res.status, payload);
  }
  return (await res.json()) as ParseTextResponse;
}

/**
 * Multimodal receipt vision via Gemini. Replaces the ML Kit OCR +
 * regex parser pipeline with one round-trip that returns both the
 * extracted text AND the parsed fields. Handles handwriting, blurry
 * photos, multilingual receipts much better than ML Kit.
 *
 * Fall-back to ML Kit on error is the caller's responsibility.
 */
export async function scanReceiptWithGemini(
  imageBase64: string,
  mimeType: string,
  context: ChatContext,
): Promise<ScanReceiptResponse> {
  const res = await authedFetch('/scan-receipt', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType, context }),
  });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new GeminiClientError(res.status, payload);
  }
  return (await res.json()) as ScanReceiptResponse;
}
