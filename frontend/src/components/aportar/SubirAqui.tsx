import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Smartphone } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { subirConTus } from "@/lib/subirConTus";
import { invocarAporte } from "@/lib/aportar/api";
import {
  ESPERA_RETOMAR_MS, estaPausada, minutosRestantes, pasaDelTope, pesoLegible, seRetomaSola, TOPE_ARCHIVO_TEXTO, tocaReportar,
  velocidadSuavizada,
} from "@/lib/aportar/subidaLarga";

// SUBIR por link (Alvaro, 04/11; separado de PaginaAportar el 10/11 cuando el
// link pasó a ser la carpeta de la creadora). El token se valida en la edge
// drive-aporte, que entrega el path destino; el navegador sube directo con TUS
// (partes resumibles, ver lib/subirConTus.ts) para que un video largo aguante
// una red floja y retome si se corta. Todo cae en la carpeta del día.

// Videos largos y pesados (Alvaro, 11/11/2026): si la subida se corta, se
// RETOMA SOLA al volver a la pantalla o al volver el internet (sin empezar de
// cero), la pantalla se mantiene encendida mientras sube, se ve cuánto falta,
// y cada intento queda en la caja negra (drive_aportar_intentos) para avisarle
// a quien creó el link si la modelo se traba. Reglas en lib/aportar/subidaLarga.
type EstadoArchivo = "pendiente" | "subiendo" | "pausado" | "ok" | "fallo";
/** `id` es también el id del intento en la caja negra. */
interface Item { id: string; file: File; estado: EstadoArchivo; pct: number; bytes: number; kbps: number | null; razonFallo?: string }
interface Seguimiento {
  ultimoAvance: number; ultimoBytes: number; ultimoReporte: number | null; arrancado: boolean;
  kbps: number | null; reintentos: number; pausas: number; enPausa: boolean;
}
type EstadoBitacora = "subiendo" | "pausado" | "ok" | "fallo";

const statusDe = (err: unknown): number | null => {
  const e = err as { originalResponse?: { getStatus?: () => number } } | undefined;
  return e?.originalResponse?.getStatus ? e.originalResponse.getStatus() : null;
};
const mensajeDe = (err: unknown) => ((err as { message?: string } | undefined)?.message ?? String(err)).slice(0, 400);

/** Espera a que la pantalla esté a la vista y haya internet, y un respiro. */
function esperarParaRetomar(): Promise<void> {
  return new Promise((resolve) => {
    let cada = 0;
    function limpiar() {
      document.removeEventListener("visibilitychange", intentar);
      window.removeEventListener("online", intentar);
      window.clearInterval(cada);
    }
    function intentar() {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      limpiar();
      window.setTimeout(resolve, ESPERA_RETOMAR_MS);
    }
    document.addEventListener("visibilitychange", intentar);
    window.addEventListener("online", intentar);
    cada = window.setInterval(intentar, 10_000);
    intentar();
  });
}

const BUCKET = "drive-aportes";
const ESPERAS = [1000, 3000, 8000, 20000, 40000];
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Etapa = "iniciar" | "subida" | "confirmar" | "general";
const NOMBRE_DE_ETAPA: Record<Etapa, TranslationKey> = {
  iniciar: "drive.carpeta.etapa.iniciar", subida: "drive.carpeta.etapa.subida", confirmar: "drive.carpeta.etapa.confirmar", general: "drive.carpeta.etapa.general",
};

