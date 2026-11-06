import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import HorariosPorPersona from "./HorariosPorPersona";

// HORARIOS POR ROL (Alvaro, 05/11): una tabla con todos los roles para ponerles de
// una el horario (entrada/salida), el cupo de baño/comida (minutos que NO cuentan
// en contra) y la tolerancia de tardanza. Guarda por rol con argos_horario_rol
// (candado dueño+admin en el servidor). El override por persona vive en su ficha.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as {
  from: (t: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }>;
};

interface RolHorario {
  name: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  comida_min: number;
  bano_min: number;
  tolerancia_min: number;
}

const hhmm = (t: string | null): string => (t ? t.slice(0, 5) : "");

function FilaRol({ rol }: { rol: RolHorario }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [entrada, setEntrada] = useState(hhmm(rol.hora_entrada));
  const [salida, setSalida] = useState(hhmm(rol.hora_salida));
  const [comida, setComida] = useState(String(rol.comida_min ?? 30));
  const [bano, setBano] = useState(String(rol.bano_min ?? 10));
  const [tol, setTol] = useState(String(rol.tolerancia_min ?? 5));
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { error } = await sinTipar.rpc("argos_horario_rol", {
        _role: rol.name,
        _entrada: entrada || null,
        _salida: salida || null,
        _comida: Number(comida) || 0,
        _bano: Number(bano) || 0,
        _tolerancia: Number(tol) || 0,
      });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["horarios-roles"] });
      toast({ title: t("admin.horarios.guardado") });
    } catch (e) {
      toast({ title: t("admin.horarios.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const campoNum = (val: string, set: (v: string) => void) => (
    <input type="number" min={0} value={val} onChange={(e) => set(e.target.value)}
      className="w-16 rounded-lg border border-border/60 bg-card/40 px-2 py-1.5 text-sm tabular-nums outline-none ring-primary/40 focus:ring-2" />
  );
  const campoHora = (val: string, set: (v: string) => void) => (
    <input type="time" value={val} onChange={(e) => set(e.target.value)}
      className="rounded-lg border border-border/60 bg-card/40 px-2 py-1.5 text-sm tabular-nums outline-none ring-primary/40 focus:ring-2" />
  );

  return (
    <div className="vidrio vidrio-glow glow-b p-3.5">
      <div className="v-cont flex flex-wrap items-end gap-x-4 gap-y-2.5">
        <div className="min-w-[8rem] flex-1">
          <span className="text-xs text-muted-foreground">{t("admin.horarios.rol")}</span>
          <div className="truncate text-sm font-semibold">{rol.name}</div>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.entrada")}{campoHora(entrada, setEntrada)}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.salida")}{campoHora(salida, setSalida)}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.comida")}{campoNum(comida, setComida)}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.bano")}{campoNum(bano, setBano)}</label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{t("admin.horarios.tolerancia")}{campoNum(tol, setTol)}</label>
        <Button size="sm" onClick={guardar} disabled={guardando} className="rounded-control">
          {guardando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          {t("admin.horarios.guardar")}
        </Button>
      </div>
    </div>
  );
}

export default function HorariosPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"rol" | "persona">("rol");

  const q = useQuery({
    queryKey: ["horarios-roles"],
    queryFn: async (): Promise<RolHorario[]> => {
      const { data } = await sinTipar
        .from("roles_config")
        .select("name, hora_entrada, hora_salida, comida_min, bano_min, tolerancia_min")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as RolHorario[];
    },
    staleTime: 60_000,
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:p-6">
      <PageHeader icon={<Clock className="h-5 w-5" />} title={t("admin.horarios.titulo")} subtitle={t("admin.horarios.sub")} />
      <p className="mb-3 mt-1 rounded-panel border border-border/40 bg-card/30 px-3 py-2 text-xs text-muted-foreground">
        {t("admin.horarios.nota")}
      </p>
      {/* Tabs: Por rol / Por persona */}
      <div className="mb-4 inline-flex gap-1 rounded-panel border border-border/50 bg-card/30 p-1">
        {(["rol", "persona"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-control px-3 py-1.5 text-xs font-semibold transition ${
              tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t(k === "rol" ? "admin.horarios.tabRol" : "admin.horarios.tabPersona")}
          </button>
        ))}
      </div>

      {tab === "rol" ? (
        q.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t("admin.horarios.cargando")}</div>
        ) : (q.data ?? []).length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">{t("admin.horarios.sinRoles")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(q.data ?? []).map((rol) => <FilaRol key={rol.name} rol={rol} />)}
          </div>
        )
      ) : (
        <HorariosPorPersona />
      )}
    </div>
  );
}
