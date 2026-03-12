interface TrackCardProps {
  title: string;
  artist: string;
  albumArt?: string;
  spotifyUrl?: string;
}

const TrackCard = ({ title, artist, albumArt, spotifyUrl }: TrackCardProps) => {
  return (
    <div className="glass flex items-center gap-3 rounded-xl p-3 transition-all hover:scale-[1.01]">
      {albumArt && (
        <img src={albumArt} alt={title} className="h-12 w-12 rounded-lg object-cover" />
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{artist}</p>
      </div>
      {spotifyUrl && (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-green-500/15 px-3 py-1 text-[10px] font-medium text-green-400 hover:bg-green-500/25"
        >
          Apri
        </a>
      )}
    </div>
  );
};

export default TrackCard;
