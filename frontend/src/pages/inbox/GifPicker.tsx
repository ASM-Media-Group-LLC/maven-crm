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
import { useLanguage } from "@/hooks/useLanguage";

// La key se inyecta en runtime: el build deja el placeholder __RUNTIME_VITE_GIPHY_API_KEY__
// y docker-entrypoint.sh lo reemplaza por el valor real (VITE_GIPHY_API_KEY de Dokploy).
// Si quedó sin sustituir (placeholder) o vacía, la tratamos como NO configurada.
const RAW_GIPHY_KEY = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined) || "";
const GIPHY_KEY = RAW_GIPHY_KEY && !RAW_GIPHY_KEY.startsWith("__RUNTIME_") ? RAW_GIPHY_KEY : "";

interface GiphyImg { url?: string; mp4?: string }
interface GiphyRaw { id: string; images?: Record<string, GiphyImg> }
interface GifItem { id: string; preview: string; mp4: string }

interface GifPickerProps {
  onPick: (mp4Url: string) => void;
  disabled?: boolean;
}

export function GifPicker({ onPick, disabled }: GifPickerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<"config" | "api" | null>(null);
  const tRef = useRef<number | null>(null);

  const load = async (query: string) => {
    if (!GIPHY_KEY) { setErr("config"); setItems([]); return; }
    setLoading(true);
    setErr(null);
    try {
      const url = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13&bundle=messaging_non_clips`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
      const resp = await fetch(url);
      if (!resp.ok) { setErr("api"); setItems([]); return; }
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
      setErr("api");
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
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" title={t("gif.sendTitle")} disabled={disabled}>
          <Film className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("gif.search")} className="mb-2 h-9" autoFocus />
        <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto">
          {loading && (
            <div className="col-span-2 flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && err === "config" && (
            <div className="col-span-2 py-6 text-center text-xs text-muted-foreground">GIFs no configurados (falta la API key de Giphy).</div>
          )}
          {!loading && err === "api" && (
            <div className="col-span-2 py-6 text-center text-xs text-muted-foreground">No se pudieron cargar los GIFs. Revisá la API key de Giphy.</div>
          )}
          {!loading && !err && items.length === 0 && (
            <div className="col-span-2 py-6 text-center text-xs text-muted-foreground">{t("gif.none")}</div>
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
