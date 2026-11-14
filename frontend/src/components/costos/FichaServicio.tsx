import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/useLanguage";
import { mensual, num, tablero, type Cobro, type CuentaAtada, type ServicioCosto, type Tablero } from "@/lib/costos";
import { SeccionCuentas } from "./CuentasAtadas";
import { exacto, hoyEnColombia, nombreDeMes, redondo } from "./comun";

// LA FICHA DE UN SERVICIO (Costos y conexiones, solo el dueño). Se abre al tocar
// un servicio en «Por parte de Maven», «Por proveedor» o «Dónde puedes recortar»:
// lo que gastó Maven este mes y en el año, el precio, cada cobro, sus cuentas
// atadas, cómo ahorrar y el enlace a la factura del proveedor.

/** Dónde ver la factura de cada servicio (se abre en otra pestaña). */
const PANEL: Record<string, string> = {
  google_ia: "https://aistudio.google.com/spend",
  elevenlabs: "https://elevenlabs.io/app/subscription",
  supabase_maven: "https://supabase.com/dashboard/org/tefbnffbghmtkjisjwcs/billing",
  supabase_otros: "https://supabase.com/dashboard/org/tefbnffbghmtkjisjwcs/billing",
  contabo_principal: "https://my.contabo.com/invoices",
  contabo_llamadas: "https://my.contabo.com/invoices",
  resend: "https://resend.com/settings/billing",
  zoho: "https://mailadmin.zoho.com",
  godaddy_maven: "https://account.godaddy.com/myrenewals",
  github: "https://github.com/organizations/ASM-Media-Group-LLC/settings/billing",
};

