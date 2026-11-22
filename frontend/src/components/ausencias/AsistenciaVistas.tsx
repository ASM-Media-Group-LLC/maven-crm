import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import { useAsistencia, useSaldo } from "@/hooks/useAusencias";
import {
  ETIQUETA_ASIS, ETIQUETA_TIPO, ETIQUETA_VIVO, type FilaAsistencia, fueraPorDia, horaBogota, hoyBogota, lunesDe,
  minutosAHoras, primeroDelMes, rangoDias, resumirDia, sumarDias, tonoAsistencia, ultimoDelMes,
} from "@/lib/ausencias";
import { CAMPO, Fallo, Pastilla, useFechaCorta } from "./piezas";

// EL CALENDARIO DE ASISTENCIA (Alvaro, 20/11/2026). Una sola consulta
// (asistencia_dias) da, por persona y día: turno (aunque no se exija), si llegó,
// tarde, faltó, ausencia (tipo, pagada) o festivo, en vivo (hoy) y horas.
// Quién ve a quién lo decide el alcance de la fila «Ausencias» de su puesto o
// un permiso especial (servidor).

type Tr = ReturnType<typeof useLanguage>["t"];

function textoEstado(f: FilaAsistencia, t: Tr): string {
  if (f.estado === "tarde") return t("aus.asis.tarde", { n: f.tarde_min ?? 0 });
  if (f.estado === "ausente" && f.ausencia_tipo) return t(ETIQUETA_TIPO[f.ausencia_tipo]);
  if (f.estado === "festivo" && f.festivo) return f.festivo;
  return t(ETIQUETA_ASIS[f.estado]);
}

function PuntoVivo({ v }: { v: FilaAsistencia["en_vivo"] }) {
  const { t } = useLanguage();
  if (!v) return null;
  const color = v === "conectado" ? "bg-success" : v === "en_pausa" ? "bg-warning" : "bg-muted-foreground/40";
  return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />{t(ETIQUETA_VIVO[v])}</span>;
}

function useFiltro(filas: FilaAsistencia[]) {
  const [buscar, setBuscar] = useState("");
  const [equipo, setEquipo] = useState("");
  const equipos = useMemo(() => [...new Set(filas.map((f) => f.equipo ?? "—"))].sort(), [filas]);
  const vistas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => (!equipo || (f.equipo ?? "—") === equipo) && (!q || (f.nombre ?? "").toLowerCase().includes(q)));
  }, [filas, buscar, equipo]);
  return { buscar, setBuscar, equipo, setEquipo, equipos, vistas };
}

