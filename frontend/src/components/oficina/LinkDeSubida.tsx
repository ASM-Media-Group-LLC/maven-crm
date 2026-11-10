import { useCallback, useState } from "react";
import { Link2, Loader2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// LINK PÚBLICO de subida de una carpeta del Drive (Alvaro, 04/11 y 10/11).
// La gente (las modelos) lo abre SIN cuenta y sube archivos a esa carpeta.
// Desde el 10/11 se pide con link_subida_de_carpeta: si la carpeta ya tiene un
// link activo devuelve ESE (antes cada toque creaba uno nuevo — YOISNIA tenía
// tres). Solo dueño/admin/manager/supervisor/coordinador (lo fuerza la RPC).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }> };

/** La URL pública de un token de subida. */
export const urlDeAportar = (token: string) => `${window.location.origin}/aportar/${token}`;

/** El link de la carpeta: el que ya existe o uno nuevo. Nunca duplica. */
export async function pedirLinkDeSubida(itemId: string): Promise<string> {
  const { data, error } = await rpc.rpc("link_subida_de_carpeta", { _item_id: itemId });
  if (error) throw new Error(error.message);
  return urlDeAportar(String(data));
}

/** Copiar al portapapeles con el aviso de «¡Copiado!» un ratito. Si el
 *  navegador lo bloquea, el texto sigue a la vista para copiarlo a mano. */
export function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = useCallback(async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      setTimeout(() => setCopiado((c) => (c === texto ? null : c)), 1800);
    } catch { /* bloqueado: queda el input para seleccionar */ }
  }, []);
  return { copiado, copiar };
}

/** El link ya listo: el texto (seleccionable) y el botón Copiar. */
export function CajaDeLink({ url }: { url: string }) {
  const { t } = useLanguage();
  const { copiado, copiar } = useCopiar();
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t("drive.aportar.generar")}
        className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/60 px-2 py-1.5 text-xs" />
      <Button type="button" size="sm" onClick={() => void copiar(url)} className="shrink-0">
        {copiado === url ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
        {t(copiado === url ? "drive.aportar.copiado" : "drive.aportar.copiar")}
      </Button>
    </div>
  );
}

/** En el panel de Detalles de una carpeta. */
export function LinkDeSubida({ itemId }: { itemId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [creando, setCreando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const crear = async () => {
    setCreando(true);
    try {
      setUrl(await pedirLinkDeSubida(itemId));
    } catch (e) {
      toast({ title: t("drive.aportar.errorCrear"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  if (url) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Link2 className="h-3.5 w-3.5" />{t("drive.aportar.generar")}</div>
        <CajaDeLink url={url} />
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

/** El botón A LA VISTA en la barra del Drive cuando se está dentro de una
 *  carpeta (Alvaro, 10/11: "¿dónde vergas está el link de las modelos?").
 *  Abre una ventana con el link de esa carpeta, listo para copiar. */
export function BotonLinkParaLaModelo({ carpetaId, carpetaNombre }: { carpetaId: string; carpetaNombre: string | null }) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const pedir = async () => {
    setCargando(true);
    setFallo(null);
    try {
      setUrl(await pedirLinkDeSubida(carpetaId));
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  const abrir = (sigue: boolean) => {
    setAbierto(sigue);
    if (sigue && !url) void pedir();
  };

  return (
    <>
      <Button variant="outline" onClick={() => abrir(true)} aria-label={t("drive.links.botonModelo")}>
        <Link2 className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">{t("drive.links.botonModelo")}</span>
      </Button>
      <Dialog open={abierto} onOpenChange={abrir}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("drive.links.dialogoTitulo", { c: carpetaNombre ?? "—" })}</DialogTitle>
            <DialogDescription>{t("drive.links.dialogoDesc")}</DialogDescription>
          </DialogHeader>
          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("drive.links.pidiendo")}</p>
          ) : fallo ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span className="min-w-0 flex-1">{t("drive.aportar.errorCrear")} <span className="text-muted-foreground">{fallo}</span></span>
              <Button size="sm" variant="outline" onClick={() => void pedir()}>{t("drive.links.reintentar")}</Button>
            </div>
          ) : url ? (
            <CajaDeLink url={url} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
