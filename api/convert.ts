// api/convert.ts

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  runtime: 'edge',
};

const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('id');

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing video ID' }), { status: 400 });
  }

  // ดึง Keys จาก server-side environment variables
  const keys = [
    process.env.RAPIDAPI_KEY,
    process.env.RAPIDAPI_KEY_0,
    process.env.RAPIDAPI_KEY_1,
    process.env.RAPIDAPI_KEY_2,
    process.env.RAPIDAPI_KEY_3,
    process.env.VITE_RAPIDAPI_KEY_0,
  ].filter((k): k is string => Boolean(k && k.trim()));

  if (!keys.length) {
    return new Response(JSON.stringify({ error: 'No RapidAPI keys configured on server.' }), {
      status: 500,
    });
  }

  let lastError: Error | null = null;

  for (const key of keys) {
    try {
      const response = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${videoId}`, {
        headers: {
          'X-RapidAPI-Key': key,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      });

      if (response.status === 429) {
        // Quota เต็ม -> วนลูปเปลี่ยน Key ถัดไป
        continue;
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Upstream request failed');
    }
  }

  return new Response(
    JSON.stringify({ error: lastError?.message || 'All API keys exhausted or rate-limited.' }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}