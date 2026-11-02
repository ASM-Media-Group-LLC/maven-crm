import { useEffect, useState } from "react";
import { Building2, Loader2, AlertTriangle, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useArgosContexto } from "@/hooks/useArgosContexto";

// EL CONTEXTO DE LA EMPRESA para Argos (solo admin lo edita): tres textos simples
// —qué hace la empresa, qué sistemas son trabajo, cuáles fuera de lugar— que el
// cerebro usa para armar su prompt. Argos juzga el sistema, no el contenido.
// Todo el texto por t(); los datos, de useArgosContexto.
export function ContextoEmpresaPanel() {
  const { t } = useLanguage();
  const { contexto, cargando, error, guardar, guardando, guardadoOk, errorGuardar } = useArgosContexto();

  const [descripcion, setDescripcion] = useState("");
  const [esTrabajo, setEsTrabajo] = useState("");
  const [fueraDeLugar, setFueraDeLugar] = useState("");
  const [tocado, setTocado] = useState(false);

  // Carga inicial (y recarga tras guardar) sin pisar lo que el admin esté escribiendo.
  useEffect(() => {
    if (!contexto || tocado) return;
    setDescripcion(contexto.descripcion);
    setEsTrabajo(contexto.esTrabajo);
    setFueraDeLugar(contexto.fueraDeLugar);
  }, [contexto, tocado]);

  const campo = (valor: string, setValor: (v: string) => void, etiqueta: string, filas: number) => (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{etiqueta}</span>
      <textarea
        value={valor}
        onChange={(e) => { setTocado(true); setValor(e.target.value); }}
        rows={filas}
        className="w-full resize-y rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-sm leading-snug text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );

  const alGuardar = async () => {
    try {
      await guardar({ descripcion, esTrabajo, fueraDeLugar });
      setTocado(false);
    } catch {
      /* el error se muestra abajo */
    }
  };

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Building2 className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.contexto.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.contexto.sub")}</p>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.contexto.errorCargar")}</p>
          </div>
        ) : cargando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {campo(descripcion, setDescripcion, t("hr.contexto.descripcion"), 3)}
            {campo(esTrabajo, setEsTrabajo, t("hr.contexto.esTrabajo"), 4)}
            {campo(fueraDeLugar, setFueraDeLugar, t("hr.contexto.fueraDeLugar"), 4)}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => void alGuardar()} disabled={guardando || !tocado}>
                {guardando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                {t("hr.contexto.guardar")}
              </Button>
              {guardadoOk && !tocado && (
                <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" />{t("hr.contexto.guardado")}</span>
              )}
              {errorGuardar && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{t("hr.contexto.error")}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
