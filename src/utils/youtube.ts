// src/utils/youtube.ts

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. ตรวจสอบกรณีวาง Video ID 11 หลักตรงๆ
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. ตัด tracking query parameters ออก (เช่น ?si=...)
  const cleaned = trimmed.replace(/[?&]si=[^&]*/g, '');

  // 3. Match ทุกรูปแบบ URL ของ YouTube
  const match = cleaned.match(
    /(?:youtu\.be\/|(?:www\.|music\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/
  );

  return match?.[1] ?? null;
}

export const THUMBNAIL_QUALITIES = ['maxresdefault', 'hqdefault', 'mqdefault', 'default'] as const;
export type ThumbnailQuality = (typeof THUMBNAIL_QUALITIES)[number];

export function thumbUrl(id: string, q: ThumbnailQuality): string {
  return `https://img.youtube.com/vi/${id}/${q}.jpg`;
}