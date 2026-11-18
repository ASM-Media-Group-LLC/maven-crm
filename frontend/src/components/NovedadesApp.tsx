import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import type { TranslationKey } from "@/lib/i18n";
import { CLAVE_VERSION, CLAVE_VISTAS_HASTA, marcarTarjetaAbierta, novedadesParaMostrar, versionDeLaApp, type Novedad } from "@/lib/novedadesApp";

// Ver lib/novedadesApp.ts. Solo en la app de computador.

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardar(clave: string, valor: string) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: se vuelve a mostrar */ }
}

function Seccion({ icono: Icono, titulo, items, tono }: { icono: LucideIcon; titulo: string; items: TranslationKey[]; tono: string }) {
  const { t } = useLanguage();
  if (items.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${tono}`}><Icono className="h-3.5 w-3.5" /></span>
        {titulo}
      </h3>
      <ul className="grid gap-1.5 pl-8">
        {items.map((k) => (
          <li key={k} className="relative text-sm leading-snug text-foreground before:absolute before:-left-3 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-primary/60">
            {t(k)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NovedadesApp() {
  const { t } = useLanguage();
  const [lista, setLista] = useState<Novedad[]>([]);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!escritorio()) return;
    const v = versionDeLaApp(navigator.userAgent || "");
    if (!v) return;
    setVersion(v);
    const vista = leer(CLAVE_VERSION);
    if (!vista) { guardar(CLAVE_VERSION, v); guardar(CLAVE_VISTAS_HASTA, new Date().toISOString()); return; }
    const mostrar = novedadesParaMostrar({ version: v, vista, vistasHasta: leer(CLAVE_VISTAS_HASTA) });
    if (mostrar.length === 0) guardar(CLAVE_VERSION, v);
    setLista(mostrar);
  }, []);

  useEffect(() => { marcarTarjetaAbierta(lista.length > 0); }, [lista.length]);

  const cerrar = () => {
    if (version) guardar(CLAVE_VERSION, version);
    guardar(CLAVE_VISTAS_HASTA, new Date().toISOString());
    setLista([]);
  };

  const juntar = (k: keyof Pick<Novedad, "nuevo" | "mejoro" | "reparado">) => [...new Set(lista.flatMap((n) => n[k]))];

  return (
    <Dialog open={lista.length > 0} onOpenChange={(abierta) => { if (!abierta) cerrar(); }}>
      <DialogContent className="max-w-md rounded-[22px]">
        <DialogHeader className="items-center text-center">
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.12] text-primary">
            <Sparkles className="h-6 w-6" />
          </span>
          <DialogTitle className="font-display text-xl">{t("pwa.novedades.titulo")}</DialogTitle>
          <DialogDescription>
            <span className="rounded-full bg-primary/[0.1] px-2.5 py-0.5 text-xs font-medium text-primary tabular-nums">
              {t("pwa.novedades.version", { v: version ?? "" })}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <Seccion icono={Sparkles} titulo={t("pwa.novedades.nuevo")} items={juntar("nuevo")} tono="bg-primary/[0.12] text-primary" />
          <Seccion icono={TrendingUp} titulo={t("pwa.novedades.mejoro")} items={juntar("mejoro")} tono="bg-success/15 text-success" />
          <Seccion icono={Wrench} titulo={t("pwa.novedades.reparado")} items={juntar("reparado")} tono="bg-warning/15 text-warning" />
        </div>
        <Button onClick={cerrar} className="w-full rounded-full">{t("pwa.novedades.entendido")}</Button>
      </DialogContent>
    </Dialog>
  );
}

export default NovedadesApp;
