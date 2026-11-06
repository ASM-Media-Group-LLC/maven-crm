import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";

// HORARIOS POR PERSONA (Alvaro, 05/11): la tabla que le faltaba a Alvaro
// — "necesito la logística del link donde voy a poder ver los horarios de cada
// puta persona y también cuántas horas esa persona trabajó". Por persona activa:
// su rol, su horario (override o el del rol), horas de HOY y horas de la SEMANA.
// El dueño/admin puede sobre-escribir el horario de una persona (RPC
// argos_horario_persona, candado en el servidor).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as {
  from: (t: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }>;
};

interface FilaPersona {
  id: string;
  nombre: string;
  avatar_url: string | null;
  avatar_seed: string | null;
  role: string | null;
  entrada: string | null;
  salida: string | null;
  comida: number | null;
  bano: number | null;
  horasHoy: number;
  horasSemana: number;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function diasAtrasISO(d: number): string {
  const n = new Date();
  n.setUTCDate(n.getUTCDate() - d);
  return n.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function HorarioPersonaFila({ p, onCambio }: { p: FilaPersona; onCambio: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [entrada, setEntrada] = useState(hhmm(p.entrada));
  const [salida, setSalida] = useState(hhmm(p.salida));
  const [comida, setComida] = useState(p.comida == null ? "" : String(p.comida));
  const [bano, setBano] = useState(p.bano == null ? "" : String(p.bano));
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { error } = await sinTipar.rpc("argos_horario_persona", {
        _user: p.id,
        _entrada: entrada || null,
        _salida: salida || null,
        _comida: comida === "" ? null : Number(comida),
        _bano: bano === "" ? null : Number(bano),
      });
      if (error) throw new Error(error.message);
      toast({ title: t("admin.horarios.guardado") });
      onCambio();
    } catch (e) {
      toast({ title: t("admin.horarios.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const campoNum = (v: string, s: (v: string) => void, ph: string) => (
    <input type="number" min={0} value={v} onChange={(e) => s(e.target.value)} placeholder={ph}
      className="w-16 rounded-lg border border-border/60 bg-card/40 px-2 py-1.5 text-sm tabular-nums outline-none ring-primary/40 focus:ring-2" />
  );
  const campoHora = (v: string, s: (v: string) => void) => (
    <input type="time" value={v} onChange={(e) => s(e.target.value)}
      className="rounded-lg border border-border/60 bg-card/40 px-2 py-1.5 text-sm tabular-nums outline-none ring-primary/40 focus:ring-2" />
  );

  return (
    <div className="vidrio p-3">
      <div className="v-cont flex flex-wrap items-end gap-x-4 gap-y-2.5">
        <div className="flex min-w-[10rem] flex-1 items-center gap-2.5">
          <UserAvatar name={p.nombre || "·"} src={p.avatar_url} seed={p.avatar_seed} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{p.nombre || "—"}</div>
            <div className="text-[11px] text-muted-foreground">{p.role ?? "—"}</div>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.entrada")}{campoHora(entrada, setEntrada)}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.salida")}{campoHora(salida, setSalida)}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.comida")}{campoNum(comida, setComida, "rol")}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.bano")}{campoNum(bano, setBano, "rol")}</label>
        <div className="flex flex-col items-center gap-0 px-2">
          <span className="font-display text-base font-bold tabular-nums text-success">{p.horasHoy.toFixed(1)}h</span>
          <span className="text-[10px] text-muted-foreground">{t("admin.horariosPersona.hoy")}</span>
        </div>
        <div className="flex flex-col items-center gap-0 px-2">
          <span className="font-display text-base font-bold tabular-nums">{p.horasSemana.toFixed(1)}h</span>
          <span className="text-[10px] text-muted-foreground">{t("admin.horariosPersona.semana")}</span>
        </div>
        <Button size="sm" onClick={guardar} disabled={guardando} variant="outline" className="rounded-control">
          {guardando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          {t("admin.horarios.guardar")}
        </Button>
      </div>
    </div>
  );
}

export default function HorariosPorPersona() {
  const { t } = useLanguage();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["horarios-por-persona"],
    queryFn: async (): Promise<FilaPersona[]> => {
      // Personas activas.
      const { data: perfiles } = await sinTipar.from("profiles")
        .select("id, full_name, avatar_url, avatar_seed, hora_entrada, hora_salida, comida_min, bano_min")
        .is("deleted_at", null)
        .order("full_name");
      const ids = ((perfiles ?? []) as Array<{ id: string }>).map((p) => p.id);
      if (ids.length === 0) return [];

      // Roles (uno por persona, el primero).
      const { data: roles } = await sinTipar.from("user_roles").select("user_id, role").in("user_id", ids);
      const rolPor = new Map<string, string>();
      for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
        if (!rolPor.has(r.user_id)) rolPor.set(r.user_id, r.role);
      }

      // Horas de HOY y de la SEMANA (últimos 7 días, Bogotá).
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const desdeSemana = diasAtrasISO(6);
      const { data: tiempoHoy } = await (sinTipar as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: Array<{ user_id: string; seg_activo: number | string }> | null }> })
        .rpc("cowork_tiempo_diario", { _desde: hoy, _hasta: hoy, _user_id: null, _limit: 500, _offset: 0 });
      const { data: tiempoSem } = await (sinTipar as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: Array<{ user_id: string; seg_activo: number | string }> | null }> })
        .rpc("cowork_tiempo_diario", { _desde: desdeSemana, _hasta: hoy, _user_id: null, _limit: 2000, _offset: 0 });
      const horasHoyPor = new Map<string, number>();
      for (const r of (tiempoHoy ?? [])) horasHoyPor.set(r.user_id, (horasHoyPor.get(r.user_id) ?? 0) + Number(r.seg_activo) / 3600);
      const horasSemPor = new Map<string, number>();
      for (const r of (tiempoSem ?? [])) horasSemPor.set(r.user_id, (horasSemPor.get(r.user_id) ?? 0) + Number(r.seg_activo) / 3600);

      return ((perfiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null; hora_entrada: string | null; hora_salida: string | null; comida_min: number | null; bano_min: number | null }>)
        .map((p): FilaPersona => ({
          id: p.id,
          nombre: p.full_name?.trim() || "",
          avatar_url: p.avatar_url,
          avatar_seed: p.avatar_seed,
          role: rolPor.get(p.id) ?? null,
          entrada: p.hora_entrada,
          salida: p.hora_salida,
          comida: p.comida_min,
          bano: p.bano_min,
          horasHoy: horasHoyPor.get(p.id) ?? 0,
          horasSemana: horasSemPor.get(p.id) ?? 0,
        }))
        // Los que más trabajaron hoy primero (útil para ver quién produjo).
        .sort((a, b) => b.horasHoy - a.horasHoy || a.nombre.localeCompare(b.nombre, "es"));
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-2.5">
      {q.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t("admin.horarios.cargando")}</div>
      ) : (q.data ?? []).length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">{t("admin.horariosPersona.vacio")}</p>
      ) : (
        (q.data ?? []).map((p) => (
          <HorarioPersonaFila key={p.id} p={p} onCambio={() => qc.invalidateQueries({ queryKey: ["horarios-por-persona"] })} />
        ))
      )}
    </div>
  );
}
