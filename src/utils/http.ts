// src/utils/http.ts

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Max attempts including the first try (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default: 5xx only) */
  retryOn?: number[];
}

export interface PollOptions<T> {
  /** How often to check in ms (default: 2000) */
  intervalMs?: number;
  /** Max total wait time in ms (default: 60_000) */
  timeoutMs?: number;
  /** Return true when done */
  isDone: (result: T) => boolean;
  /** Called on each successful poll with the latest result */
  onProgress?: (result: T, elapsed: number) => void;
}

// ─── fetchJson ────────────────────────────────────────────────────────────────

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json') || contentType.includes('+json');

  // กรณี Server คืน HTTP Error (4xx, 5xx)
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;

    if (isJson) {
      try {
        const errData = (await res.json()) as { error?: string; msg?: string; message?: string };
        errorMsg = errData.error || errData.msg || errData.message || errorMsg;
      } catch {
        // fallback to default errorMsg
      }
    } else {
      // กรณี Server คืนหน้า HTML Error (เช่น Cloudflare 502/504, Nginx, Vercel Edge Error)
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        errorMsg = `Server is temporarily unavailable (HTTP ${res.status}). Please try again later.`;
      } else if (res.status === 429) {
        errorMsg = 'Too many requests. Please wait a moment and try again.';
      } else {
        errorMsg = `Server error (HTTP ${res.status}). Please try again.`;
      }
    }

    const e = new Error(errorMsg) as Error & { status: number };
    e.status = res.status;
    throw e;
  }

  // กรณี Server คืนสถานะ 200 OK แต่ข้อมูลดันไม่ใช่ JSON (เช่น โดน Redirect ไปหน้า Login/HTML)
  if (!isJson) {
    throw new Error('Invalid server response (received HTML instead of JSON).');
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('Failed to parse server response as JSON.');
  }
}

// ─── sleep ────────────────────────────────────────────────────────────────────

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

// ─── fetchWithRetry ───────────────────────────────────────────────────────────

export async function fetchWithRetry<T>(
  fetcher: (attempt: number) => Promise<T>,
  options: RetryOptions & { signal?: AbortSignal; _sleep?: typeof sleep } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, retryOn, signal, _sleep = sleep } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetcher(attempt);
    } catch (err) {
      if (signal?.aborted) throw err;

      const isLast = attempt === maxAttempts - 1;
      if (isLast) throw err;

      const status = (err as Error & { status?: number }).status;

      const shouldRetry = retryOn
        ? status !== undefined && retryOn.includes(status)
        : status === undefined || status >= 500;

      if (!shouldRetry) throw err;

      const delay = baseDelayMs * 2 ** attempt;
      await _sleep(delay, signal);
    }
  }

  throw new Error('fetchWithRetry: exhausted attempts');
}

// ─── pollUntilDone ────────────────────────────────────────────────────────────

export async function pollUntilDone<T>(
  fetcher: () => Promise<T>,
  options: PollOptions<T> & { signal?: AbortSignal }
): Promise<T> {
  const { intervalMs = 2000, timeoutMs = 60_000, isDone, onProgress, signal } = options;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const result = await fetcher();
    const elapsed = timeoutMs - (deadline - Date.now());

    if (isDone(result)) return result;

    onProgress?.(result, elapsed);

    if (Date.now() >= deadline) {
      throw new Error('Conversion timed out. Please try again.');
    }

    await sleep(intervalMs, signal);
  }
}