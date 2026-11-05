import { useState } from "react";
import { Link2, Loader2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";

// Genera un LINK PÚBLICO de subida para una carpeta del Drive (Alvaro, 04/11).
// Solo editores/admins/supervisores/manager (lo fuerza el RPC crear_link_subida).
// La gente abre el link SIN cuenta y sube archivos a esa carpeta.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }> };

export function LinkDeSubida({ itemId }: { itemId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [creando, setCreando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const crear = async () => {
    setCreando(true);
    try {
      const { data, error } = await rpc.rpc("crear_link_subida", { _item_id: itemId, _nombre: null });
      if (error) throw new Error(error.message);
      const token = String(data);
      setUrl(`${window.location.origin}/aportar/${token}`);
    } catch (e) {
      toast({ title: t("drive.aportar.errorCrear"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { /* algunos navegadores lo bloquean: el texto queda a la vista para copiar a mano */ }
  };

  if (url) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Link2 className="h-3.5 w-3.5" />{t("drive.aportar.generar")}</div>
        <div className="flex items-center gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/60 px-2 py-1.5 text-xs" />
          <button type="button" onClick={copiar} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{t(copiado ? "drive.aportar.copiado" : "drive.aportar.copiar")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={crear} disabled={creando} className="inline-flex items-center gap-2 self-start rounded-control text-sm text-primary hover:underline disabled:opacity-60">
      {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
      {t(creando ? "drive.aportar.creando" : "drive.aportar.generar")}
    </button>
  );
}
