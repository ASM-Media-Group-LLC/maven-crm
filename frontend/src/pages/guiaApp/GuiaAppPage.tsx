import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine, ArrowRight, CheckCircle2, ChevronUp, Command, Download, ExternalLink, Folder, Grid2x2, Info,
  Minus, MonitorDown, Smartphone, Square, Users2, Wifi, X,
} from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { MarcaM } from "@/components/MarcaM";
import { useCoworkSoloApp } from "@/components/CoworkSoloApp";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { escritorio } from "@/lib/escritorio";
import { enlaceDeApp } from "@/lib/abrirEnApp";
import { archivoDeDescarga, esCelularOTableta, sistemaDeLaGuia, urlDeDescarga, type SistemaGuia } from "@/lib/guiaApp";
import { cn } from "@/lib/utils";

// GUÍA PARA INSTALAR LA APP DE MAVEN (Alvaro, 18/11/2026). Desde el viernes
// 20/11 Cowork en el computador va solo en la app (lib/coworkSoloApp.ts). Aquí,
// paso a paso y con dibujos (HTML/SVG, sin imágenes de afuera): descargar,
// instalar (el aviso azul de Windows; arrastrar a Aplicaciones en Mac), entrar
// con el mismo correo, los permisos (en Mac, la grabación de pantalla con su
// arreglo «−» y «+») y listo. Abre en la pestaña del sistema de quien mira.

const NOMBRE_SISTEMA: Record<SistemaGuia, string> = { mac: "Mac", windows: "Windows" };
/** Cowork es a donde va todo esto: «Ya la tengo» abre la app ahí. */
const RUTA_COWORK = "/cowork";

export default function GuiaAppPage() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const tactil = typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  const app = escritorio();
  // La fecha sale de monitor_config (se mueve sin subir código); sin fecha, el texto va sin ella.
  const { desde } = useCoworkSoloApp();
  const sistema: SistemaGuia = app ? (app.plataforma === "mac" ? "mac" : "windows") : sistemaDeLaGuia(ua, tactil);
  return <VistaGuiaApp sistemaInicial={sistema} enApp={!!app} enCelular={!app && esCelularOTableta(ua, tactil)} desde={desde} />;
}

