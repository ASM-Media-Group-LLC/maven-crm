import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Activity, AlertCircle, CheckCircle2, CloudOff, Clock, Loader2, Mail, Send, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
// SALUD del sistema (Alvaro, 06/11). "Un dashboard entero bien hecho que corrobore
// que todo funciona". Consulta la RPC salud_sistema() que mira NAS, crons, correos
// y Argos, y ofrece un botón "probar ahora" para forzar un envío real al dueño.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }> };

interface Salud {
  nas?: { caido: boolean; desde: string | null; pendientes: number; actualizado: string };
  cron_tardanzas?: { activo: boolean; ultima_corrida: string | null; ultimo_status: string | null };
  cron_nas?: { activo: boolean; ultima_corrida: string | null };
  tardanzas_hoy?: { total: number; con_correo: number; ultimo_correo: string | null };
  argos_ia?: { ultima_captura_juzgada: string | null; juzgadas_hoy: number };
}

function hace(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: lang === "es" ? esLocale : undefined }); } catch { return null; }
}

function Chip({ ok, loading, label }: { ok: boolean | null; loading?: boolean; label: string }) {
  if (loading) return <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />…</span>;
  if (ok === null) return <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">?</span>;
  return ok
    ? <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success"><CheckCircle2 className="h-3 w-3" />{label}</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive"><AlertCircle className="h-3 w-3" />{label}</span>;
}

function FilaSalud({ icono: Icono, titulo, estadoOk, loading, detalle, accion }: {
  icono: typeof Server; titulo: string; estadoOk: boolean | null; loading?: boolean; detalle: React.ReactNode; accion?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="vidrio p-4">
      <div className="v-cont flex items-center gap-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-panel ${estadoOk === false ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{titulo}</span>
            <Chip ok={estadoOk} loading={loading} label={estadoOk ? t("admin.salud.ok") : t("admin.salud.mal")} />
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">{detalle}</div>
        </div>
        {accion}
      </div>
    </div>
  );
}

export default function SaludPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [probando, setProbando] = useState(false);

  const q = useQuery({
    queryKey: ["salud-sistema"],
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Salud> => {
      const { data, error } = await sinTipar.rpc("salud_sistema", {});
      if (error) throw new Error(error.message);
      return (data ?? {}) as Salud;
    },
  });
  const s = q.data ?? {};

  const probarCorreo = async () => {
    setProbando(true);
    try {
      const { data, error } = await supabase.functions.invoke("correo-prueba-tardanza", { body: {} });
      if (error) throw new Error(error.message);
      const donde = (data as { enviado_a?: string } | null)?.enviado_a ?? "rusin24@gmail.com";
      toast({ title: t("admin.tardanzas.pruebaEnviada"), description: donde });
    } catch (e) {
      toast({ title: t("admin.tardanzas.pruebaError"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setProbando(false);
    }
  };

  const nasOk = s.nas ? !s.nas.caido : null;
  const ult5min = (iso: string | null | undefined) => iso ? (Date.now() - new Date(iso).getTime()) < 5 * 60 * 1000 : false;
  const cronTardOk = s.cron_tardanzas?.activo && ult5min(s.cron_tardanzas.ultima_corrida) ? true : s.cron_tardanzas?.activo ? null : false;
  const cronNasOk = s.cron_nas?.activo ? true : false;
  const argosOk = ult5min(s.argos_ia?.ultima_captura_juzgada) ? true : s.argos_ia?.ultima_captura_juzgada ? null : false;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:p-6 space-y-4">
      <PageHeader icon={<Activity className="h-5 w-5" />} title={t("admin.salud.titulo")} subtitle={t("admin.salud.sub")} />

      <FilaSalud
        icono={CloudOff}
        titulo={t("admin.salud.nas")}
        estadoOk={nasOk}
        loading={q.isLoading}
        detalle={s.nas?.caido ? `Caído desde ${hace(s.nas.desde, language) ?? "—"}, ${s.nas.pendientes} aportes esperando` : "El NAS responde y los aportes aterrizan al toque."}
      />

      <FilaSalud
        icono={Clock}
        titulo={t("admin.salud.cronTardanzas")}
        estadoOk={cronTardOk}
        loading={q.isLoading}
        detalle={<>
          {s.cron_tardanzas?.ultima_corrida && <span>{t("admin.salud.ultCorrida", { t: hace(s.cron_tardanzas.ultima_corrida, language) ?? "—" })}</span>}
          {s.tardanzas_hoy && <> · {t("admin.salud.tardanzasHoy", { n: s.tardanzas_hoy.total, ok: s.tardanzas_hoy.con_correo })}</>}
        </>}
      />

      <FilaSalud
        icono={Server}
        titulo={t("admin.salud.cronNas")}
        estadoOk={cronNasOk}
        loading={q.isLoading}
        detalle={s.cron_nas?.ultima_corrida ? t("admin.salud.ultCorrida", { t: hace(s.cron_nas.ultima_corrida, language) ?? "—" }) : "—"}
      />

      <FilaSalud
        icono={Mail}
        titulo={t("admin.salud.correo")}
        estadoOk={s.tardanzas_hoy?.ultimo_correo ? true : null}
        loading={q.isLoading}
        detalle={s.tardanzas_hoy?.ultimo_correo ? t("admin.salud.ultCorreo", { t: hace(s.tardanzas_hoy.ultimo_correo, language) ?? "—" }) : "Aún no se ha enviado ningún correo real hoy. Probá acá."}
        accion={<Button size="sm" className="rounded-control" onClick={() => void probarCorreo()} disabled={probando}>
          {probando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}{t("admin.salud.probar")}
        </Button>}
      />

      <FilaSalud
        icono={Activity}
        titulo={t("admin.salud.argos")}
        estadoOk={argosOk}
        loading={q.isLoading}
        detalle={<>
          {s.argos_ia?.ultima_captura_juzgada && <span>{t("admin.salud.ultCorrida", { t: hace(s.argos_ia.ultima_captura_juzgada, language) ?? "—" })}</span>}
          {s.argos_ia && <> · {t("admin.salud.juzgadasHoy", { n: s.argos_ia.juzgadas_hoy })}</>}
        </>}
      />
    </div>
  );
}
