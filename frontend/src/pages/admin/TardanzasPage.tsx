import { a12 } from "@/lib/horaBogota";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, AlertTriangle, Eye, Loader2, Mail, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { correoTardanzaHTML, type DatosCorreoTardanza } from "@/lib/correoTardanzaHtml";

// TARDANZAS del día (Alvaro, 06/11). "Un link donde yo pueda ver cuando alguien
// entra tarde". Cada tardanza ya tiene correo enviado en el momento (edge
// detectar-tardanzas, cron 2 min). Esta página solo lee tardanzas_registro y
// muestra: hora asignada, hora real, cuántos minutos y a quién le llegó el correo.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface FilaTardanza {
  id: string;
  user_id: string;
  nombre: string;
  avatar_url: string | null;
  avatar_seed: string | null;
  turno_nombre: string | null;
  horario_asignado: string; // HH:MM:SS
  entro_at: string;         // ISO
  tarde_min: number;
  correo_enviado: boolean;
  correo_a: string[] | null;
  created_at: string;
}

function hhmm(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return "—"; }
}

export default function TardanzasPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [diasAtras, setDiasAtras] = useState(0);
  const [preview, setPreview] = useState<DatosCorreoTardanza | null>(null);
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);

  const DEMO_CORREO: DatosCorreoTardanza = {
    nombre: "Laura Gómez",
    rol: "Chatter",
    horario: "08:00",
    entro: "08:12",
    tardeMin: 12,
    esPrueba: true,
  };

  const enviarPrueba = async () => {
    setEnviandoPrueba(true);
    try {
      // RPC que hace net.http_post directo a send-notification-email con X-Cron-Token
      // (pipeline SQL → edge ya probado y funciona). Evita el edge intermediario.
      const { data, error } = await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: { enviado_a?: string } | null; error: { message: string } | null }> })
        .rpc("enviar_prueba_tardanza_ahora", { _to: null });
      if (error) throw new Error(error.message);
      const donde = data?.enviado_a ?? "rusin24@gmail.com";
      toast({ title: t("admin.tardanzas.pruebaEnviada"), description: donde });
    } catch (e) {
      toast({ title: t("admin.tardanzas.pruebaError"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setEnviandoPrueba(false);
    }
  };
  const dia = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - diasAtras);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  }, [diasAtras]);

  const q = useQuery({
    queryKey: ["tardanzas", dia],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FilaTardanza[]> => {
      const { data: tard } = await sinTipar.from("tardanzas_registro")
        .select("id, user_id, turno_nombre, horario_asignado, entro_at, tarde_min, correo_enviado, correo_a, created_at")
        .eq("dia", dia)
        .order("entro_at", { ascending: false });
      const filas = (tard ?? []) as Omit<FilaTardanza, "nombre" | "avatar_url" | "avatar_seed">[];
      if (filas.length === 0) return [];
      const ids = [...new Set(filas.map((f) => f.user_id))];
      const { data: perfiles } = await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids);
      const perfilPor = new Map(((perfiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }>).map((p) => [p.id, p]));
      return filas.map((f) => {
        const p = perfilPor.get(f.user_id);
        return {
          ...f,
          nombre: p?.full_name?.trim() || "—",
          avatar_url: p?.avatar_url ?? null,
          avatar_seed: p?.avatar_seed ?? null,
        };
      });
    },
  });

  const total = q.data?.length ?? 0;
  const minutosTotal = (q.data ?? []).reduce((a, b) => a + b.tarde_min, 0);
  const correosOk = (q.data ?? []).filter((f) => f.correo_enviado).length;

  return (
    <Page>
      <div className="space-y-5">
        <PageHeader icon={<Clock className="h-5 w-5" />} title={t("admin.tardanzas.titulo")} subtitle={t("admin.tardanzas.sub")}
          actions={
            <>
              <Button variant="outline" size="sm" className="rounded-control" onClick={() => setPreview(DEMO_CORREO)}>
                <Eye className="mr-1.5 h-4 w-4" />{t("admin.tardanzas.verCorreo")}
              </Button>
              <Button size="sm" className="rounded-control" onClick={() => void enviarPrueba()} disabled={enviandoPrueba}>
                {enviandoPrueba ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                {t("admin.tardanzas.enviarPrueba")}
              </Button>
            </>
          } />

        {/* Navegación por día + KPIs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-1 rounded-panel border border-border/50 bg-card/30 p-1">
            <button onClick={() => setDiasAtras((d) => d + 1)} className="rounded-control px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition">← {t("admin.tardanzas.anterior")}</button>
            <span className="rounded-control bg-primary/15 text-primary px-3 py-1.5 text-xs font-semibold">
              {diasAtras === 0 ? t("admin.tardanzas.hoy") : dia}
            </span>
            <button disabled={diasAtras === 0} onClick={() => setDiasAtras((d) => Math.max(0, d - 1))} className="rounded-control px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-40">{t("admin.tardanzas.siguiente")} →</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="vidrio vidrio-glow glow-r p-4">
            <div className="v-cont flex flex-col gap-1">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-xs font-semibold text-muted-foreground">{t("admin.tardanzas.kpi.total")}</span></div>
              <div className="font-display text-3xl font-bold tabular-nums text-destructive">{total}</div>
            </div>
          </div>
          <div className="vidrio vidrio-glow glow-a p-4">
            <div className="v-cont flex flex-col gap-1">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-warning" /><span className="text-xs font-semibold text-muted-foreground">{t("admin.tardanzas.kpi.minutos")}</span></div>
              <div className="font-display text-3xl font-bold tabular-nums text-warning">{minutosTotal}m</div>
            </div>
          </div>
          <div className="vidrio vidrio-glow glow-g p-4">
            <div className="v-cont flex flex-col gap-1">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-success" /><span className="text-xs font-semibold text-muted-foreground">{t("admin.tardanzas.kpi.correos")}</span></div>
              <div className="font-display text-3xl font-bold tabular-nums text-success">{correosOk}</div>
            </div>
          </div>
        </div>

        {q.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t("admin.tardanzas.cargando")}</div>
        ) : total === 0 ? (
          <div className="vidrio p-8 text-center">
            <p className="text-sm font-semibold text-success">✓ {t("admin.tardanzas.ninguna")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("admin.tardanzas.ningunaDetalle")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {q.data?.map((f) => (
              <div key={f.id} className="vidrio vidrio-glow glow-r p-3.5">
                <div className="v-cont flex flex-wrap items-center gap-3">
                  <UserAvatar name={f.nombre} src={f.avatar_url} seed={f.avatar_seed} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{f.nombre}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {f.turno_nombre && <span className="mr-2 rounded-full border border-border/50 bg-card/40 px-1.5 py-0.5 text-[10px]">{f.turno_nombre}</span>}
                      {t("admin.tardanzas.esperaba", { h: f.horario_asignado.slice(0, 5) })} ·
                      {t("admin.tardanzas.entroA", { h: a12(hhmm(f.entro_at)) ?? "—" })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-display text-xl font-bold tabular-nums text-destructive">+{f.tarde_min}m</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${f.correo_enviado ? "text-success" : "text-muted-foreground"}`}>
                      {f.correo_enviado ? <><Send className="h-3 w-3" />{t("admin.tardanzas.correoEnviado", { n: f.correo_a?.length ?? 0 })}</> : <>{t("admin.tardanzas.correoNoEnviado")}</>}
                    </span>
                  </div>
                  <button type="button" onClick={() => setPreview({
                    nombre: f.nombre, rol: f.turno_nombre ?? null,
                    horario: a12(f.horario_asignado.slice(0, 5)) ?? "", entro: a12(hhmm(f.entro_at)) ?? "—",
                    tardeMin: f.tarde_min, esPrueba: false,
                  })} className="rounded-lg border border-border/60 bg-card/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground">
                    <Eye className="inline h-3 w-3 mr-1" />{t("admin.tardanzas.verCorreoDeEsta")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="rounded-panel border border-border/40 bg-card/20 px-3 py-2 text-[11px] text-muted-foreground">
          {t("admin.tardanzas.nota")}
        </p>

        {/* Modal de preview del correo (igualito al que se envía). */}
        <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden">
            <DialogTitle className="p-4 border-b border-border/40">{t("admin.tardanzas.previewTitulo")}</DialogTitle>
            {preview && (
              <iframe title="email preview" srcDoc={correoTardanzaHTML(preview)} className="w-full border-0" style={{ height: "min(70vh, 720px)", background: "#eef1f6" }} />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Page>
  );
}