/** La guía tal cual se ve, sin leer el equipo (las pruebas la pintan en cada caso). */
export function VistaGuiaApp({ sistemaInicial, enApp, enCelular, desde }: {
  sistemaInicial: SistemaGuia;
  enApp: boolean;
  enCelular: boolean;
  desde: Date | null;
}) {
  const { t } = useLanguage();
  const formato = useFormato();
  const [sistema, setSistema] = useState<SistemaGuia>(sistemaInicial);
  // La pestaña del equipo de quien mira va primero.
  const orden: SistemaGuia[] = sistemaInicial === "mac" ? ["mac", "windows"] : ["windows", "mac"];
  const mac = sistema === "mac";
  const archivo = archivoDeDescarga(sistema);
  const descarga = urlDeDescarga(sistema);
  const abrirApp = enlaceDeApp(RUTA_COWORK);
  const nombre = NOMBRE_SISTEMA[sistema];
  const fecha = desde && !Number.isNaN(desde.getTime())
    ? desde.toLocaleDateString(formato.intl(), { weekday: "long", day: "numeric", month: "long" })
    : null;

  const moverConFlechas = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const otro = orden.find((s) => s !== sistema) ?? sistema;
    setSistema(otro);
    document.getElementById(`guia-app-tab-${otro}`)?.focus();
  };

  const botonDescargar = (
    <Button asChild size="lg" className="h-11 w-full gap-2 rounded-control px-5 sm:w-auto">
      <a href={descarga}>
        <Download className="h-4 w-4" />
        {t("guiaApp.descargarPara", { sistema: nombre })}
      </a>
    </Button>
  );
  const botonCowork = enApp ? (
    <Button asChild size="lg" className="h-11 w-full gap-2 rounded-control px-5 sm:w-auto">
      <Link to={RUTA_COWORK}><Users2 className="h-4 w-4" />{t("guiaApp.irACowork")}</Link>
    </Button>
  ) : (
    <Button asChild variant="outline" size="lg" className="h-11 w-full gap-2 rounded-control px-5 sm:w-auto">
      <a href={abrirApp}><ExternalLink className="h-4 w-4" />{t("guiaApp.yaLaTengo")}</a>
    </Button>
  );

  return (
    <Page>
      <div className="space-y-4 sm:space-y-5">
        <PageHeader
          icon={<MonitorDown className="h-5 w-5" />}
          title={t("guiaApp.titulo")}
          subtitle={fecha ? t("guiaApp.subtituloFecha", { fecha }) : t("guiaApp.subtitulo")}
        />

        {enApp && (
          <div role="status" className="flex items-start gap-3 rounded-panel border border-success/30 bg-success/10 p-3 sm:p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t("guiaApp.yaEnApp.titulo")}</p>
              <p className="text-sm text-muted-foreground">{t("guiaApp.yaEnApp.desc")}</p>
            </div>
          </div>
        )}

        {enCelular ? (
          <div role="status" className="flex items-start gap-3 rounded-panel border border-border/60 bg-muted/40 p-3 sm:p-4">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t("guiaApp.celular.titulo")}</p>
              <p className="text-sm text-muted-foreground">{t("guiaApp.celular.desc")}</p>
            </div>
          </div>
        ) : (
          /* ── Arriba: descargar o, si ya la tiene, abrirla ── */
          <section className="vidrio vidrio-glow glow-v glow-suave sube p-4 sm:p-5" aria-labelledby="guia-app-inicio">
            <div className="v-cont space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <IconoApp tam="lg" />
                <div className="min-w-0 flex-1">
                  <h2 id="guia-app-inicio" className="font-display text-lg font-semibold">{t("guiaApp.inicio.titulo")}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t("guiaApp.inicio.desc")}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  {!enApp && botonDescargar}
                  {botonCowork}
                </div>
              </div>
              {!enApp && <p className="text-xs text-muted-foreground">{t("guiaApp.yaLaTengoAyuda")}</p>}
            </div>
          </section>
        )}

        {/* ── Paso a paso, por sistema ── */}
        <section className="vidrio sube p-4 sm:p-5" style={{ animationDelay: "0.08s" }} aria-labelledby="guia-app-pasos">
          <div className="v-cont">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="guia-app-pasos" className="font-display text-lg font-semibold">{t("guiaApp.pasos.titulo")}</h2>
              <div role="tablist" aria-label={t("guiaApp.sistema")} className="inline-flex rounded-full border border-border/60 bg-muted/40 p-1">
                {orden.map((s) => {
                  const Icono = s === "mac" ? Command : Grid2x2;
                  const activo = sistema === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      id={`guia-app-tab-${s}`}
                      aria-selected={activo}
                      aria-controls="guia-app-panel"
                      tabIndex={activo ? 0 : -1}
                      onClick={() => setSistema(s)}
                      onKeyDown={moverConFlechas}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                        activo ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icono className="h-3.5 w-3.5" />
                      {NOMBRE_SISTEMA[s]}
                      {s === sistemaInicial && !enCelular && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t("guiaApp.esteEquipo")}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div id="guia-app-panel" role="tabpanel" aria-labelledby={`guia-app-tab-${sistema}`}>
              <ol className="mt-4 space-y-3">
                <Paso n={1} titulo={t("guiaApp.paso.descargar.titulo")} dibujo={<DibujoDescargar archivo={archivo} mac={mac} />}>
                  <p>{t("guiaApp.paso.descargar.desc", { sistema: nombre, archivo })}</p>
                  {!enCelular && !enApp && <div className="pt-1">{botonDescargar}</div>}
                </Paso>

                <Paso n={2} titulo={t("guiaApp.paso.instalar.titulo")} dibujo={mac ? <DibujoInstalarMac /> : <DibujoAvisoWindows />}>
                  {mac ? (
                    <>
                      <p>{t("guiaApp.paso.instalar.mac", { archivo })}</p>
                      <p>{t("guiaApp.paso.instalar.macAbrir")}</p>
                    </>
                  ) : (
                    <>
                      <p>{t("guiaApp.paso.instalar.windows", { archivo })}</p>
                      <Nota>{t("guiaApp.paso.instalar.windowsAviso")}</Nota>
                    </>
                  )}
                </Paso>

                <Paso n={3} titulo={t("guiaApp.paso.entrar.titulo")} dibujo={<DibujoEntrar />}>
                  <p>{t("guiaApp.paso.entrar.desc")}</p>
                  <p>
                    {t("guiaApp.paso.entrar.olvide")}{" "}
                    <Link to="/forgot-password" className="font-medium text-primary underline-offset-2 hover:underline">
                      {t("guiaApp.paso.entrar.restablecer")}
                    </Link>
                  </p>
                </Paso>

                <Paso
                  n={4}
                  titulo={t("guiaApp.paso.permisos.titulo")}
                  dibujo={<><DibujoPideCamara />{mac ? <DibujoGrabacionMac /> : <DibujoCamaraWindows />}</>}
                >
                  {mac ? (
                    <>
                      <p>{t("guiaApp.paso.permisos.mac")}</p>
                      <p>{t("guiaApp.paso.permisos.macPantalla")}</p>
                      <Nota>{t("guiaApp.paso.permisos.macArreglo")}</Nota>
                    </>
                  ) : (
                    <>
                      <p>{t("guiaApp.paso.permisos.windows")}</p>
                      <Nota>{t("guiaApp.paso.permisos.windowsArreglo")}</Nota>
                    </>
                  )}
                </Paso>

                <Paso n={5} titulo={t("guiaApp.paso.listo.titulo")} dibujo={<DibujoListo mac={mac} />}>
                  <ul className="space-y-1.5">
                    {[
                      t("guiaApp.paso.listo.cowork"),
                      t("guiaApp.paso.listo.sola"),
                      t(mac ? "guiaApp.paso.listo.cerrarMac" : "guiaApp.paso.listo.cerrarWindows"),
                    ].map((texto) => (
                      <li key={texto} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>{texto}</span>
                      </li>
                    ))}
                  </ul>
                  {!enCelular && (
                    <div className="pt-1">
                      {enApp ? botonCowork : (
                        <Button asChild variant="outline" size="lg" className="h-11 w-full gap-2 rounded-control px-5 sm:w-auto">
                          <a href={abrirApp}><ExternalLink className="h-4 w-4" />{t("guiaApp.paso.listo.abrir")}</a>
                        </Button>
                      )}
                    </div>
                  )}
                </Paso>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Paso({ n, titulo, dibujo, children }: { n: number; titulo: string; dibujo: ReactNode; children: ReactNode }) {
  return (
    <li className="grid gap-3 rounded-panel border border-border/60 bg-foreground/[0.03] p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_296px] lg:items-center lg:gap-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">
            {n}
          </span>
          <h3 className="min-w-0 font-display text-base font-semibold leading-tight">{titulo}</h3>
        </div>
        {/* En el teléfono el texto usa todo el ancho; desde sm, alineado con el título. */}
        <div className="mt-2 space-y-2 text-sm text-muted-foreground sm:pl-11">{children}</div>
      </div>
      {/* El dibujo repite lo que dice el texto: para un lector de pantalla sobra. */}
      <div aria-hidden className="flex flex-col items-center justify-center gap-2.5 rounded-panel border border-border/40 bg-muted/20 p-3 sm:p-4">
        {dibujo}
      </div>
    </li>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-panel border border-warning/30 bg-warning/10 p-2.5 text-sm text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <span>{children}</span>
    </p>
  );
}

/** El ícono de la app: la M de Maven sobre el marino del ícono real. */
function IconoApp({ tam = "md" }: { tam?: "sm" | "md" | "lg" }) {
  const caja = { sm: "h-7 w-7 rounded-[8px]", md: "h-10 w-10 rounded-[11px]", lg: "h-14 w-14 rounded-[15px]" }[tam];
  const alto = { sm: "8px", md: "11px", lg: "16px" }[tam];
  return (
    <span className={cn("grid shrink-0 place-items-center bg-[#121e33] shadow-sm ring-1 ring-white/10", caja)}>
      <MarcaM alto={alto} />
    </span>
  );
}

/** El numerito que marca dónde tocar: en la esquina de un botón, o junto a un
 *  texto (`enLinea`) para no taparlo. */
function Marcador({ n, enLinea }: { n: number; enLinea?: boolean }) {
  return (
    <span className={cn(
      "grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground shadow ring-2 ring-background",
      enLinea ? "ml-1.5 inline-grid align-middle no-underline" : "absolute -right-2 -top-2",
    )}>
      {n}
    </span>
  );
}

/** Una ventanita de Mac (semáforo a la izquierda) o de Windows (botones a la derecha). */
function Ventana({ titulo, mac, children }: { titulo: string; mac: boolean; children: ReactNode }) {
  return (
    <div className="w-full max-w-[264px] overflow-hidden rounded-lg border border-border bg-background text-left shadow-sm">
      <div className="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5">
        {mac && ["bg-[#ff5f57]", "bg-[#febc2e]", "bg-[#28c840]"].map((c) => <span key={c} className={cn("h-2 w-2 shrink-0 rounded-full", c)} />)}
        <span className={cn("min-w-0 flex-1 truncate text-[10px] font-medium text-muted-foreground", mac && "pr-6 text-center")}>{titulo}</span>
        {!mac && (
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground/70">
            <Minus className="h-2.5 w-2.5" /><Square className="h-2 w-2" /><X className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function DibujoDescargar({ archivo, mac }: { archivo: string; mac: boolean }) {
  const { t } = useLanguage();
  return (
    <Ventana titulo={t("guiaApp.dibujo.descargas")} mac={mac}>
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary/10 text-primary">
          <ArrowDownToLine className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-foreground">{archivo}</p>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-foreground/10">
            <span className="block h-full w-full rounded-full bg-success" />
          </span>
        </div>
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      </div>
    </Ventana>
  );
}

/** El aviso azul de SmartScreen, con dónde tocar: 1 «Más información», 2 «Ejecutar de todas formas». */
function DibujoAvisoWindows() {
  const { t } = useLanguage();
  return (
    <div className="w-full max-w-[264px] rounded-control bg-[#0b5cad] p-3 text-left text-white shadow-sm">
      <p className="text-[13px] font-semibold leading-tight">{t("guiaApp.dibujo.smartscreen")}</p>
      <span className="mt-2 block h-1 w-5/6 rounded-full bg-white/30" />
      <span className="mt-1 block h-1 w-2/3 rounded-full bg-white/30" />
      <span className="mt-2.5 inline-flex items-center text-[11px]">
        <span className="underline underline-offset-2">{t("guiaApp.dibujo.masInformacion")}</span>
        <Marcador n={1} enLinea />
      </span>
      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        <span className="relative rounded-[3px] border border-white bg-white/15 px-2 py-1 text-[10px] font-semibold">
          {t("guiaApp.dibujo.ejecutar")}
          <Marcador n={2} />
        </span>
        <span className="rounded-[3px] bg-white/10 px-2 py-1 text-[10px]">{t("guiaApp.dibujo.noEjecutar")}</span>
      </div>
    </div>
  );
}

/** La ventana del .dmg: Maven → Aplicaciones. */
function DibujoInstalarMac() {
  const { t } = useLanguage();
  return (
    <Ventana titulo="Maven" mac>
      <div className="flex items-center justify-around gap-2 px-3 py-4">
        <div className="flex flex-col items-center gap-1">
          <IconoApp />
          <span className="text-[10px] font-medium text-foreground">Maven</span>
        </div>
        <span className="flex items-center text-primary">
          <span className="w-8 border-t-2 border-dashed border-primary/60" />
          <ArrowRight className="-ml-1 h-4 w-4" />
        </span>
        <div className="flex flex-col items-center gap-1">
          <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-muted">
            <Folder className="h-6 w-6 fill-foreground/15 text-foreground/60" />
          </span>
          <span className="text-[10px] font-medium text-foreground">{t("guiaApp.dibujo.aplicaciones")}</span>
        </div>
      </div>
    </Ventana>
  );
}

function DibujoEntrar() {
  const { t } = useLanguage();
  return (
    <div className="w-full max-w-[240px] rounded-lg border border-border bg-background p-3 text-left shadow-sm">
      <div className="mb-2.5 flex justify-center"><MarcaM alto="12px" /></div>
      <p className="text-[9px] font-medium text-muted-foreground">{t("guiaApp.dibujo.correo")}</p>
      <div className="mt-0.5 truncate rounded-control border border-border bg-muted/30 px-2 py-1 text-[10px] text-foreground">{t("guiaApp.dibujo.correoEjemplo")}</div>
      <p className="mt-1.5 text-[9px] font-medium text-muted-foreground">{t("guiaApp.dibujo.contrasena")}</p>
      <div className="mt-0.5 rounded-control border border-border bg-muted/30 px-2 py-1 text-[10px] tracking-widest text-foreground">••••••••</div>
      <div className="mt-2.5 rounded-control bg-primary py-1 text-center text-[10px] font-semibold text-primary-foreground">{t("guiaApp.dibujo.entrar")}</div>
    </div>
  );
}

/** El permiso de cámara y micrófono: tocar «Permitir». */
function DibujoPideCamara() {
  const { t } = useLanguage();
  return (
    <div className="w-full max-w-[240px] rounded-xl border border-border bg-background p-3 text-center shadow-sm">
      <div className="flex justify-center"><IconoApp tam="sm" /></div>
      <p className="mt-2 text-[11px] font-semibold leading-snug text-foreground">{t("guiaApp.dibujo.pideCamara")}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <span className="rounded-control bg-muted px-2 py-1 text-[10px] font-medium text-foreground">{t("guiaApp.dibujo.noPermitir")}</span>
        <span className="relative rounded-control bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
          {t("guiaApp.dibujo.permitir")}
          <Marcador n={1} />
        </span>
      </div>
    </div>
  );
}

/** Configuración del Sistema → Grabación de pantalla: Maven prendido, «+» y «−», y «Salir y volver a abrir». */
function DibujoGrabacionMac() {
  const { t } = useLanguage();
  return (
    <Ventana titulo={t("guiaApp.dibujo.grabacionPantalla")} mac>
      <div className="space-y-2 p-2.5">
        <div className="flex items-center gap-2 rounded-control bg-muted/40 px-2 py-1.5">
          <IconoApp tam="sm" />
          <span className="flex-1 text-[11px] font-medium text-foreground">Maven</span>
          <span className="relative flex h-4 w-7 shrink-0 items-center rounded-full bg-success p-0.5">
            <span className="ml-auto h-3 w-3 rounded-full bg-white shadow" />
            <Marcador n={2} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex overflow-hidden rounded border border-border text-[11px] leading-none text-foreground">
            <span className="px-1.5 py-0.5">+</span>
            <span className="border-l border-border px-1.5 py-0.5">−</span>
          </span>
          <span className="relative rounded-control bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
            {t("guiaApp.dibujo.salirYAbrir")}
            <Marcador n={3} />
          </span>
        </div>
      </div>
    </Ventana>
  );
}

/** Configuración de Windows → Cámara: «Permitir que las aplicaciones de escritorio accedan». */
function DibujoCamaraWindows() {
  const { t } = useLanguage();
  return (
    <Ventana titulo={t("guiaApp.dibujo.camaraWindows")} mac={false}>
      <div className="p-2.5">
        <div className="flex items-center gap-2 rounded-control bg-muted/40 px-2 py-2">
          <span className="min-w-0 flex-1 text-[10px] leading-snug text-foreground">{t("guiaApp.dibujo.appsEscritorio")}</span>
          <span className="relative flex h-4 w-7 shrink-0 items-center rounded-full bg-success p-0.5">
            <span className="ml-auto h-3 w-3 rounded-full bg-white shadow" />
            <Marcador n={2} />
          </span>
        </div>
      </div>
    </Ventana>
  );
}

/** Cowork abierto en la app y el ícono de Maven donde queda al cerrar la ventana:
 *  arriba en la barra de menú (Mac) o abajo junto al reloj (Windows). */
function DibujoListo({ mac }: { mac: boolean }) {
  const { t } = useLanguage();
  const barra = (
    <div className={cn("flex items-center justify-end gap-2.5 rounded-control bg-[#1d2433] px-2 text-white shadow-sm ring-1 ring-white/10", mac ? "h-7" : "h-8")}>
      {!mac && <ChevronUp className="h-3 w-3 opacity-70" />}
      <span className="relative grid h-5 w-6 place-items-center rounded bg-white/10 ring-1 ring-primary">
        <MarcaM alto="7px" />
        <Marcador n={1} />
      </span>
      <Wifi className="h-3 w-3 opacity-80" />
      <span className="text-[9px] font-medium tabular-nums">9:41</span>
    </div>
  );
  return (
    <div className="w-full max-w-[264px] space-y-2">
      {mac && barra}
      <Ventana titulo="Maven" mac={mac}>
        <div className="flex items-center gap-2 p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Users2 className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 text-[11px] font-semibold text-foreground">{t("guiaApp.dibujo.coworkAbierto")}</span>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        </div>
      </Ventana>
      {!mac && barra}
    </div>
  );
}
