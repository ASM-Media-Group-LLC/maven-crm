import { useState } from "react";
import { Layers, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import {
  type AreaEmpresa, type PuestoArea,
  useAreasEmpresa, useBorrarArea, useGuardarArea, useGuardarAreaPuesto,
} from "@/hooks/useAreasEmpresa";

// LAS ÁREAS DE LA EMPRESA (Alvaro, 28/11/2026): cada empresa crea las suyas
// («Chat», «Ventas»…) y cada posición elige a cuál pertenece. Sirven para
// filtrar Argos → Shift. La lista empieza vacía en cada empresa: nada viene
// escrito para una en particular. Cambian: dueño, quien configura la empresa y RR. HH.

const CAMPO = "h-9 min-w-0 flex-1 rounded-lg border border-input bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

function FilaArea({ x, editable }: { x: AreaEmpresa | null; editable: boolean }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarArea();
  const borrar = useBorrarArea();
  const [nombre, setNombre] = useState(x?.nombre ?? "");
  const cambiado = !x || nombre.trim() !== x.nombre;
  const valido = nombre.trim().length > 0;
  const fallo = (e: unknown) => toast({ title: t("hr.areas.noSeGuardo"), description: (e as Error).message, variant: "destructive" });
  const enviar = () => guardar.mutate({ id: x?.id ?? null, nombre }, {
    onSuccess: () => { toast({ title: t("hr.areas.guardada") }); if (!x) setNombre(""); },
    onError: fallo,
  });

  if (!editable && x) {
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="font-medium text-foreground">{x.nombre}</span>
        <span className="text-xs text-muted-foreground">{t("hr.areas.uso", { n: x.puestos })}</span>
      </li>
    );
  }
  const contenidoBoton = guardar.isPending
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : x ? <>{t("hr.turnosEmp.guardar")}</> : <><Plus className="mr-1 h-4 w-4" />{t("hr.turnosEmp.agregar")}</>;
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <input className={CAMPO} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40}
        placeholder={t("hr.areas.nombre")} aria-label={t("hr.areas.nombre")}
        onKeyDown={(e) => { if (e.key === "Enter" && cambiado && valido) enviar(); }} />
      {x && <span className="text-[11px] text-muted-foreground">{t("hr.areas.uso", { n: x.puestos })}</span>}
      <Button size="sm" className="h-9 rounded-lg" disabled={!cambiado || !valido || guardar.isPending} onClick={enviar}>
        {contenidoBoton}
      </Button>
      {x && (
        <Button size="sm" variant="ghost" className="h-9 rounded-lg px-2 text-muted-foreground hover:text-destructive"
          disabled={borrar.isPending} aria-label={t("hr.areas.borrarDe", { a: x.nombre })}
          onClick={() => { if (window.confirm(t("hr.areas.confirmarBorrar", { a: x.nombre }))) borrar.mutate(x.id, { onError: fallo }); }}>
          {borrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      )}
    </li>
  );
}

function FilaPuesto({ p, areas, editable }: { p: PuestoArea; areas: AreaEmpresa[]; editable: boolean }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarAreaPuesto();
  const actual = areas.find((a) => a.id === p.area_id) ?? null;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{p.nombre}</span>
        <span className="block text-[11px] text-muted-foreground">{t("hr.turnosEmp.personas", { n: p.personas })}</span>
      </span>
      {editable ? (
        <select
          className="h-9 shrink-0 rounded-lg border border-input bg-background/50 px-2 text-sm"
          value={p.area_id ?? ""}
          disabled={guardar.isPending}
          aria-label={t("hr.areas.areaDe", { p: p.nombre })}
          onChange={(e) => guardar.mutate({ posicion: p.id, area: e.target.value || null }, {
            onError: (err) => toast({ title: t("hr.areas.noSeGuardo"), description: (err as Error).message, variant: "destructive" }),
          })}
        >
          <option value="">{t("hr.areas.sinArea")}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">{actual?.nombre ?? t("hr.areas.sinArea")}</span>
      )}
    </li>
  );
}

export function AreasEmpresa() {
  const { t } = useLanguage();
  const q = useAreasEmpresa();
  return (
    <section className="vidrio overflow-hidden p-0">
      <header className="flex items-start gap-3 border-b border-border/50 px-4 py-3">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("hr.areas.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("hr.areas.sub")}</p>
        </div>
      </header>
      {q.isLoading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : q.isError || !q.data ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground">
          {t("hr.areas.error")}
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/40">
            {q.data.areas.length === 0 && !q.data.puede_editar && (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t("hr.areas.vacia")}</li>
            )}
            {q.data.areas.map((x) => <FilaArea key={`${x.id}-${x.nombre}`} x={x} editable={q.data!.puede_editar} />)}
            {q.data.puede_editar && <FilaArea x={null} editable />}
          </ul>
          {q.data.areas.length > 0 && q.data.puestos.length > 0 && (
            <>
              <p className="border-t border-border/50 px-4 pb-1 pt-3 text-xs text-muted-foreground">{t("hr.areas.porPuesto")}</p>
              <ul className="divide-y divide-border/40">
                {q.data.puestos.map((p) => <FilaPuesto key={p.id} p={p} areas={q.data!.areas} editable={q.data!.puede_editar} />)}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
