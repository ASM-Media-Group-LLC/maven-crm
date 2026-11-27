import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MonitorUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { CATALOGO_POSICIONES } from "@/lib/posiciones/catalogo";
import { accesosCombinados, alcancesCombinados, mismoConjunto, type AccesosPersonales, type PosicionPersonal } from "@/lib/posiciones/personas";

interface Props {
  persona: { id: string; full_name: string | null };
  posiciones: PosicionPersonal[];
  asignadas: string[];
  revision?: AccesosPersonales;
  onCerrar: () => void;
}

export function EditorAccesosPersona({ persona, posiciones, asignadas, revision, onCerrar }: Props) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  // A stable snapshot: a background refetch must not rewrite a reviewed draft.
  const [base] = useState(() => ({ posiciones, asignadas, denegadas: revision?.denegadas ?? [], revision: revision?.revision ?? 0 }));
  const [seleccionadas, setSeleccionadas] = useState(base.asignadas);
  const [denegadas, setDenegadas] = useState(base.denegadas);
  const [buscar, setBuscar] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState("");
  const funciones = CATALOGO_POSICIONES.flatMap(s => s.grupos.flatMap(g => g.filas.flatMap(f => f.funciones.map(funcion => ({ ...funcion, area: g.etiqueta, fila: f.etiqueta })))));
  const heredados = accesosCombinados(base.posiciones, seleccionadas, []);
  const antes = accesosCombinados(base.posiciones, base.asignadas, base.denegadas);
  const despues = accesosCombinados(base.posiciones, seleccionadas, denegadas);
  const alcanceAntes = alcancesCombinados(base.posiciones, base.asignadas, base.denegadas);
  const alcanceDespues = alcancesCombinados(base.posiciones, seleccionadas, denegadas);
  const cambios = funciones.filter(f => antes[f.clave] !== despues[f.clave] || alcanceAntes[f.clave] !== alcanceDespues[f.clave]);
  const alcanceTexto = (valor: string | null | undefined) => valor ? t(valor === "all" ? "posiciones.datos.all" : valor === "subordinates" ? "posiciones.datos.subordinates" : "posiciones.datos.self") : t("posiciones.revision.denegado");
  const pendiente = !mismoConjunto(seleccionadas, base.asignadas) || !mismoConjunto(denegadas, base.denegadas);
  const conflicto = (revision?.revision ?? 0) !== base.revision
    || !mismoConjunto(asignadas, base.asignadas)
    || base.posiciones.filter(p => seleccionadas.includes(p.id) || base.asignadas.includes(p.id))
      .some(p => posiciones.find(v => v.id === p.id)?.updated_at !== p.updated_at);
  const nombres = (ids: string[]) => base.posiciones.filter(p => ids.includes(p.id)).map(p => p.nombre).join(", ") || t("posiciones.personas.sinPosicion");
  const guardar = useMutation({
    mutationFn: async () => {
      const cliente = supabase as unknown as { rpc: (nombre: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
      const { error: fallo } = await cliente.rpc("persona_aplicar_accesos", {
        _user_id: persona.id, _revision: base.revision, _posiciones: seleccionadas, _denegadas: denegadas,
        _versiones: Object.fromEntries(base.posiciones.map(p => [p.id, p.updated_at])),
      });
      if (fallo) throw fallo;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["posiciones-borrador"] }),
        qc.invalidateQueries({ queryKey: ["mis-funciones-posicion"] }),
        qc.invalidateQueries({ queryKey: ["user-role"] }),
        qc.invalidateQueries({ queryKey: ["user-permissions"] }),
      ]);
      toast.success(t("posiciones.revision.aplicado"));
      onCerrar();
    },
    onError: (e: { message?: string }) => setError(e.message || t("posiciones.errorGuardar")),
  });
  // LO PRIMERO: ¿le pide cámara y pantalla? (Alvaro, 26/11/2026). Es lo que ve
  // Argos: si UNA de sus posiciones lo tiene apagado, queda apagado.
  const exigencias = useQuery({
    queryKey: ["exigencias-de", persona.id],
    queryFn: async () => {
      const cliente = supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
      const { data, error: e } = await cliente.rpc("exigencias_de_varios", { _ids: [persona.id] });
      if (e) throw e;
      const fila = ((data ?? []) as Array<{ camara: boolean; pantalla: boolean }>)[0];
      return fila ?? null;
    },
  });
  const cambiar = (valores: string[], clave: string, marcado: boolean) => marcado ? [...new Set([...valores, clave])] : valores.filter(k => k !== clave);

  return <Dialog open onOpenChange={open => { if (!open && !guardar.isPending) onCerrar(); }}>
    <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>{t("posiciones.personas.editor.titulo", { nombre: persona.full_name ?? "" })}</DialogTitle>
        <DialogDescription>{t("posiciones.personas.editor.descripcion")}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
        {exigencias.data && <div className="flex flex-wrap items-center gap-2 rounded-control border border-border p-3 text-sm" data-encendido>
          {([["camara", Camera, exigencias.data.camara], ["pantalla", MonitorUp, exigencias.data.pantalla]] as const).map(([k, Icono, on]) => (
            <span key={k} data-exigencia={k} data-encendida={on} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              <Icono className="h-3.5 w-3.5" aria-hidden />{t(k === "camara" ? "posiciones.encendido.camara" : "posiciones.encendido.pantalla")}: {on ? t("posiciones.encendido.si") : t("posiciones.encendido.no")}
            </span>
          ))}
          <span className="text-xs text-muted-foreground">{t("posiciones.encendido.ayuda")}</span>
        </div>}
        {conflicto && <p role="alert" className="rounded-control border border-warning p-3 text-sm">{t("posiciones.personas.editor.conflicto")}</p>}
        {revisando ? <>
          <div className="grid gap-3 rounded-control border border-border p-4 text-sm sm:grid-cols-2">
            <div><p className="font-medium">{t("posiciones.personas.editor.antes")}</p><p>{nombres(base.asignadas)}</p></div>
            <div><p className="font-medium">{t("posiciones.personas.editor.despues")}</p><p>{nombres(seleccionadas)}</p></div>
          </div>
          <p className="text-sm">{t("posiciones.personas.editor.resumen", { n: Object.values(despues).filter(Boolean).length, r: denegadas.length })}</p>
          {cambios.length === 0 && <p className="text-sm text-muted-foreground">{t("posiciones.personas.editor.mismosAccesos")}</p>}
          <ul className="divide-y divide-border text-sm">{cambios.map(f => <li key={f.clave} className="flex justify-between gap-3 py-2">
            <span>{t(f.etiqueta)}<span className="block text-xs text-muted-foreground">{t(f.area)} · {t(f.fila)}</span></span><span className="text-right">{t(antes[f.clave] ? "posiciones.revision.permitido" : "posiciones.revision.denegado")} → {t(despues[f.clave] ? "posiciones.revision.permitido" : "posiciones.revision.denegado")}
              {(f.clave in alcanceAntes || f.clave in alcanceDespues) && <span className="block text-xs text-muted-foreground">{alcanceTexto(alcanceAntes[f.clave])} → {alcanceTexto(alcanceDespues[f.clave])}</span>}
            </span>
          </li>)}</ul>
          <p className="text-xs text-muted-foreground">{t("posiciones.personas.editor.soloPersona")}</p>
        </> : <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t("posiciones.personas.col.posiciones")}</h3>
            <div className="grid gap-2 sm:grid-cols-2">{base.posiciones.map(p => <label key={p.id} className="flex items-center gap-2 rounded-control border border-border p-3 text-sm">
              <Checkbox checked={seleccionadas.includes(p.id)} disabled={!p.activa && !base.asignadas.includes(p.id)}
                onCheckedChange={v => setSeleccionadas(cambiar(seleccionadas, p.id, v === true))} />
              <span>{p.nombre}{!p.activa && <span className="ml-1 text-muted-foreground">({t("posiciones.estado.inactivas")})</span>}</span>
            </label>)}</div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t("posiciones.personas.editor.restricciones")}</h3>
            <p className="text-xs text-muted-foreground">{t("posiciones.personas.editor.denegarAyuda")}</p>
            <Input value={buscar} onChange={e => setBuscar(e.target.value)} aria-label={t("posiciones.personas.editor.buscar")} placeholder={t("posiciones.personas.editor.buscar")} />
            {CATALOGO_POSICIONES.map(s => <div key={s.seccion} className="space-y-2">{s.grupos.map(g => {
              const filas = g.filas.flatMap(f => f.funciones.map(funcion => ({ ...funcion, fila: f.etiqueta }))).filter(f => !buscar || `${t(g.etiqueta)} ${t(f.fila)} ${t(f.etiqueta)}`.toLocaleLowerCase().includes(buscar.toLocaleLowerCase()));
              if (!filas.length) return null;
              return <details key={g.grupo} open={!!buscar || undefined} className="rounded-control border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{t(g.etiqueta)}</summary>
                <div className="divide-y divide-border px-3">{filas.map(f => <label key={f.clave} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>{t(f.etiqueta)}<span className="block text-xs text-muted-foreground">{t(heredados[f.clave] ? "posiciones.personas.editor.heredado" : "posiciones.personas.editor.sinConcesion")}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-xs"><Checkbox checked={denegadas.includes(f.clave)}
                    disabled={!heredados[f.clave] && !denegadas.includes(f.clave)}
                    aria-label={t("posiciones.personas.editor.bloquearFuncion", { funcion: t(f.etiqueta) })}
                    onCheckedChange={v => setDenegadas(cambiar(denegadas, f.clave, v === true))} />{t("posiciones.personas.editor.bloquear")}</span>
                </label>)}</div>
              </details>;
            })}</div>)}
          </section>
        </>}
      </div>
      {/* El error TAMBIÉN junto a «Aplicar» (Grace, 26/11/2026): arriba quedaba
          fuera de la vista con la lista larga y parecía que el botón no hacía nada. */}
      {error && <p role="alert" data-error-aplicar className="rounded-control border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={guardar.isPending} onClick={() => revisando ? setRevisando(false) : onCerrar()}>{t(revisando ? "posiciones.revision.seguir" : "posiciones.dialogo.cancelar")}</Button>
        <Button disabled={!pendiente || conflicto || guardar.isPending} onClick={() => { setError(""); if (revisando) guardar.mutate(); else setRevisando(true); }}>
          {t(guardar.isPending ? "posiciones.revision.aplicando" : revisando ? "posiciones.revision.aplicar" : "posiciones.revision.revisar")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
