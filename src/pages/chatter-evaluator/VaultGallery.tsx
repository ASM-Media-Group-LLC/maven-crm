import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertCircle, Image as ImageIcon, Play } from "lucide-react";
import type { ChatterVaultItem } from "./types";

interface Props {
  items: ChatterVaultItem[];
}

const isStorageUrl = (url: string) =>
  url.includes(".supabase.co/storage/") || url.includes("/storage/v1/object/public/");

const VaultThumb = ({ item, onClick }: { item: ChatterVaultItem; onClick: () => void }) => {
  const [errored, setErrored] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square overflow-hidden rounded-md border bg-muted transition-colors hover:border-primary/40"
      title={item.name}
    >
      {errored ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-xs text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="truncate">URL rota</span>
        </div>
      ) : item.media_type === "video" ? (
        <>
          <video
            src={item.url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onError={() => setErrored(true)}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-8 w-8 text-white" />
          </div>
        </>
      ) : (
        <img
          src={item.url}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {item.name}
      </div>
    </button>
  );
};

export const VaultGallery = ({ items }: Props) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null ? items[openIndex] : null;

  if (items.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
          <ImageIcon className="h-6 w-6" />
          <p className="text-sm">Sin contenido en el vault todavía.</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item, i) => (
          <VaultThumb key={item.id} item={item} onClick={() => setOpenIndex(i)} />
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpenIndex(null)}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
          {open && (
            <div className="space-y-2">
              {open.media_type === "video" ? (
                <video
                  src={open.url}
                  controls
                  autoPlay
                  className="max-h-[85vh] w-full rounded-lg bg-black"
                />
              ) : (
                <img
                  src={open.url}
                  alt={open.name}
                  className="mx-auto max-h-[85vh] rounded-lg object-contain"
                />
              )}
              <div className="flex items-center justify-between rounded-md bg-background/80 px-3 py-2 text-xs backdrop-blur">
                <span className="truncate">{open.name}</span>
                <span className="ml-2 shrink-0 text-muted-foreground">
                  {isStorageUrl(open.url) ? "branch storage" : "host original"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VaultGallery;
