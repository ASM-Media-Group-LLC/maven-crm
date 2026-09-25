import { useEffect } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

// Mirrors the original Roleplaychatters openMediaViewer (index.html line 1670):
// fullscreen overlay, click-outside to close, ✕ button, supports image/video.

interface MediaViewerProps {
  url: string | null;
  kind?: "image" | "video";
  onClose: () => void;
}

// Auto-detect video vs image from the URL when the caller doesn't
// specify `kind`. Matches the chat-files / chatter-vault upload extensions.
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv|hevc)(\?|#|$)/i;

export const MediaViewer = ({ url, kind, onClose }: MediaViewerProps) => {
  const { t } = useLanguage();
  const resolvedKind: "image" | "video" =
    kind ?? (url && VIDEO_EXT_RE.test(url) ? "video" : "image");
  // Close on Escape, like a sane lightbox would.
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] flex cursor-pointer items-center justify-center bg-black/95"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        aria-label={t("common.close")}
      >
        <X className="h-5 w-5" />
      </button>
      {resolvedKind === "video" ? (
        <video
          src={url}
          controls
          autoPlay
          className="max-h-[90vh] max-w-[90vw] rounded-lg"
        />
      ) : (
        <img
          src={url}
          alt=""
          className="max-h-[90vh] max-w-[90vw] rounded-lg"
        />
      )}
    </div>
  );
};

export default MediaViewer;
