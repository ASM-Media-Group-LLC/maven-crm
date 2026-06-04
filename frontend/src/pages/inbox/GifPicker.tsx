// Buscador de GIFs (Giphy) para el compose del inbox. Abre un popover con un
// buscador + grid de resultados; al elegir uno, devuelve la URL .mp4 (que el
// gateway manda como video con gifPlayback → se ve como GIF en WhatsApp).
// La API key sale de VITE_GIPHY_API_KEY; si no está, usa la key pública de demo
// de Giphy (sirve para arrancar; en prod conviene poner una propia).
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Film } from "lucide-react";

const GIPHY_KEY = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined) || "dc6zaTOxFJmzC";

interface GiphyImg { url?: string; mp4?: string }
interface GiphyRaw { id: string; images?: Record<string, GiphyImg> }
interface GifItem { id: string; preview: string; mp4: string }

interface GifPickerProps {
  onPick: (mp4Url: string) => void;
  disabled?: boolean;
}

export function GifPicker({ onPick, disabled }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const tRef = useRef<number | null>(null);

  const load = async (query: string) => {
    setLoading(true);
    try {
      const url = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13&bundle=messaging_non_clips`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
      const resp = await fetch(url);
      const json = (await resp.json()) as { data?: GiphyRaw[] };
      const data = json.data ?? [];
      setItems(
        data
          .map((g) => ({
            id: String(g.id),
            preview: g.images?.["fixed_width_small"]?.url || g.images?.["fixed_height_small"]?.url || g.images?.["preview_gif"]?.url || "",
            mp4: g.images?.["original"]?.mp4 || g.images?.["fixed_height"]?.mp4 || g.images?.["original"]?.url || "",
          }))
          .filter((g) => g.preview && g.mp4),
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce de la búsqueda; al abrir, carga trending.
  useEffect(() => {
    if (!open) return;
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => load(q), 350);
    return () => { if (tRef.current) window.clearTimeout(tRef.current); };
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" title="Enviar GIF" disabled={disabled}>
          <Film className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar GIF…" className="mb-2 h-9" autoFocus />
        <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto">
          {loading && (
            <div className="col-span-2 flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="col-span-2 py-6 text-center text-xs text-muted-foreground">Sin resultados</div>
          )}
          {!loading && items.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onPick(g.mp4); setOpen(false); setQ(""); }}
              className="overflow-hidden rounded-md border border-transparent transition hover:border-primary"
            >
              <img src={g.preview} alt="" className="h-24 w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">vía GIPHY</p>
      </PopoverContent>
    </Popover>
  );
}
