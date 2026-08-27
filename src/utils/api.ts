// src/utils/api.ts

import { fetchJson, pollUntilDone } from './http';

export interface ConvertApiResponse {
  status?: string;
  link?: string;
  msg?: string;
  progress?: number;
  error?: string;
}

export interface ConvertProgress {
  percent: number;
  status: string;
}

export async function fetchMp3Link(
  videoId: string,
  signal: AbortSignal,
  onProgress?: (p: ConvertProgress) => void
): Promise<string> {
  const checkStatus = async (): Promise<ConvertApiResponse> => {
    const res = await fetchJson<ConvertApiResponse>(`/api/convert?id=${videoId}`, { signal });

    // หากเซิร์ฟเวอร์หรือ API แจ้งข้อผิดพลาด ให้ throw ทันที ไม่ต้องรอวน polling
    if (res.error) {
      throw new Error(res.error);
    }
    if (res.status === 'fail') {
      throw new Error(res.msg || 'Conversion failed from server.');
    }

    return res;
  };

  const result = await pollUntilDone<ConvertApiResponse>(checkStatus, {
    intervalMs: 2500,
    timeoutMs: 90_000,
    signal,
    isDone: (r) => typeof r.link === 'string' && r.link.length > 0,
    onProgress: (r, elapsed) => {
      const percent = Math.min(95, Math.round((elapsed / 90_000) * 100));
      onProgress?.({ percent, status: r.status ?? 'processing' });
    },
  });

  if (!result.link) {
    throw new Error(result.msg || 'No download link returned.');
  }

  return result.link;
}

export interface VideoInfo {
  title: string;
  author_name: string;
}

export async function fetchVideoInfo(videoId: string, signal: AbortSignal): Promise<VideoInfo | null> {
  try {
    return await fetchJson<VideoInfo>(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal }
    );
  } catch {
    return null;
  }
}