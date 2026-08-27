// src/App.tsx

import React, { useState, useEffect, useRef, useCallback, memo, useId } from 'react';
import {
  Music,
  Link as LinkIcon,
  Wand2,
  Download,
  ArrowLeft,
  ShieldCheck,
  User,
  Tag,
  Zap,
  Heart,
  AlertCircle,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { parseYouTubeId, thumbUrl, THUMBNAIL_QUALITIES } from './utils/youtube';
import { fetchMp3Link, fetchVideoInfo, type VideoInfo, type ConvertProgress } from './utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = 'search' | 'loading' | 'result' | 'error';

interface AppData {
  state: AppState;
  videoId: string;
  videoInfo: VideoInfo | null;
  downloadLink: string | null;
  errorMessage: string;
}

const INITIAL_DATA: AppData = {
  state: 'search',
  videoId: '',
  videoInfo: null,
  downloadLink: null,
  errorMessage: '',
};

// ─── YouTube Logo ─────────────────────────────────────────────────────────────

const YouTubeLogo = memo(({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
));

// ─── Lazy Load Hook ───────────────────────────────────────────────────────────

function useLazyLoad() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// ─── Spinner (Cyan Gradient) ──────────────────────────────────────────────────

const Spinner = memo(() => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="anim-spin" aria-label="Loading">
    <circle cx="18" cy="18" r="15" stroke="rgba(56,189,248,.15)" strokeWidth="3" />
    <path d="M33 18A15 15 0 0118 3" stroke="url(#sg)" strokeWidth="3" strokeLinecap="round" />
    <defs>
      <linearGradient id="sg" x1="18" y1="3" x2="33" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0284c7" />
        <stop offset="1" stopColor="#38bdf8" />
      </linearGradient>
    </defs>
  </svg>
));

// ─── Lazy Thumbnail ───────────────────────────────────────────────────────────

const LazyThumb = memo(({ videoId, alt }: { videoId: string; alt: string }) => {
  const { ref, visible } = useLazyLoad();
  const [loaded, setLoaded] = useState(false);
  const [qi, setQi] = useState(0);

  return (
    <div ref={ref} className="thumb-wrap">
      {!loaded && <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 14 }} />}
      {visible && (
        <img
          src={thumbUrl(videoId, THUMBNAIL_QUALITIES[qi] ?? 'default')}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setQi((q) => Math.min(q + 1, THUMBNAIL_QUALITIES.length - 1))}
          className={`thumb-img${loaded ? ' loaded' : ''}`}
        />
      )}
      {loaded && <div className="thumb-overlay" />}
    </div>
  );
});

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Heart,       label: 'Free',     color: '#fb7185' },
  { icon: User,        label: 'No Login', color: '#38bdf8' },
  { icon: Zap,         label: 'Fast',     color: '#fbbf24' },
  { icon: ShieldCheck, label: 'No Ads',   color: '#34d399' },
] as const;

