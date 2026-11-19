import { useState } from "react";
import { Coffee, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { type Modalidad, useGuardarModalidad, useModalidades } from "@/hooks/usePausas";

// LAS MODALIDADES DE PAUSA DE LA EMPRESA (Alvaro, 19/11/2026): «en mi empresa
// van a haber 1 hora y de 30, 2 seteos». Las ve todo el que entra a Horarios
// del equipo; solo el dueño y quien tenga N:pausas.modalidades (Admin) las crea
// o les cambia los minutos. El baño es un cupo total por turno.

const CAMPO = "h-9 w-16 rounded-lg border border-input bg-background/50 px-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

function FilaModalidad({ m, editable }: { m: Modalidad | null; editable: boolean }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarModalidad();
  const [nombre, setNombre] = useState(m?.nombre ?? "");
  const [comida, setComida] = useState(String(m?.comida_min ?? 30));
  const [bano, setBano] = useState(String(m?.bano_min ?? 10));
  const cambiado = !m || nombre !== m.nombre || Number(comida) !== m.comida_min || Number(bano) !== m.bano_min;
  const valido = nombre.trim().length > 0 && Number.isInteger(Number(comida)) && Number(comida) >= 0 && Number(comida) <= 240
    && Number.isInteger(Number(bano)) && Number(bano) >= 0 && Number(bano) <= 120;

  const enviar = () => guardar.mutate(
    { id: m?.id ?? null, nombre, comida_min: Number(comida), bano_min: Number(bano), activa: m?.activa ?? true },
    {
      onSuccess: () => { toast({ title: t("hr.pausas.guardada") }); if (!m) { setNombre(""); setComida("30"); setBano("10"); } },
      onError: (e) => toast({ title: t("hr.pausas.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
    },
  );

  const contenidoBoton = guardar.isPending
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : m ? <>{t("hr.pausas.guardar")}</> : <><Plus className="mr-1 h-4 w-4" />{t("hr.pausas.agregar")}</>;

  if (!editable && m) {
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="font-medium text-foreground">{m.nombre}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{t("hr.pausas.minutos", { a: m.comida_min, b: m.bano_min })}</span>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <input className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("hr.pausas.nombre")} maxLength={60} aria-label={t("hr.pausas.nombre")} />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t("hr.pausas.almuerzo")}
        <input className={CAMPO} inputMode="numeric" value={comida} onChange={(e) => setComida(e.target.value.replace(/\D/g, ""))} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {t("hr.pausas.bano")}
        <input className={CAMPO} inputMode="numeric" value={bano} onChange={(e) => setBano(e.target.value.replace(/\D/g, ""))} />
      </label>
      {m && <span className="text-[11px] text-muted-foreground">{t("hr.pausas.uso", { p: m.puestos, n: m.personas })}</span>}
      <Button size="sm" className="h-9 rounded-lg" disabled={!cambiado || !valido || guardar.isPending} onClick={enviar}>
        {contenidoBoton}
      </Button>
    </li>
  );
}

export function ModalidadesPausa() {
  const { t } = useLanguage();
  const q = useModalidades();
  return (
    <section className="vidrio overflow-hidden p-0">
      <header className="flex items-start gap-3 border-b border-border/50 px-4 py-3">
        <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("hr.pausas.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{q.data?.puede_editar ? t("hr.pausas.subEditar") : t("hr.pausas.subVer")}</p>
        </div>
      </header>
      {q.isLoading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : q.isError || !q.data ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground">
          {t("hr.pausas.error")}
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {q.data.modalidades.map((m) => <FilaModalidad key={`${m.id}-${m.comida_min}-${m.bano_min}-${m.nombre}`} m={m} editable={q.data!.puede_editar} />)}
          {q.data.puede_editar && <FilaModalidad m={null} editable />}
        </ul>
      )}
    </section>
  );
}