function BarraFiltro({ f }: { f: ReturnType<typeof useFiltro> }) {
  const { t } = useLanguage();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={f.buscar} onChange={(e) => f.setBuscar(e.target.value)} placeholder={t("hr.horEq.buscar")} className={`${CAMPO} w-full pl-8`} />
      </label>
      {f.equipos.length > 1 && (
        <select value={f.equipo} onChange={(e) => f.setEquipo(e.target.value)} aria-label={t("hr.horEq.equipo")} className={`${CAMPO} max-w-[9.5rem] sm:max-w-none`}>
          <option value="">{t("hr.horEq.todosEquipos")}</option>
          {f.equipos.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── Hoy ─────────────────────────────────────────────────────────────────────
export function AsistenciaHoy() {
  const { t } = useLanguage();
  const hoy = hoyBogota();
  const q = useAsistencia(hoy, hoy);
  const filas = useMemo(() => q.data ?? [], [q.data]);
  const f = useFiltro(filas);
  const r = resumirDia(f.vistas);
  if (q.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <Fallo texto="aus.asis.fallo" reintentar={() => void q.refetch()} />;
  if (filas.length === 0) return <p className="p-6 text-sm text-muted-foreground">{t("aus.asis.nadie")}</p>;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-border/40 p-3 sm:flex-row sm:items-center sm:p-4">
        <p className="shrink-0 text-sm font-medium text-foreground">{t("aus.asis.resumen", { p: r.presentes, t: r.tarde, f: r.faltaron, a: r.fuera })}</p>
        <BarraFiltro f={f} />
      </div>
      <ul className="divide-y divide-border/25">
        {f.vistas.map((x) => (
          <li key={x.user_id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <UserAvatar name={x.nombre ?? "—"} src={x.avatar_url ?? undefined} seed={x.avatar_seed ?? undefined} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{x.nombre ?? "—"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[x.equipo, x.turno_inicio && x.turno_fin ? t("aus.asis.turno", { a: horaBogota(x.turno_inicio), b: horaBogota(x.turno_fin) }) : null].filter(Boolean).join(" · ")}
                  {x.estado === "ausente" || x.estado === "festivo" ? ` · ${t("aus.asis.noSeExige")}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-11 sm:pl-0">
              <Pastilla className={tonoAsistencia(x.estado)}>{textoEstado(x, t)}</Pastilla>
              {x.ausencia_tipo && x.estado === "ausente" && x.ausencia_pagada != null && (
                <Pastilla className="bg-foreground/[0.05] text-muted-foreground">{t(x.ausencia_pagada ? "aus.pagada" : "aus.noPagada")}</Pastilla>
              )}
              {x.ausencia_parcial && x.ausencia_tipo && <Pastilla className="bg-foreground/[0.05] text-muted-foreground">{t(ETIQUETA_TIPO[x.ausencia_tipo])}</Pastilla>}
              {x.entrada_at && <span className="text-[11px] tabular-nums text-muted-foreground">{horaBogota(x.entrada_at)}</span>}
              {x.turno_min != null && x.trabajado_min != null && (
                <span className="text-[11px] tabular-nums text-muted-foreground">{t("aus.asis.horas", { a: minutosAHoras(x.trabajado_min), b: minutosAHoras(x.turno_min) })}</span>
              )}
              <PuntoVivo v={x.en_vivo} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Semana: personas × días ─────────────────────────────────────────────────
function Celda({ x }: { x: FilaAsistencia | undefined }) {
  const { t } = useLanguage();
  if (!x) return <div className="h-12 rounded-lg bg-foreground/[0.02]" />;
  const pendiente = x.ausencia_estado && x.ausencia_estado !== "aprobada";
  return (
    <div className={`flex h-12 flex-col justify-center rounded-lg px-1.5 text-[10px] leading-tight ${tonoAsistencia(x.estado)}`} title={textoEstado(x, t)}>
      <span className="truncate font-medium">{textoEstado(x, t)}</span>
      {x.turno_inicio && x.estado !== "ausente" && x.estado !== "festivo" && (
        <span className="truncate tabular-nums opacity-70">{horaBogota(x.turno_inicio)}–{horaBogota(x.turno_fin)}</span>
      )}
      {pendiente && x.ausencia_tipo && <span className="truncate opacity-70">{t(ETIQUETA_TIPO[x.ausencia_tipo])} · {t("aus.asis.pendienteAprobar")}</span>}
    </div>
  );
}

export function AsistenciaSemana() {
  const { t } = useLanguage();
  const fecha = useFechaCorta();
  const [lunes, setLunes] = useState(() => lunesDe(hoyBogota()));
  const domingo = sumarDias(lunes, 6);
  const q = useAsistencia(lunes, domingo);
  const filas = useMemo(() => q.data ?? [], [q.data]);
  const f = useFiltro(filas);
  const dias = rangoDias(lunes, domingo);
  const personas = useMemo(() => {
    const m = new Map<string, { nombre: string | null; avatar_url: string | null; avatar_seed: string | null; dias: Map<string, FilaAsistencia> }>();
    for (const x of f.vistas) {
      const p = m.get(x.user_id) ?? { nombre: x.nombre, avatar_url: x.avatar_url, avatar_seed: x.avatar_seed, dias: new Map() };
      p.dias.set(x.dia.slice(0, 10), x);
      m.set(x.user_id, p);
    }
    return [...m.entries()];
  }, [f.vistas]);
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-border/40 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t("aus.asis.anterior")} onClick={() => setLunes(sumarDias(lunes, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium tabular-nums">{fecha(lunes)} – {fecha(domingo)}</span>
          <Button variant="ghost" size="icon" aria-label={t("aus.asis.siguiente")} onClick={() => setLunes(sumarDias(lunes, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <BarraFiltro f={f} />
      </div>
      {q.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : q.isError ? <Fallo texto="aus.asis.fallo" reintentar={() => void q.refetch()} />
        : personas.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{t("aus.asis.nadie")}</p>
        : (
          <div className="overflow-x-auto">
            <div className="min-w-[44rem] p-3 sm:p-4">
              <div className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] gap-1 pb-1 text-[11px] text-muted-foreground">
                <span />
                {dias.map((d) => <span key={d} className="truncate px-1">{fecha(d, true)}</span>)}
              </div>
              {personas.map(([id, p]) => (
                <div key={id} className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] items-center gap-1 py-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={p.nombre ?? "—"} src={p.avatar_url ?? undefined} seed={p.avatar_seed ?? undefined} size="xs" />
                    <span className="truncate text-xs font-medium">{p.nombre ?? "—"}</span>
                  </span>
                  {dias.map((d) => <Celda key={d} x={p.dias.get(d)} />)}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Mes: quién está fuera cada día (cobertura) ──────────────────────────────
export function AsistenciaMes() {
  const { t } = useLanguage();
  const fecha = useFechaCorta();
  const [mes, setMes] = useState(() => primeroDelMes(hoyBogota()));
  const fin = ultimoDelMes(mes);
  // asistencia_dias acepta hasta 42 días: el mes entra completo.
  const q = useAsistencia(mes, fin);
  const filas = useMemo(() => q.data ?? [], [q.data]);
  const fuera = useMemo(() => fueraPorDia(filas), [filas]);
  const total = useMemo(() => new Set(filas.map((x) => x.user_id)).size, [filas]);
  const dias = rangoDias(mes, fin);
  const hueco = (new Date(`${mes}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cambiar = (n: number) => { const d = new Date(`${mes}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMes(d.toISOString().slice(0, 10)); };
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b border-border/40 p-3 sm:p-4">
        <Button variant="ghost" size="icon" aria-label={t("aus.asis.anterior")} onClick={() => cambiar(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium">{fecha(mes)} – {fecha(fin)}</span>
        <Button variant="ghost" size="icon" aria-label={t("aus.asis.siguiente")} onClick={() => cambiar(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      {q.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : q.isError ? <Fallo texto="aus.asis.fallo" reintentar={() => void q.refetch()} />
        : (
          <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-4 sm:p-4 lg:grid-cols-7">
            {Array.from({ length: hueco }).map((_, i) => <div key={`h${i}`} className="hidden lg:block" />)}
            {dias.map((d) => {
              const lista = fuera.get(d) ?? [];
              const festivo = filas.find((x) => x.dia.slice(0, 10) === d && x.festivo)?.festivo;
              const carga = total > 0 ? lista.length / total : 0;
              return (
                <div key={d} className={`flex min-h-[5.5rem] flex-col gap-1 rounded-lg p-2 ${carga >= 0.2 ? "bg-warning/15" : "bg-foreground/[0.035]"}`}>
                  <span className="text-[11px] font-medium text-foreground/80">{fecha(d, true)}</span>
                  {festivo && <span className="truncate text-[10px] text-muted-foreground">{festivo}</span>}
                  {lista.length > 0 && <span className="text-[11px] font-semibold text-foreground">{t("aus.asis.fueraDia", { n: lista.length })}</span>}
                  <span className="flex flex-wrap gap-0.5">
                    {lista.slice(0, 6).map((x) => (
                      <span key={x.user_id} title={`${x.nombre ?? "—"} · ${x.ausencia_tipo ? t(ETIQUETA_TIPO[x.ausencia_tipo]) : ""}`}>
                        <UserAvatar name={x.nombre ?? "—"} src={x.avatar_url ?? undefined} seed={x.avatar_seed ?? undefined} size="xs" />
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ─── Por persona: historial de 30 días + saldo ───────────────────────────────
export function AsistenciaPersona({ personas }: { personas: Array<{ user_id: string; nombre: string | null }> }) {
  const { t } = useLanguage();
  const fecha = useFechaCorta();
  const [uid, setUid] = useState<string>("");
  const hoy = hoyBogota();
  const desde = sumarDias(hoy, -29);
  const q = useAsistencia(desde, hoy, uid || null, !!uid);
  const saldo = useSaldo(uid || null);
  const filas = useMemo(() => [...(q.data ?? [])].reverse(), [q.data]);
  const tot = useMemo(() => ({
    tarde: filas.filter((x) => x.estado === "tarde").length,
    falto: filas.filter((x) => x.estado === "falto").length,
    fuera: filas.filter((x) => x.estado === "ausente").length,
  }), [filas]);
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3 sm:p-4">
        <select className={`${CAMPO} min-w-[12rem]`} value={uid} onChange={(e) => setUid(e.target.value)} aria-label={t("aus.asis.elegirPersona")}>
          <option value="">{t("aus.asis.elegirPersona")}</option>
          {personas.map((p) => <option key={p.user_id} value={p.user_id}>{p.nombre ?? "—"}</option>)}
        </select>
        {uid && saldo.data && (
          <Pastilla className="bg-foreground/[0.06] text-foreground">{t("aus.saldo.titulo")}: {t("aus.saldo.dias", { n: Math.max(0, saldo.data.disponibles - saldo.data.pendientes) })}</Pastilla>
        )}
      </div>
      {!uid ? null
        : q.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : q.isError ? <Fallo texto="aus.asis.fallo" reintentar={() => void q.refetch()} />
        : (
          <>
            <div className="flex flex-wrap gap-2 px-3 pt-3 text-xs text-muted-foreground sm:px-4">
              <span className="font-medium text-foreground">{t("aus.asis.historial")}</span>
              <span>{t("aus.asis.totTarde", { n: tot.tarde })}</span>·<span>{t("aus.asis.totFalto", { n: tot.falto })}</span>·<span>{t("aus.asis.totAusente", { n: tot.fuera })}</span>
            </div>
            <ul className="divide-y divide-border/25">
              {filas.map((x) => (
                <li key={x.dia} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm sm:px-4">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{fecha(x.dia.slice(0, 10), true)}</span>
                  <Pastilla className={tonoAsistencia(x.estado)}>{textoEstado(x, t)}</Pastilla>
                  {x.entrada_at && <span className="text-[11px] tabular-nums text-muted-foreground">{horaBogota(x.entrada_at)}</span>}
                  {x.turno_min != null && x.trabajado_min != null && <span className="text-[11px] tabular-nums text-muted-foreground">{t("aus.asis.horas", { a: minutosAHoras(x.trabajado_min), b: minutosAHoras(x.turno_min) })}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
    </div>
  );
}