export function SubirAqui({ token, pedirNombre, alSubir }: {
  token: string;
  /** El link de invitado (el fotógrafo) pide el nombre; el de la creadora no. */
  pedirNombre: boolean;
  /** Cuando termina una tanda (para refrescar «Mis archivos»). */
  alSubir?: () => void;
}) {
  const { t } = useLanguage();
  const [quien, setQuien] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const seguimientos = useRef(new Map<string, Seguimiento>());
  const seg = (id: string): Seguimiento => {
    let s = seguimientos.current.get(id);
    if (!s) {
      s = { ultimoAvance: Date.now(), ultimoBytes: 0, ultimoReporte: null, arrancado: false, kbps: null, reintentos: 0, pausas: 0, enPausa: false };
      seguimientos.current.set(id, s);
    }
    return s;
  };

  const marcar = (id: string, cambio: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambio } : it)));

  // La caja negra: cada intento con su estado, avance y velocidad (sin bloquear).
  function bitacora(it: Item, estado: EstadoBitacora, extra: { pct?: number; bytes?: number; mensaje?: string } = {}) {
    const s = seg(it.id);
    void invocarAporte(token, "bitacora", {
      intento: it.id, nombre_archivo: it.file.name, size_bytes: it.file.size, estado,
      pct: extra.pct ?? 0, bytes_subidos: extra.bytes ?? 0, kbps: s.kbps ? Math.round(s.kbps) : null,
      pausas: s.pausas, reintentos: s.reintentos, mensaje: extra.mensaje,
    }).catch(() => {});
  }

  // Avance de TUS: velocidad suavizada, salida de la pausa y reporte cada 30 s.
  const alAvanzar = (it: Item) => (subidos: number, total: number) => {
    const s = seg(it.id);
    const ahora = Date.now();
    if (!s.arrancado) {
      // La primera lectura de cada arranque puede traer lo ya subido (retoma):
      // no cuenta para la velocidad.
      s.arrancado = true;
      s.ultimoAvance = ahora;
    } else if (subidos > s.ultimoBytes) {
      s.kbps = velocidadSuavizada(s.kbps, subidos - s.ultimoBytes, ahora - s.ultimoAvance);
      s.ultimoAvance = ahora;
    }
    s.ultimoBytes = subidos;
    const pct = total > 0 ? Math.round((subidos / total) * 100) : 0;
    if (s.enPausa) {
      s.enPausa = false;
      bitacora(it, "subiendo", { pct, bytes: subidos });
    }
    marcar(it.id, { estado: "subiendo", pct, bytes: subidos, kbps: s.kbps });
    if (tocaReportar(s.ultimoReporte, ahora)) {
      s.ultimoReporte = ahora;
      bitacora(it, "subiendo", { pct, bytes: subidos });
    }
  };

  // Manda al servidor un reporte del fallo (sin bloquear): el equipo lo lee en
  // drive_aportar_errores y así ve qué pasa en celulares que no podemos mirar.
  function logError(it: Item, etapa: string, err: unknown, intento?: number) {
    const e = err as { message?: string; originalResponse?: { getStatus?: () => number } } | undefined;
    const status = e?.originalResponse?.getStatus ? e.originalResponse.getStatus() : undefined;
    void invocarAporte(token, "log_error", {
      nombre_archivo: it.file.name, size_bytes: it.file.size, etapa, mensaje: e?.message ?? String(err).slice(0, 400), status, intento,
    }).catch(() => {});
  }

  // La razón del fallo, en palabras de la creadora.
  function razonVisible(etapa: Etapa, err: unknown, peso?: number): string {
    const e = err as { message?: string; originalResponse?: { getStatus?: () => number } } | undefined;
    const status = e?.originalResponse?.getStatus ? e.originalResponse.getStatus() : null;
    const donde = t(NOMBRE_DE_ETAPA[etapa]);
    if (status === 413) return t("drive.carpeta.razon.muyGrande", { p: peso ? pesoLegible(peso) : "?", tope: TOPE_ARCHIVO_TEXTO });
    if (status && status >= 400) return t("drive.carpeta.razon.status", { s: status, e: donde });
    const msg = (e?.message ?? String(err)).toLowerCase();
    if (msg.includes("failed to fetch") || msg.includes("network")) return t("drive.carpeta.razon.red", { e: donde });
    if (msg.includes("timeout")) return t("drive.carpeta.razon.tiempo", { e: donde });
    return t("drive.carpeta.razon.otro", { e: donde, m: (e?.message ?? "").slice(0, 80) });
  }

  async function iniciarConReintentos(it: Item): Promise<string | null> {
    let ultimo: unknown = null;
    for (let c = 1; c <= ESPERAS.length; c++) {
      try {
        const ini = await invocarAporte<{ path?: string }>(token, "iniciar", { nombre_archivo: it.file.name });
        if (ini?.path) return ini.path;
        ultimo = new Error("sin path");
      } catch (err) { ultimo = err; }
      logError(it, "iniciar", ultimo, c);
      await dormir(ESPERAS[c - 1]);
    }
    marcar(it.id, { razonFallo: razonVisible("iniciar", ultimo) });
    return null;
  }

  async function subirUno(it: Item): Promise<boolean> {
    const s = seg(it.id);
    s.ultimoAvance = Date.now();
    s.arrancado = false;
    s.enPausa = false;
    marcar(it.id, { estado: "subiendo", razonFallo: undefined });
    bitacora(it, "subiendo", { pct: it.pct, bytes: it.bytes });
    try {
      const pedido = await iniciarConReintentos(it);
      if (!pedido) {
        marcar(it.id, { estado: "fallo" });
        bitacora(it, "fallo", { mensaje: "iniciar" });
        return false;
      }
      let path: string;
      try {
        // Retoma SOLO subidas de este mismo link, y usa la ruta donde quedó de
        // verdad el archivo (antes se confirmaba la ruta nueva, vacía).
        const r = await subirConTus({
          bucket: BUCKET, path: pedido, file: it.file, onPct: () => {}, onBytes: alAvanzar(it), prefijoReanudable: `${token}/`,
        });
        path = r.path;
      } catch (err) {
        logError(it, "tus", err);
        if (seRetomaSola(statusDe(err), s.reintentos)) {
          // Se cortó (bloqueó el teléfono, cambió de app, se fue el internet):
          // queda "en pausa" y sigue sola desde donde iba apenas se pueda.
          s.reintentos += 1;
          s.pausas += 1;
          marcar(it.id, { estado: "pausado" });
          bitacora(it, "pausado", { pct: itemsRef.current.find((x) => x.id === it.id)?.pct, mensaje: mensajeDe(err) });
          await esperarParaRetomar();
          return subirUno(itemsRef.current.find((x) => x.id === it.id) ?? it);
        }
        marcar(it.id, { estado: "fallo", razonFallo: razonVisible("subida", err, it.file.size) });
        bitacora(it, "fallo", { mensaje: mensajeDe(err) });
        return false;
      }
      let ultimo: unknown = null;
      for (let c = 1; c <= ESPERAS.length; c++) {
        try {
          await invocarAporte(token, "confirmar", { path, nombre_archivo: it.file.name, size: it.file.size, quien });
          marcar(it.id, { estado: "ok", pct: 100 });
          bitacora(it, "ok", { pct: 100, bytes: it.file.size });
          return true;
        } catch (err) { ultimo = err; await dormir(ESPERAS[c - 1]); }
      }
      logError(it, "confirmar", ultimo);
      marcar(it.id, { estado: "fallo", razonFallo: razonVisible("confirmar", ultimo) });
      bitacora(it, "fallo", { mensaje: `confirmar: ${mensajeDe(ultimo)}` });
      return false;
    } catch (err) {
      logError(it, "subirUno", err);
      marcar(it.id, { estado: "fallo", razonFallo: razonVisible("general", err) });
      bitacora(it, "fallo", { mensaje: mensajeDe(err) });
      return false;
    }
  }

  function agregar(files: FileList | File[] | null) {
    const lista = files ? Array.from(files) : [];
    if (lista.length === 0) return;
    // Lo que pasa del tope ni se intenta: se dice por qué de una (antes
    // rebotaba al rato con un «Error 413» que nadie entendía).
    const grandes: Item[] = lista.filter((f) => pasaDelTope(f.size)).map((file) => ({
      id: crypto.randomUUID(), file, estado: "fallo", pct: 0, bytes: 0, kbps: null,
      razonFallo: t("drive.carpeta.razon.muyGrande", { p: pesoLegible(file.size), tope: TOPE_ARCHIVO_TEXTO }),
    }));
    for (const it of grandes) logError(it, "tope", new Error(`pasa del tope de ${TOPE_ARCHIVO_TEXTO}`));
    const nuevos: Item[] = lista.filter((f) => !pasaDelTope(f.size))
      .map((file) => ({ id: crypto.randomUUID(), file, estado: "pendiente", pct: 0, bytes: 0, kbps: null }));
    setItems((prev) => [...prev, ...grandes, ...nuevos]);
    if (nuevos.length === 0) return;
    // De a uno, para no ahogar la red del celular.
    void (async () => {
      let alguno = false;
      for (const it of nuevos) alguno = (await subirUno(it)) || alguno;
      if (alguno) alSubir?.();
    })();
  }

  const subidos = items.filter((i) => i.estado === "ok").length;
  const enCurso = items.some((i) => i.estado === "subiendo" || i.estado === "pendiente" || i.estado === "pausado");

  // Mientras sube: la pantalla no se apaga sola (el iPhone pausa la subida al
  // bloquearse). Se vuelve a pedir al regresar a la pantalla: el navegador lo
  // suelta cada vez que la página deja de verse.
  useEffect(() => {
    if (!enCurso) return;
    type Candado = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (tipo: "screen") => Promise<Candado> } }).wakeLock;
    if (!wl) return;
    let candado: Candado | null = null;
    let vivo = true;
    const pedir = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const c = await wl.request("screen");
        if (vivo) candado = c; else void c.release().catch(() => {});
      } catch { /* no lo dejó: sigue sin el candado */ }
    };
    void pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", pedir);
      void candado?.release().catch(() => {});
    };
  }, [enCurso]);

  // Si cierra la pestaña a mitad de una subida, el navegador pregunta antes.
  useEffect(() => {
    if (!enCurso) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enCurso]);

  // 30 s sin avance = "en pausa" (se ve en pantalla y queda en la caja negra).
  useEffect(() => {
    if (!enCurso) return;
    const id = window.setInterval(() => {
      const ahora = Date.now();
      for (const it of itemsRef.current) {
        if (it.estado !== "subiendo") continue;
        const s = seg(it.id);
        if (!s.enPausa && estaPausada(s.ultimoAvance, ahora)) {
          s.enPausa = true;
          s.pausas += 1;
          marcar(it.id, { estado: "pausado" });
          bitacora(it, "pausado", { pct: it.pct, bytes: it.bytes });
        }
      }
    }, 5_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCurso]);

  const detalleDe = (it: Item): string => {
    if (it.estado === "pausado") return t("drive.aportar.enPausa");
    const sub = pesoLegible(it.bytes);
    const tot = pesoLegible(it.file.size);
    const min = minutosRestantes(it.file.size - it.bytes, it.kbps);
    return min === null ? t("drive.aportar.calculando", { sub, tot }) : t("drive.aportar.faltan", { sub, tot, min });
  };

  return (
    <div className="flex flex-col gap-4">
      {pedirNombre && (
        <div>
          <label htmlFor="quien" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("drive.aportar.tuNombre")}</label>
          <input id="quien" value={quien} onChange={(e) => setQuien(e.target.value)} autoComplete="name"
            className="w-full rounded-control border border-border/60 bg-card/40 px-3 py-2.5 text-sm outline-none ring-primary/40 focus:ring-2" />
        </div>
      )}

      {/* Un <label> que ENVUELVE el input real: el toque es un gesto nativo, así
          el selector abre también dentro de Instagram/WhatsApp (un .click()
          simulado a un input oculto NO abre ahí). */}
      <label
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-panel border border-dashed px-6 py-8 text-center transition ${arrastrando ? "border-primary bg-primary/10" : "border-border/70 bg-card/20 hover:border-primary/50 hover:bg-card/40"}`}
      >
        <FileUp className="h-7 w-7 text-primary" />
        <span className="text-sm font-semibold">{t("drive.aportar.elegir")}</span>
        <span className="text-xs text-muted-foreground">{t("drive.aportar.arrastra")}</span>
        <input ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
      </label>

      {enCurso && (
        <div role="status" className="flex items-start gap-3 rounded-panel border border-warning/50 bg-warning/10 px-4 py-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm font-medium text-foreground">{t("drive.aportar.noBloquees")}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div key={it.id} className="flex flex-col gap-1.5 rounded-control border border-border/40 bg-card/30 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{it.file.name}</span>
                {(it.estado === "subiendo" || it.estado === "pausado") && <span className={`flex shrink-0 items-center gap-1 text-[11px] font-medium ${it.estado === "pausado" ? "text-warning" : "text-primary"}`}>{it.pct > 0 ? `${it.pct}%` : <Loader2 className="h-3.5 w-3.5 animate-spin" />}</span>}
                {it.estado === "pendiente" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />}
                {it.estado === "ok" && <span className="flex shrink-0 items-center gap-1 text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t("drive.aportar.ok")}</span>}
                {it.estado === "fallo" && (
                  <button type="button" onClick={() => void subirUno(it)} className="flex shrink-0 items-center gap-1 text-[11px] text-destructive hover:underline">
                    <AlertCircle className="h-3.5 w-3.5" />{t("drive.aportar.fallo")}
                  </button>
                )}
              </div>
              {it.estado === "fallo" && it.razonFallo && <p className="text-[10px] text-destructive/80">{it.razonFallo}</p>}
              {(it.estado === "subiendo" || it.estado === "pausado") && (
                <>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                    <div className={`h-full rounded-full transition-all duration-200 ${it.estado === "pausado" ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.max(4, it.pct)}%` }} />
                  </div>
                  <p className={`text-[11px] ${it.estado === "pausado" ? "text-warning" : "text-muted-foreground"}`}>{detalleDe(it)}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Éxito ENORME y persistente (Alvaro, 06/11): que no quede duda de que llegó. */}
      {subidos > 0 && !enCurso && (
        <div role="status" className="rounded-panel border-2 border-success bg-success/15 px-5 py-6 text-center">
          <div className="mb-3 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-success-foreground">
              <CheckCircle2 className="h-9 w-9" />
            </span>
          </div>
          <h2 className="font-display text-2xl font-bold text-success">{t("drive.aportar.exitoTitulo")}</h2>
          <p className="mt-1 text-base text-success/90">{t("drive.aportar.exitoDetalle", { n: subidos })}</p>
          <p className="mt-3 text-[11px] text-muted-foreground">{t("drive.aportar.exitoPie")}</p>
        </div>
      )}
    </div>
  );
}