// ─── Custom Audio Preview Player ──────────────────────────────────────────────

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const AudioPreviewPlayer = memo(({ src }: { src: string }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsLoaded(true);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressBarRef.current;
    if (!audio || !bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const seekPercentage = clickX / rect.width;
    const newTime = seekPercentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        padding: '.9rem 1rem',
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(255,255,255,.05) 0%, rgba(56,189,248,.06) 100%)',
        border: '1px solid rgba(56,189,248,.2)',
        boxShadow: '0 8px 32px -4px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08)',
        marginBottom: '1.25rem',
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header of Player */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '16px', paddingBottom: '1px' }}>
            <div className={`wave-bar ${!isPlaying ? 'paused' : ''}`} />
            <div className={`wave-bar ${!isPlaying ? 'paused' : ''}`} />
            <div className={`wave-bar ${!isPlaying ? 'paused' : ''}`} />
            <div className={`wave-bar ${!isPlaying ? 'paused' : ''}`} />
            <div className={`wave-bar ${!isPlaying ? 'paused' : ''}`} />
          </div>
          <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Audio Preview
          </span>
        </div>

        <button
          onClick={toggleMute}
          type="button"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          style={{
            background: 'transparent',
            border: 'none',
            color: isMuted ? 'var(--color-rose)' : 'var(--color-text-3)',
            cursor: 'pointer',
            padding: '.2rem',
            display: 'flex',
            alignItems: 'center',
            transition: 'color .2s',
          }}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* Main Controls Row: Play Button + Progress Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem' }}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            border: 'none',
            color: '#04101e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 4px 18px rgba(2,132,199,.5), inset 0 1px 0 rgba(255,255,255,.4)',
            transition: 'transform .15s ease, box-shadow .15s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {isPlaying ? <Pause size={18} fill="#04101e" /> : <Play size={18} fill="#04101e" style={{ marginLeft: '2px' }} />}
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <div
            ref={progressBarRef}
            onClick={handleSeek}
            onTouchStart={handleSeek}
            style={{
              position: 'relative',
              width: '100%',
              height: '8px',
              borderRadius: '99px',
              background: 'rgba(255,255,255,.08)',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #0284c7, #38bdf8, #2dd4bf)',
                borderRadius: '99px',
                transition: 'width .1s linear',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.72rem', color: 'var(--color-text-3)', fontFamily: 'monospace' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{isLoaded ? formatTime(duration) : '0:00'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── SearchForm ───────────────────────────────────────────────────────────────

interface SearchFormProps {
  url: string;
  setUrl: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const SearchForm = memo(({ url, setUrl, onSubmit, inputRef }: SearchFormProps) => {
  const id = useId();
  return (
    <form onSubmit={(e) => { void onSubmit(e); }} noValidate>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-fadeup">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.45rem',
            padding: '.35rem .9rem',
            borderRadius: 999,
            marginBottom: '1rem',
            background: 'rgba(56,189,248,.1)',
            border: '1px solid rgba(56,189,248,.2)',
            fontSize: '.75rem',
            fontWeight: 500,
            color: 'var(--color-brand)',
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          <Music size={13} />
          YouTube → MP3 Converter
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.9rem, 7vw, 3.4rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-.03em',
            background: 'linear-gradient(135deg, #f8fafc 0%, #38bdf8 50%, #2dd4bf 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '.65rem',
          }}
        >
          Convert any video<br />to crystal-clear MP3
        </h1>
        <p style={{ color: 'var(--color-text-2)', fontSize: '.9rem', fontWeight: 300, lineHeight: 1.5 }}>
          Paste a YouTube URL below — we handle the rest, instantly.
        </p>
      </div>

      <div
        className="glass glass-shine anim-fadeup delay-1"
        style={{ padding: '1.5rem', marginBottom: '1.25rem', overflow: 'visible' }}
      >
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: '.72rem',
            fontWeight: 500,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
            marginBottom: '.65rem',
          }}
        >
          Video URL
        </label>
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <div
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-3)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LinkIcon size={18} />
          </div>
          <input
            id={id}
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              if (!url.trim()) {
                const pasted = e.clipboardData.getData('text').trim();
                if (parseYouTubeId(pasted)) {
                  e.preventDefault();
                  setUrl(pasted);
                  requestAnimationFrame(() => (e.target as HTMLInputElement).form?.requestSubmit());
                }
              }
            }}
            placeholder="https://youtube.com/watch?v=..."
            autoComplete="off"
            spellCheck={false}
            className="yt-input"
          />
        </div>
        <button type="submit" disabled={!url.trim()} className="btn-primary">
          <Wand2 size={18} />
          Convert to MP3
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '.75rem',
            marginTop: '1.1rem',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.78rem', color: 'var(--color-text-3)' }}>
            <YouTubeLogo size={16} />YouTube
          </span>
          <span style={{ color: 'var(--color-text-4)', fontSize: '.7rem' }}>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.78rem', color: 'var(--color-text-3)' }}>
            <YouTubeLogo size={16} />YouTube Music
          </span>
        </div>
      </div>

      <div
        className="anim-fadeup delay-2"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '.6rem',
        }}
      >
        {FEATURES.map(({ icon: Icon, label, color }) => (
          <div
            key={label}
            className="glass"
            style={{
              padding: '.85rem .35rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '.35rem',
            }}
          >
            <Icon size={18} color={color} />
            <span style={{ fontSize: '.72rem', color: 'var(--color-text-3)', fontWeight: 400 }}>{label}</span>
          </div>
        ))}
      </div>
    </form>
  );
});

// ─── LoadingView ──────────────────────────────────────────────────────────────

