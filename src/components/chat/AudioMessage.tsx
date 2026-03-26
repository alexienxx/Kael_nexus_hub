import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, MoreVertical, Download, Share2 } from "lucide-react";
import { useTheme } from "@/lib/store/theme";

interface AudioMessageProps {
  src: string;
  duration?: number;
  sender: "user" | "kael" | "external_agent";
}

/** Stable random-ish bar heights seeded by index */
const generateBars = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return ((seed - Math.floor(seed)) * 0.6 + 0.4); // 0.4–1.0
  });

const AudioMessage = ({ src, duration, sender }: AudioMessageProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  const barCount = 32;
  const barHeights = useMemo(() => generateBars(barCount), []);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    });

    audio.addEventListener("timeupdate", () => {
      const dur = audio.duration || 1;
      setProgress(audio.currentTime / dur);
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !barsRef.current) return;
    const rect = barsRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * (audioRef.current.duration || 0);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDownload = () => {
    setMenuOpen(false);
    const a = document.createElement("a");
    a.href = src;
    a.download = `kael-audio-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isUser = sender === "user";

  return (
    <div className="flex items-center gap-2.5 py-1 min-w-[200px]">
      {/* Play / Pause button */}
      <button
        onClick={togglePlay}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 ${
          isUser
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-neon-purple/20 text-neon-purple"
        }`}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      {/* Waveform + time */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {/* Bars */}
        <div
          ref={barsRef}
          className="flex items-end gap-[1.5px] h-7 cursor-pointer"
          onClick={handleSeek}
        >
          {barHeights.map((h, i) => {
            const filled = i / barCount < progress;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  filled
                    ? isUser
                      ? "bg-primary-foreground/90"
                      : "bg-neon-purple"
                    : isUser
                      ? "bg-primary-foreground/25"
                      : "bg-foreground/15"
                }`}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>

        {/* Time */}
        <span className="text-[10px] text-muted-foreground leading-none">
          {isPlaying || currentTime > 0
            ? formatTime(currentTime)
            : formatTime(totalDuration)}
        </span>
      </div>

      {/* 3-dot menu */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-foreground/10 active:scale-95"
        >
          <MoreVertical size={14} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 bottom-8 z-50 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
              <button
                onClick={handleDownload}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
              >
                <Download size={13} />
                Scarica audio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AudioMessage;
