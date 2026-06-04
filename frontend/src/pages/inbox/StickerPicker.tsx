// Galería de stickers del equipo (tabla wa_stickers + Storage). Subís una imagen,
// se convierte a webp 512×512 en el navegador (formato de sticker de WhatsApp) y
// queda guardada para reenviarla con un clic. Al elegir, devuelve una URL firmada
// que el gateway manda como sticker. Se puede eliminar de la galería.
import { useState, useRef, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, Sticker, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BUCKET = "creator-files";

interface StickerRow { id: string; storage_path: string; url: string }
interface StickerPickerProps {
  onPick: (url: string) => void;
  disabled?: boolean;
}

// Redimensiona/encaja la imagen en un lienzo 512×512 transparente y la exporta a
// webp (lo que WhatsApp espera para un sticker). "contain": entra completa.
async function toStickerWebp(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas no disponible");
  const scale = Math.min(size / img.width, size / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob falló"))), "image/webp", 0.92),
  );
}

export function StickerPicker({ onPick, disabled }: StickerPickerProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: stickers = [], isLoading } = useQuery({
    queryKey: ["wa-stickers"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("wa_stickers").select("id, storage_path").order("created_at", { ascending: false }).limit(60);
      const rows = (data ?? []) as { id: string; storage_path: string }[];
      if (!rows.length) return [] as StickerRow[];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 60 * 60 * 24 * 7);
      return rows
        .map((r, i) => ({ id: r.id, storage_path: r.storage_path, url: signed?.[i]?.signedUrl ?? "" }))
        .filter((s) => s.url) as StickerRow[];
    },
    enabled: open,
  });

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      // webp (sticker) y gif ya pueden ser ANIMADOS → subir tal cual (canvas los
      // aplanaría). PNG/JPG → normalizar a webp 512×512. El gif lo convierte a webp
      // animado el gateway al enviar.
      const keepAsIs = file.type === "image/webp" || file.type === "image/gif";
      const blob: Blob = keepAsIs ? file : await toStickerWebp(file);
      const ext = file.type === "image/gif" ? "gif" : "webp";
      const path = `wa-stickers/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: keepAsIs ? file.type : "image/webp", upsert: false });
      if (up.error) throw up.error;
      const ins = await (supabase as any).from("wa_stickers").insert({ storage_path: path });
      if (ins.error) throw ins.error;
      qc.invalidateQueries({ queryKey: ["wa-stickers"] });
    } catch (err) {
      toast({ title: "No se pudo guardar el sticker", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, path: string) => {
    await (supabase as any).from("wa_stickers").delete().eq("id", id);
    await supabase.storage.from(BUCKET).remove([path]);
    qc.invalidateQueries({ queryKey: ["wa-stickers"] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" title="Stickers" disabled={disabled}>
          <Sticker className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Stickers</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />} Subir
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
        </div>
        <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
          {isLoading && (
            <div className="col-span-3 flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {!isLoading && stickers.length === 0 && (
            <div className="col-span-3 py-6 text-center text-xs text-muted-foreground">Subí tu primer sticker con "Subir".</div>
          )}
          {!isLoading && stickers.map((s) => (
            <div key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => { onPick(s.url); setOpen(false); }}
                className="block w-full overflow-hidden rounded-md p-1 hover:bg-muted"
              >
                <img src={s.url} alt="" className="h-20 w-full object-contain" loading="lazy" />
              </button>
              <button
                type="button"
                onClick={() => remove(s.id, s.storage_path)}
                title="Eliminar de la galería"
                className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-white group-hover:flex"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
