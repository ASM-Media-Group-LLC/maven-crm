import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Loader2, Check, AlertTriangle, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { a12 } from "@/lib/horaBogota";
import type { TranslationKey } from "@/lib/i18n";
import { useDisenoPulido } from "@/hooks/useDisenoPulido";

// Qué le dijo Argos a la persona ese día (Alvaro, 09/11). En vez de que el
// dueño vaya a adivinar por qué una nota bajó, aquí ve EN SECO la cronología:
// qué tipo de aviso ("se apagó la cámara"), qué le dijo Argos literal, a qué
// hora, cuánto tardó en volver, y si Argos tuvo que escalar al supervisor por
// no responder. Si no le avisó nada, no sale nada.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface Nudge {
  id: string;
  tipo: string;
  mensaje: string | null;
  avisadoAt: string;
  escaladoAt: string | null;
  cerradoAt: string | null;
}

interface EtiquetaTipo { k: TranslationKey; cls: string; }
const ETIQUETA: Record<string, EtiquetaTipo> = {
  camara_apagada: { k: "hr.exp.argos.tipo.camara", cls: "bg-warning/15 text-warning border-warning/30" },
  fuera_cuadro: { k: "hr.exp.argos.tipo.fuera", cls: "bg-warning/15 text-warning border-warning/30" },
  sin_pantalla: { k: "hr.exp.argos.tipo.pantalla", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  distraido: { k: "hr.exp.argos.tipo.distraido", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

/** «2026-11-11T16:41:25+00:00» → «4:41 pm» en hora de Bogotá (antes salía la fecha cruda). */
function horaDe(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return a12(d.toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }));
}

/** El puntito del tipo de aviso en el diseño pulido: rojo lo grave, ámbar lo leve. */
const PUNTO_TIPO: Record<string, string> = {
  camara_apagada: "bg-warning", fuera_cuadro: "bg-warning", sin_pantalla: "bg-destructive", distraido: "bg-destructive",
};

function minutosEntre(desde: string, hasta: string | null): number {
  const d = Date.parse(desde);
  const h = hasta ? Date.parse(hasta) : Date.now();
  if (!Number.isFinite(d) || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.round((h - d) / 60_000));
}

export function AvisosDeArgos({ userId, fecha }: { userId: string; fecha: string }) {
  const { t } = useLanguage();
  const pulido = useDisenoPulido();
  const q = useQuery<Nudge[]>({
    queryKey: ["argos-nudges-dia", userId, fecha],
    staleTime: 30_000,
    queryFn: async () => {
      const inicio = `${fecha}T00:00:00-05:00`;
      const fin = `${fecha}T23:59:59-05:00`;
      const { data, error } = await sinTipar.from("argos_nudges")
        .select("id, tipo, mensaje, avisado_at, escalado_at, cerrado_at")
        .eq("user_id", userId)
        .gte("avisado_at", inicio)
        .lte("avisado_at", fin)
        .order("avisado_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; tipo: string; mensaje: string | null; avisado_at: string; escalado_at: string | null; cerrado_at: string | null }>).map((n) => ({
        id: n.id, tipo: n.tipo, mensaje: n.mensaje, avisadoAt: n.avisado_at, escaladoAt: n.escalado_at, cerradoAt: n.cerrado_at,
      }));
    },
  });

  const nudges = useMemo(() => q.data ?? [], [q.data]);
  const resumen = useMemo(() => ({
    total: nudges.length,
    escalados: nudges.filter((n) => n.escaladoAt).length,
    corregidosSolo: nudges.filter((n) => n.cerradoAt && !n.escaladoAt).length,
  }), [nudges]);

  if (q.isLoading) {
    return (
      <section className="vidrio sube mt-5 p-4 lg:p-5">
        <div className="v-cont flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("hr.exp.argos.cargando")}
        </div>
      </section>
    );
  }
  // Si no hubo avisos, no se muestra el bloque (silencioso).
  if (nudges.length === 0) return null;

  // PULIDO (Alvaro, 12/11: «los colores y los botoncitos se ven vibe coding»):
  // una lista sobria, sin pastillas de color. Cada aviso en una línea: el puntito
  // del tipo, el tipo en blanco y a la derecha, en gris, la hora y cómo terminó.
  if (pulido) {
    return (
      <section className="vidrio sube mt-5 p-4 lg:p-5">
        <div className="v-cont">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" />{t("hr.exp.argos.titulo", { n: resumen.total })}
            </p>
            <div className="flex items-center gap-2">
              {resumen.corregidosSolo > 0 && (
                <span className="inline-flex items-center rounded-full border border-border/70 bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/90">{t("hr.exp.argos.corrigio", { n: resumen.corregidosSolo })}</span>
              )}
              {resumen.escalados > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.exp.argos.escaloN", { n: resumen.escalados })}
                </span>
              )}
            </div>
          </div>
          <ul className="divide-y divide-border/50 rounded-[10px] border border-border/60">
            {nudges.map((n) => {
              const et = ETIQUETA[n.tipo];
              const dur = minutosEntre(n.avisadoAt, n.cerradoAt ?? n.escaladoAt);
              return (
                <li key={n.id} title={n.mensaje ?? undefined} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_TIPO[n.tipo] ?? "bg-muted-foreground"}`} aria-hidden />
                    {et ? t(et.k) : n.tipo}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground">
                    <span>{horaDe(n.avisadoAt) ?? "—"}</span>
                    {dur > 0 && <span>· {t("hr.exp.argos.duro", { min: dur })}</span>}
                    {n.escaladoAt
                      ? <span className="text-foreground/90">· {t("hr.exp.argos.escalo", { hora: horaDe(n.escaladoAt) ?? "—" })}</span>
                      : n.cerradoAt && <span className="inline-flex items-center gap-1">· <Check className="h-3 w-3" />{t("hr.exp.argos.cerrado")}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className="vidrio sube mt-5 p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5" />{t("hr.exp.argos.titulo", { n: resumen.total })}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {resumen.corregidosSolo > 0 && <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">{t("hr.exp.argos.corrigio", { n: resumen.corregidosSolo })}</span>}
            {resumen.escalados > 0 && <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-destructive">{t("hr.exp.argos.escaloN", { n: resumen.escalados })}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {nudges.map((n) => {
            const et = ETIQUETA[n.tipo];
            const dur = minutosEntre(n.avisadoAt, n.cerradoAt ?? n.escaladoAt);
            return (
              <div key={n.id} className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-card/20 px-3 py-2">
                <span className="mt-0.5 shrink-0">
                  {n.escaladoAt ? <ArrowUp className="h-3.5 w-3.5 text-destructive" />
                    : n.cerradoAt ? <Check className="h-3.5 w-3.5 text-success" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${et?.cls ?? "bg-muted/40 text-muted-foreground border-border/40"}`}>
                      {et ? t(et.k) : n.tipo}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{horaDe(n.avisadoAt)}</span>
                    {dur > 0 && <span className="text-[11px] text-muted-foreground">· {t("hr.exp.argos.duro", { min: dur })}</span>}
                    {n.escaladoAt && <span className="text-[11px] font-medium text-destructive">· {t("hr.exp.argos.escalo", { hora: horaDe(n.escaladoAt) ?? "—" })}</span>}
                    {!n.escaladoAt && n.cerradoAt && <span className="text-[11px] text-success">· {t("hr.exp.argos.cerrado")}</span>}
                  </div>
                  {n.mensaje && <p className="mt-0.5 text-[11px] italic text-muted-foreground">"{n.mensaje}"</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
