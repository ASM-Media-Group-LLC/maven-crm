import { useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import {
  ESTADOS_CUENTA, contarCuentas, dondeBajarCostos, licenciasQueSobran, ordenarCuentas, num, usd,
  type Candidato, type ConteoCuentas, type CuentaAtada, type EstadoCasillaZoho, type EstadoCuenta,
  type ServicioCosto, type ZohoEnVivo,
} from "@/lib/costos";

// CUENTAS ATADAS (Alvaro, 11/11/2026: «no me dijiste cuántas cuentas había
// atadas para poder bajar costos»). Dentro del diseño «A · Una cifra»: un solo
// color (el de Maven) para lo que se puede soltar, contorno para lo que no se
// ve, números como fichas y barras. Tres piezas:
//   · BloqueBajarCostos: arriba en el tablero, cuánto podrías bajar al mes y
//     dónde, servicio por servicio (sea o no Maven).
//   · SeccionCuentas: en la ficha de cada servicio, sus casillas, proyectos,
//     llaves, servidores y puestos, con su estado y su ahorro.
//   · ZohoEnVivo: en la ficha de Zoho, las licencias y cada casilla leídas en
//     vivo (edge conexiones-ping, accion zoho_casillas). Solo lee.
// Un fallo se dice como fallo, con Reintentar; nunca como «no hay nada».

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

const exacto = (n: number) => usd(Math.round(n * 100) / 100);
const redondo = (n: number) => usd(Math.round(n));

const CLAVE_ESTADO: Record<EstadoCuenta, TranslationKey> = {
  en_uso: "oficina.costos.cuentas.estado.en_uso",
  sin_uso: "oficina.costos.cuentas.estado.sin_uso",
  de_alguien_que_salio: "oficina.costos.cuentas.estado.de_alguien_que_salio",
  no_se_puede_ver: "oficina.costos.cuentas.estado.no_se_puede_ver",
};
const CLAVE_CASILLA: Record<EstadoCasillaZoho, TranslationKey> = {
  en_uso: "oficina.costos.cuentas.estado.en_uso",
  sin_uso: "oficina.costos.cuentas.estado.sin_uso",
  de_alguien_que_salio: "oficina.costos.cuentas.estado.de_alguien_que_salio",
  sin_cuenta_en_maven: "oficina.costos.zoho.sinCuenta",
};
/** Un solo acento: lo que se puede soltar va en el color de Maven; lo demás, en gris. */
const CHIP: Record<EstadoCuenta | EstadoCasillaZoho, string> = {
  en_uso: "border border-border/70 text-muted-foreground",
  sin_uso: "bg-primary/10 text-primary",
  de_alguien_que_salio: "bg-primary/10 text-primary",
  no_se_puede_ver: "border border-dashed border-border text-muted-foreground",
  sin_cuenta_en_maven: "border border-dashed border-border text-muted-foreground",
};

export function usarCuentas() {
  return useQuery({
    queryKey: ["costos-cuentas"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.from("costos_cuentas").select("*").order("orden");
      if (error) throw new Error(error.message);
      return (data ?? []) as CuentaAtada[];
    },
  });
}

const CLAVE_CHIP: Record<EstadoCuenta | EstadoCasillaZoho, TranslationKey> = { ...CLAVE_ESTADO, ...CLAVE_CASILLA };

function Chip({ estado }: { estado: EstadoCuenta | EstadoCasillaZoho }) {
  const { t } = useLanguage();
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${CHIP[estado]}`}>{t(CLAVE_CHIP[estado])}</span>;
}

function Fallo({ onReintentar }: { onReintentar: () => void }) {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{t("oficina.costos.fallo")}</span>
      <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
        <RefreshCw className="h-3.5 w-3.5" />{t("oficina.costos.reintentar")}
      </button>
    </div>
  );
}

const Cargando = () => <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

/** «13 de gente que salió · 3 sin uso». */
function lineaDeConteo(k: ConteoCuentas, t: (c: TranslationKey, p?: Record<string, string | number>) => string): string {
  const partes: string[] = [];
  if (k.de_alguien_que_salio) partes.push(t("oficina.costos.bajar.salieron", { n: k.de_alguien_que_salio }));
  if (k.sin_uso) partes.push(t("oficina.costos.bajar.sinUso", { n: k.sin_uso }));
  return partes.join(" · ");
}

/** Ancho de la barra de un ahorro, contra el más grande (mínimo 4 % para que se vea). */
function anchoDeBarra(ahorro: number, mayor: number): string {
  return `${Math.max(4, Math.min(100, (ahorro / Math.max(mayor, 1)) * 100))}%`;
}

function FilaCandidato({ c, mayor, onAbrir }: { c: Candidato; mayor: number; onAbrir: (id: string) => void }) {
  const { t } = useLanguage();
  const s = c.servicio;
  const conteo = c.conteo && c.conteo.liberables > 0 ? lineaDeConteo(c.conteo, t) : "";
  return (
    <li>
      <button type="button" onClick={() => onAbrir(s.id)}
        className="grid w-full grid-cols-1 gap-2 border-b border-border/40 py-3 text-left transition hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_9.5rem] sm:items-center sm:gap-5">
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{s.nombre}</span>
            {!s.es_maven && <span className="text-[11px] text-muted-foreground">{t("oficina.costos.bajar.noEsMaven")}</span>}
          </span>
          {s.ahorro_detalle && <span className="mt-0.5 block text-xs text-muted-foreground">{s.ahorro_detalle}</span>}
          {conteo && <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{conteo}</span>}
        </span>
        <span className="flex flex-col gap-1.5 sm:items-end">
          {c.ahorro !== null ? (
            <>
              <span className="font-display text-sm font-semibold tabular-nums">{t("oficina.costos.bajar.menos", { m: exacto(c.ahorro) })}</span>
              <span className="h-[3px] w-full overflow-hidden rounded-full bg-border/60" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: anchoDeBarra(c.ahorro, mayor) }} />
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t("oficina.costos.bajar.sinPrecioFila")}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** «Dónde puedes bajar costos»: la suma de lo que podrías bajar al mes y, por
 *  servicio, qué soltar. Toca uno y se abre su ficha con sus cuentas. */
export function BloqueBajarCostos({ servicios, cuentas, onAbrir }: {
  servicios: ServicioCosto[]; cuentas: UseQueryResult<CuentaAtada[]>; onAbrir: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <section className="vidrio sube flex flex-col gap-4 p-5" aria-labelledby="bajar-costos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bajar-costos" className="text-sm font-semibold text-muted-foreground">{t("oficina.costos.bajar.titulo")}</h2>
        <span className="text-xs text-muted-foreground">{t("oficina.costos.bajar.toca")}</span>
      </div>
      {cuentas.isLoading ? <Cargando />
        : cuentas.isError || !cuentas.data ? <Fallo onReintentar={() => void cuentas.refetch()} />
        : <ContenidoBajar servicios={servicios} cuentas={cuentas.data} onAbrir={onAbrir} />}
    </section>
  );
}

function ContenidoBajar({ servicios, cuentas, onAbrir }: { servicios: ServicioCosto[]; cuentas: CuentaAtada[]; onAbrir: (id: string) => void }) {
  const { t } = useLanguage();
  const activos = new Set(servicios.filter((s) => s.activo).map((s) => s.id));
  const { candidatos, total, sinPrecio } = dondeBajarCostos(servicios, cuentas);
  const k = contarCuentas(cuentas.filter((c) => activos.has(c.servicio_id)));
  const mayor = candidatos.reduce((a, c) => Math.max(a, c.ahorro ?? 0), 0);
  if (candidatos.length === 0) return <p className="text-sm text-muted-foreground">{t("oficina.costos.bajar.nada")}</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-8">
      <div className="flex flex-col gap-1">
        <span className="font-display text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{redondo(total)}</span>
        <span className="text-sm text-muted-foreground">{t("oficina.costos.bajar.cifra")}</span>
        {sinPrecio > 0 && <span className="text-xs text-muted-foreground">{t("oficina.costos.bajar.sinPrecio", { n: sinPrecio })}</span>}
        {k.total > 0 && (
          <span className="mt-3 text-xs text-muted-foreground/90">
            {t("oficina.costos.bajar.revise", { t: k.total, u: k.en_uso, s: k.sin_uso, g: k.de_alguien_que_salio, v: k.no_se_puede_ver })}
          </span>
        )}
      </div>
      <ul className="flex flex-col">
        {candidatos.map((c) => <FilaCandidato key={c.servicio.id} c={c} mayor={mayor} onAbrir={onAbrir} />)}
      </ul>
    </div>
  );
}

/** Las cuentas atadas de un servicio, dentro de su ficha. Si el servicio no
 *  tiene ninguna registrada, no se muestra nada (eso no es un fallo). */
export function SeccionCuentas({ servicioId, cuentas }: { servicioId: string; cuentas: UseQueryResult<CuentaAtada[]> }) {
  const { t } = useLanguage();
  const titulo = <h3 className="text-xs font-semibold text-muted-foreground">{t("oficina.costos.cuentas.titulo")}</h3>;
  if (cuentas.isLoading) return <div className="flex flex-col gap-1.5">{titulo}<Cargando /></div>;
  if (cuentas.isError || !cuentas.data) return <div className="flex flex-col gap-1.5">{titulo}<Fallo onReintentar={() => void cuentas.refetch()} /></div>;
  const propias = ordenarCuentas(cuentas.data.filter((c) => c.servicio_id === servicioId));
  if (propias.length === 0) return servicioId === "zoho" ? <ZohoEnVivoPanel /> : null;
  const k = contarCuentas(propias);
  const revisados = [...new Set(propias.map((c) => c.revisado).filter((r): r is string => !!r))];
  return (
    <div className="flex flex-col gap-2.5">
      {titulo}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border/50 bg-border/50">
        {ESTADOS_CUENTA.filter((e) => k[e] > 0).map((e) => (
          <div key={e} className="bg-card p-3">
            <div className="font-display text-lg font-semibold tabular-nums leading-tight">{k[e]}</div>
            <div className="text-[11px] text-muted-foreground">{t(CLAVE_ESTADO[e])}</div>
          </div>
        ))}
      </div>
      {k.ahorro > 0 && <p className="text-sm">{t("oficina.costos.cuentas.siSueltas", { m: exacto(k.ahorro) })}</p>}
      {servicioId === "zoho" && <ZohoEnVivoPanel />}
      <ul className="flex flex-col divide-y divide-border/40 rounded-panel border border-border/50">
        {propias.map((c) => <FilaCuenta key={c.id} c={c} />)}
      </ul>
      {revisados.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          <span className="font-semibold">{t("oficina.costos.cuentas.comoLoRevise")}</span>
          {revisados.map((r) => <span key={r}>{r}</span>)}
        </div>
      )}
    </div>
  );
}

function FilaCuenta({ c }: { c: CuentaAtada }) {
  const { t } = useLanguage();
  const ahorro = num(c.ahorro_usd_mes);
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-words text-sm font-medium">{c.nombre}</span>
        <Chip estado={c.estado} />
      </div>
      {c.detalle && <p className="text-xs text-muted-foreground">{c.detalle}</p>}
      {ahorro !== null && ahorro > 0 && <span className="text-xs font-semibold tabular-nums">{t("oficina.costos.cuentas.ahorro", { m: exacto(ahorro) })}</span>}
    </li>
  );
}

/** Zoho en vivo: solo se lee cuando el dueño lo pide (es una llamada a Zoho). */
function ZohoEnVivoPanel() {
  const { t } = useLanguage();
  const [pedido, setPedido] = useState(false);
  const q = useQuery({
    queryKey: ["costos-zoho-vivo"],
    enabled: pedido,
    retry: 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("conexiones-ping", { body: { accion: "zoho_casillas" } });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(String(data?.error ?? "error"));
      return data as ZohoEnVivo;
    },
  });
  const leer = () => { if (pedido) void q.refetch(); else setPedido(true); };
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-border/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{t("oficina.costos.zoho.titulo")}</span>
        <button type="button" onClick={leer} disabled={q.isFetching}
          className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60">
          {q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t(q.data ? "oficina.costos.zoho.otraVez" : "oficina.costos.zoho.ver")}
        </button>
      </div>
      {!q.data && !q.isError && <p className="text-xs text-muted-foreground">{t("oficina.costos.zoho.nota")}</p>}
      {q.isError && <p role="alert" className="text-xs text-destructive">{t("oficina.costos.zoho.fallo", { e: (q.error as Error).message })}</p>}
      {q.data && <ResultadoZoho z={q.data} />}
    </div>
  );
}

function ResultadoZoho({ z }: { z: ZohoEnVivo }) {
  const { t, language } = useLanguage();
  const sobran = licenciasQueSobran(z);
  const revisar = z.casillas.filter((c) => c.estado !== "en_uso");
  const estados: EstadoCasillaZoho[] = ["de_alguien_que_salio", "sin_uso", "sin_cuenta_en_maven", "en_uso"];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {z.licencias ? t("oficina.costos.zoho.licencias", { u: z.licencias.usadas, c: z.licencias.compradas }) : t("oficina.costos.zoho.sinLicencias")}
        {" · "}{t("oficina.costos.zoho.total", { n: z.resumen.total })}
      </p>
      {sobran && <p className="text-xs text-muted-foreground">{t("oficina.costos.zoho.sobran", { hoy: sobran.libresHoy, despues: sobran.libresDespues })}</p>}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border/50 bg-border/50">
        {estados.filter((e) => z.resumen[e] > 0).map((e) => (
          <div key={e} className="bg-card p-2.5">
            <div className="font-display text-base font-semibold tabular-nums leading-tight">{z.resumen[e]}</div>
            <div className="text-[11px] text-muted-foreground">{t(CLAVE_CASILLA[e])}</div>
          </div>
        ))}
      </div>
      {revisar.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/40 rounded-panel border border-border/50">
          {revisar.map((c) => (
            <li key={c.email} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0 break-words text-xs">{c.email}</span>
              <Chip estado={c.estado} />
            </li>
          ))}
        </ul>
      )}
      <span className="text-[11px] text-muted-foreground">{t("oficina.costos.zoho.leido", { h: new Date(z.en).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) })}</span>
    </div>
  );
}
