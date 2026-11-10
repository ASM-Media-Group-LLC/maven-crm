import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, CloudOff, Loader2, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

// Checklist EN VIVO al tocar una caja de Salud (Alvaro, 09/11). Corre el edge
// salud-diagnostico que hace pruebas reales y las devuelve una por una, para
// que vea qué sirve y qué no. Con botón Reintentar.

type Estado = "ok" | "mal" | "duda";
interface Prueba { nombre: string; estado: Estado; detalle: string }

const TITULOS: Record<string, string> = {
  drive: "Drive · diagnóstico", nas: "Drive · diagnóstico",
  argos: "Argos · diagnóstico",
  correo: "Correo · diagnóstico",
  mensajeria: "Mensajería · diagnóstico",
};

export function SaludDiagnosticoModal({ tipo, abierto, onCerrar }: { tipo: string | null; abierto: boolean; onCerrar: () => void; }) {
  const { t } = useLanguage();
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correr = async () => {
    if (!tipo) return;
    setCargando(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("salud-diagnostico", { body: { tipo } });
      if (error) throw new Error(error.message);
      const d = data as { ok?: boolean; pruebas?: Prueba[]; error?: string };
      if (!d?.ok) throw new Error(d?.error || "No se pudo correr el diagnóstico");
      setPruebas(d.pruebas ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally { setCargando(false); }
  };

  useEffect(() => { if (abierto && tipo) void correr(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [abierto, tipo]);
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto, onCerrar]);

  if (!abierto || !tipo) return null;
  const titulo = TITULOS[tipo] ?? "Diagnóstico";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold">{titulo}</h3>
          <button type="button" onClick={onCerrar} className="rounded-full p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground" aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("dashboard.centro.salud.corriendoPruebas")}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pruebas.map((p, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                p.estado === "ok" ? "border-success/30 bg-success/5"
                : p.estado === "mal" ? "border-destructive/30 bg-destructive/5"
                : "border-warning/30 bg-warning/5"
              }`}>
                <span className="mt-0.5 shrink-0">
                  {p.estado === "ok" ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : p.estado === "mal" ? <AlertCircle className="h-4 w-4 text-destructive" />
                    : <CloudOff className="h-4 w-4 text-warning" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.nombre}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{p.detalle}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={correr} disabled={cargando}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reintentar
          </Button>
        </div>
      </div>
    </div>
  );
}