const LOADING_LABELS: Record<string, string> = {
  processing: 'Processing…',
  converting: 'Converting audio…',
  downloading: 'Downloading…',
};

const LoadingView = memo(({ progress }: { progress: ConvertProgress | null }) => {
  const percent = progress?.percent ?? 0;
  const label = progress ? (LOADING_LABELS[progress.status] ?? 'Converting…') : 'Starting conversion…';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        padding: '3.5rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <Spinner />
      <div>
        <p style={{ color: 'var(--color-text-1)', fontWeight: 500, marginBottom: '.3rem' }}>
          {label}
        </p>
        <p style={{ color: 'var(--color-text-3)', fontSize: '.85rem', fontWeight: 300 }}>
          This usually takes 5–15 seconds
        </p>
      </div>

      <div style={{ width: '200px' }}>
        <div
          style={{
            width: '100%',
            height: '3px',
            borderRadius: 99,
            background: 'rgba(255,255,255,.06)',
            overflow: 'hidden',
            marginBottom: '.5rem',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 99,
              background: 'linear-gradient(90deg, #0284c7, #38bdf8, #2dd4bf)',
              width: `${Math.max(percent, 5)}%`,
              transition: 'width .6s ease',
            }}
          />
        </div>
        {percent > 0 && (
          <p style={{ color: 'var(--color-text-4)', fontSize: '.72rem', textAlign: 'right' }}>
            {percent}%
          </p>
        )}
      </div>
    </div>
  );
});

// ─── ErrorView ────────────────────────────────────────────────────────────────

const ErrorView = memo(({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" aria-live="assertive" style={{ padding: '1.75rem' }}>
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        padding: '1.25rem',
        background: 'rgba(251,113,133,.08)',
        border: '1px solid rgba(251,113,133,.2)',
        borderRadius: 14,
        marginBottom: '1.25rem',
      }}
    >
      <AlertCircle size={20} color="#fb7185" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ color: '#fda4af', fontSize: '.9rem', lineHeight: 1.6 }}>
        {message || 'Something went wrong. Please try again.'}
      </p>
    </div>
    <button onClick={onRetry} className="btn-ghost">
      <ArrowLeft size={16} />
      Try Again
    </button>
  </div>
));

// ─── ResultView ───────────────────────────────────────────────────────────────

const ResultView = memo(
  ({
    videoId,
    videoInfo,
    downloadLink,
    onReset,
  }: {
    videoId: string;
    videoInfo: VideoInfo | null;
    downloadLink: string;
    onReset: () => void;
  }) => {
    const sanitizedTitle = (videoInfo?.title ?? 'audio')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim();
    const fileName = `${sanitizedTitle || 'youtube-audio'}.mp3`;

    return (
      <div className="anim-fadein" style={{ padding: '1.5rem' }}>
        <LazyThumb videoId={videoId} alt={videoInfo?.title ?? 'Video thumbnail'} />
        
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <span className="pill pill-rose"><YouTubeLogo size={14} />YouTube</span>
          <span className="pill pill-brand"><Music size={13} />320 kbps</span>
          <span className="pill pill-emerald"><Tag size={13} />ID3 Tags</span>
          <span className="pill pill-amber"><ShieldCheck size={13} />No Ads</span>
        </div>

        <div style={{ margin: '1rem 0 .85rem' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.1rem',
              letterSpacing: '-.015em',
              color: 'var(--color-text-1)',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              marginBottom: '.4rem',
            }}
          >
            {videoInfo?.title ?? 'Unknown Title'}
          </h2>
          <p style={{ color: 'var(--color-text-3)', fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <User size={14} />
            {videoInfo?.author_name ?? 'Unknown channel'}
          </p>
        </div>

        {/* ── Custom Audio Preview Player ── */}
        <AudioPreviewPlayer src={downloadLink} />

        <div className="divider" style={{ marginBottom: '1.25rem' }} />
        
        {/* ── ป้องกัน Popup Blocker ด้วย Native Download Link ── */}
        <a
          href={downloadLink}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            textDecoration: 'none',
            marginBottom: '.75rem',
          }}
        >
          <Download size={18} />
          Download MP3
        </a>
        
        <button onClick={onReset} className="btn-ghost">
          <ArrowLeft size={15} />Convert Another
        </button>
      </div>
    );
  }
);

