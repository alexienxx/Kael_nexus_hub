import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download } from "lucide-react";
import { useTheme } from "@/lib/store/theme";

interface AudioMessageProps {
  src: string;
  duration?: number;
  sender: "user" | "kael" | "external_agent";
}

const AudioMessage = ({ src, duration, sender }: AudioMessageProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setProgress(0);
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

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Generate visualization bars
  const barCount = 24;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const filled = (i / barCount) * 100 < progress;
    const height = Math.random() * 60 + 40; // 40-100%
    return { height, filled };
  });

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        onClick={togglePlay}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neon-purple/20 text-neon-purple transition-all hover:scale-110"
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      <div className="flex flex-1 items-end gap-[2px] h-6">
        {theme.audioBarStyle === "bars" &&
          bars.map((bar, i) => (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-colors ${
                bar.filled ? "bg-neon-purple" : "bg-foreground/15"
              }`}
              style={{ height: `${bar.height}%` }}
            />
          ))}
        {theme.audioBarStyle === "wave" && (
          <div className="relative flex-1 h-full">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-neon-purple/30"
              style={{ width: `${progress}%` }}
            />
            <svg viewBox="0 0 100 20" className="h-full w-full" preserveAspectRatio="none">
              <path
                d="M0,10 Q5,2 10,10 Q15,18 20,10 Q25,2 30,10 Q35,18 40,10 Q45,2 50,10 Q55,18 60,10 Q65,2 70,10 Q75,18 80,10 Q85,2 90,10 Q95,18 100,10"
                fill="none"
                stroke="hsl(var(--neon-purple))"
                strokeWidth="1.5"
                opacity={0.5}
              />
            </svg>
          </div>
        )}
        {theme.audioBarStyle === "dots" &&
          bars.map((bar, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                bar.filled ? "bg-neon-purple" : "bg-foreground/15"
              }`}
            />
          ))}
        {theme.audioBarStyle === "minimal" && (
          <div className="flex-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-neon-purple transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <span className="text-[10px] text-muted-foreground shrink-0">
        {formatTime(currentTime || duration || 0)}
      </span>

      <button
        onClick={handleDownload}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:scale-110 hover:text-neon-blue"
        title="Scarica audio"
      >
        <Download size={12} />
      </button>
    </div>
  );
};

export default AudioMessage;