/** «Lo revisé» (con dónde) o «no lo puedo ver, déjame entrar», en una línea. */
export function Revisado({ servicio: s }: { servicio: ServicioCosto }) {
  const noLoVeo = s.fuente === "falta";
  if (!s.revisado) return null;
  return (
    <span className={`mt-0.5 flex items-start gap-1 text-[11px] ${noLoVeo ? "text-warning" : "text-muted-foreground/80"}`}>
      {noLoVeo ? <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> : <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-success" />}
      <span className="min-w-0">{s.revisado}</span>
    </span>
  );
}

/** ¿La fecha (YYYY-MM-DD) es después de hoy? */
function esFutura(fecha: string, hoy: string): boolean {
  return fecha.localeCompare(hoy) > 0;
}

export type Ficha = Tablero["porServicio"][number];

/** La ficha que se abre: la de un servicio de Maven (con lo que gastó) o, si
 *  no es Maven (los otros proyectos de Supabase), solo su precio y sus cuentas. */
export function fichaDe(id: string, tb: Tablero, servicios: ServicioCosto[]): Ficha | null {
  const deMaven = tb.porServicio.find((p) => p.servicio.id === id);
  if (deMaven) return deMaven;
  const s = servicios.find((x) => x.id === id && x.activo);
  return s ? { servicio: s, mes: { gastado: 0, proyectado: 0 }, alMes: mensual(s) ?? 0, ano: 0 } : null;
}

/** La ficha de un servicio: lo pagado este mes y en el año, el precio, cada cobro, sus cuentas atadas y cómo ahorrar. */
export function FichaServicio({ ficha, cobros, hoy, idioma, nombreMes, cuentas }: {
  ficha: Ficha; cobros: Cobro[]; hoy: string; idioma: string; nombreMes: string;
  cuentas: UseQueryResult<CuentaAtada[]>;
}) {
  const { t } = useLanguage();
  const { servicio: s, mes, alMes, ano } = ficha;
  const pasados = cobros.filter((c) => !esFutura(c.fecha, hoy)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anunciados = cobros.filter((c) => esFutura(c.fecha, hoy));
  const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString(idioma, { day: "numeric", month: "short", year: "numeric" });
  const panel = PANEL[s.id];
  const falta = s.monto_usd === null;
  // Lo que no es Maven no tiene «gastado por Maven»: se muestra solo su precio.
  const sinGasto = falta || !s.es_maven;
  // Si sus cuentas ya dicen cuánto se ahorra, el ahorro del servicio no se repite.
  const ahorroEnCuentas = (cuentas.data ?? []).some((c) => c.servicio_id === s.id && (num(c.ahorro_usd_mes) ?? 0) > 0);
  return (
    <div className="flex flex-col gap-5">
      <SheetHeader className="text-left">
        <SheetTitle className="text-base">{s.nombre}</SheetTitle>
        <SheetDescription>{s.proveedor}</SheetDescription>
        <Revisado servicio={s} />
      </SheetHeader>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border/50 bg-border/50">
        {[
          [t("oficina.costos.colPagadoMes", { mes: nombreMes }), sinGasto ? "—" : exacto(mes.gastado)],
          [t("oficina.costos.colFaltaMes", { mes: nombreMes }), sinGasto ? "—" : exacto(Math.max(0, mes.proyectado - mes.gastado))],
          [t("oficina.costos.colPagadoAno", { a: hoy.slice(0, 4) }), sinGasto ? "—" : exacto(ano)],
          [t("oficina.costos.colPrecio"), falta ? "—" : exacto(alMes)],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-3">
            <div className="text-lg font-semibold tabular-nums leading-tight">{v}</div>
            <div className="text-[11px] text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>

      {s.como_se_calcula && (
        <div className="rounded-panel bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t("oficina.costos.comoSeCalcula")} </span>{s.como_se_calcula}
        </div>
      )}
      {s.detalle && <p className="text-sm text-muted-foreground">{s.detalle}</p>}
      {s.proximo_detalle && <p className="text-sm text-warning">{s.proximo_detalle}</p>}

      {s.es_maven && (anunciados.length > 0 || (s.dia_cobro && !falta)) && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("oficina.costos.fichaProximo")}</h3>
          {anunciados.map((c) => (
            <div key={`${c.fecha}-${c.monto_usd}`} className="flex items-center justify-between text-sm">
              <span>{fecha(c.fecha)}{c.nota && <span className="block text-[11px] text-muted-foreground">{c.nota}</span>}</span>
              <span className="font-semibold tabular-nums">{exacto(Number(c.monto_usd))}</span>
            </div>
          ))}
          {anunciados.length === 0 && s.dia_cobro && !falta && (
            <p className="text-sm">{t("oficina.costos.fichaCadaMes", { d: s.dia_cobro, m: exacto(Number(s.monto_usd)) })}</p>
          )}
        </div>
      )}

      {s.es_maven && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("oficina.costos.fichaCobros", { n: pasados.length })}</h3>
          {pasados.length === 0 ? <p className="text-xs text-muted-foreground">{t("oficina.costos.fichaSinCobros")}</p> : (
            <ul className="flex flex-col divide-y divide-border/40 rounded-panel border border-border/50">
              {pasados.map((c, i) => (
                <li key={`${c.fecha}-${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{fecha(c.fecha)}</span>
                  <span className="min-w-0 truncate text-xs">{c.nota ?? ""}{c.fuente === "estimado" ? ` · ${t("oficina.costos.fuente.estimado").toLowerCase()}` : ""}</span>
                  <span className="text-sm font-semibold tabular-nums">{exacto(Number(c.monto_usd))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SeccionCuentas servicioId={s.id} cuentas={cuentas} />

      {s.ahorro_detalle && Number(s.ahorro_usd) > 0 && !ahorroEnCuentas && (
        <div className="rounded-panel border border-success/30 bg-success/5 p-3">
          <div className="text-base font-semibold tabular-nums text-success">{t("oficina.costos.fichaAhorro", { m: redondo(Number(s.ahorro_usd)) })}</div>
          <p className="text-xs text-muted-foreground">{s.ahorro_detalle}</p>
        </div>
      )}

      {panel && (
        <a href={panel} target="_blank" rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          <ExternalLink className="h-4 w-4" />{t("oficina.costos.fichaPanel", { p: s.proveedor })}
        </a>
      )}
    </div>
  );
}

/** La hoja de la derecha con la ficha del servicio `id` (null = cerrada). */
export function HojaFicha({ id, servicios, cobros, cuentas, onCerrar }: {
  id: string | null; servicios: ServicioCosto[]; cobros: Cobro[]; cuentas: UseQueryResult<CuentaAtada[]>; onCerrar: () => void;
}) {
  const { language } = useLanguage();
  const hoy = hoyEnColombia();
  const ficha = id ? fichaDe(id, tablero(servicios, cobros, hoy), servicios) : null;
  return (
    <Sheet open={!!ficha} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {ficha && (
          <FichaServicio ficha={ficha} cobros={cobros.filter((c) => c.servicio_id === ficha.servicio.id)} hoy={hoy}
            idioma={language} nombreMes={nombreDeMes(hoy, language)} cuentas={cuentas} />
        )}
      </SheetContent>
    </Sheet>
  );
}