// ─── Main App ─────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (data.state === 'search') inputRef.current?.focus();
  }, [data.state]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const id = parseYouTubeId(url);
      if (!id) {
        setData((d) => ({
          ...d,
          state: 'error',
          errorMessage: 'Invalid YouTube URL. Please paste a valid YouTube link.',
        }));
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setProgress(null);
      setData({ state: 'loading', videoId: id, videoInfo: null, downloadLink: null, errorMessage: '' });

      try {
        const [infoRes, linkRes] = await Promise.allSettled([
          fetchVideoInfo(id, ctrl.signal),
          fetchMp3Link(id, ctrl.signal, (p) => setProgress(p)),
        ]);

        if (ctrl.signal.aborted) return;
        if (linkRes.status === 'rejected') throw linkRes.reason;

        setData({
          state: 'result',
          videoId: id,
          videoInfo: infoRes.status === 'fulfilled' ? infoRes.value : null,
          downloadLink: typeof linkRes.value === 'string' ? linkRes.value : '',
          errorMessage: '',
        });
        setUrl('');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setData((d) => ({
          ...d,
          state: 'error',
          errorMessage: err instanceof Error ? err.message : 'Something went wrong.',
        }));
      }
    },
    [url]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(INITIAL_DATA);
    setProgress(null);
  }, []);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--color-glass-border)',
          background: 'rgba(6,9,17,.8)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            padding: '.85rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <svg width="34" height="26" viewBox="0 0 36 28" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="wg" x1="0" y1="0" x2="36" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0284c7" />
                  <stop offset="50%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#2dd4bf" />
                </linearGradient>
              </defs>
              <rect x="0" y="10" width="3.5" height="8" rx="1.75" fill="url(#wg)" opacity=".55" />
              <rect x="5" y="5" width="3.5" height="18" rx="1.75" fill="url(#wg)" opacity=".75" />
              <rect x="10" y="1" width="3.5" height="26" rx="1.75" fill="url(#wg)" />
              <rect x="15" y="7" width="3.5" height="14" rx="1.75" fill="url(#wg)" opacity=".85" />
              <rect x="20" y="3" width="3.5" height="22" rx="1.75" fill="url(#wg)" />
              <rect x="25" y="8" width="3.5" height="12" rx="1.75" fill="url(#wg)" opacity=".75" />
              <rect x="30" y="12" width="3.5" height="6" rx="1.75" fill="url(#wg)" opacity=".5" />
            </svg>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-.025em', lineHeight: 1 }}>
              <span style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>YT</span>
              <span style={{ background: 'linear-gradient(135deg, #38bdf8, #2dd4bf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: '0 .04em' }}>2</span>
              <span style={{ background: 'linear-gradient(135deg, #7dd3fc 0%, #f8fafc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>MP3</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '.45rem' }} aria-hidden="true">
            <span className="pill pill-brand"><ShieldCheck size={13} />No Ads</span>
            <span className="pill pill-dim" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span className="dot-pulse" />Online
            </span>
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: data.state === 'search' ? 'flex-start' : 'center',
          justifyContent: 'center',
          padding: data.state === 'search' ? '2.5rem 1.15rem 2rem' : '2rem 1.15rem',
        }}
      >
        <div style={{ width: '100%', maxWidth: 500 }}>
          {data.state === 'search' && (
            <SearchForm url={url} setUrl={setUrl} onSubmit={handleSubmit} inputRef={inputRef} />
          )}
          {data.state === 'loading' && (
            <div className="glass glass-shine anim-fadeup">
              <LoadingView progress={progress} />
            </div>
          )}
          {data.state === 'error' && (
            <div className="glass glass-shine anim-fadein">
              <ErrorView message={data.errorMessage} onRetry={reset} />
            </div>
          )}
          {data.state === 'result' && data.downloadLink && (
            <div className="glass glass-shine">
              <ResultView
                videoId={data.videoId}
                videoInfo={data.videoInfo}
                downloadLink={data.downloadLink}
                onReset={reset}
              />
            </div>
          )}
        </div>
      </main>

      <footer style={{ borderTop: '1px solid var(--color-glass-border)', padding: '1.25rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-4)', fontSize: '.75rem', fontWeight: 300 }}>
          © {new Date().getFullYear()} YT2MP3 — For personal use only
        </p>
      </footer>
    </div>
  );
};

export default App;