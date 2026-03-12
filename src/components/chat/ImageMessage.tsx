import { useState } from "react";
import { Download, Maximize2 } from "lucide-react";

interface ImageMessageProps {
  src: string;
  alt?: string;
  onClick?: () => void;
}

const ImageMessage = ({ src, alt = "Image", onClick }: ImageMessageProps) => {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = src;
    a.download = `kael-image-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div className="group/img relative mb-2 cursor-pointer overflow-hidden rounded-lg" onClick={onClick}>
      <img src={src} alt={alt} className="max-h-48 w-full rounded-lg object-cover" />
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover/img:opacity-100">
        <button className="rounded-full bg-white/20 p-2 backdrop-blur-sm hover:bg-white/30">
          <Maximize2 size={14} className="text-white" />
        </button>
        <button
          onClick={handleDownload}
          className="rounded-full bg-white/20 p-2 backdrop-blur-sm hover:bg-white/30"
        >
          <Download size={14} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default ImageMessage;
