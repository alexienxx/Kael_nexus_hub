import { X, Download, Share2 } from "lucide-react";

interface ImageViewerProps {
  src: string;
  onClose: () => void;
}

const ImageViewer = ({ src, onClose }: ImageViewerProps) => {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = `kael-image-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={handleDownload}
          className="rounded-full bg-white/10 p-2 text-white backdrop-blur-sm hover:bg-white/20"
        >
          <Download size={20} />
        </button>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 text-white backdrop-blur-sm hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>
      <img
        src={src}
        alt="Full view"
        className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain"
        onClick={onClose}
      />
    </div>
  );
};

export default ImageViewer;
