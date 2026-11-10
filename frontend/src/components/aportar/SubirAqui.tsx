import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { subirConTus } from "@/lib/subirConTus";
import { invocarAporte } from "@/lib/aportar/api";

// SUBIR por link (Alvaro, 04/11; separado de PaginaAportar el 10/11 cuando el
// link pasó a ser la carpeta de la creadora). El token se valida en la edge
// drive-aporte, que entrega el path destino; el navegador sube directo con TUS
// (partes resumibles, ver lib/subirConTus.ts) para que un video largo aguante
// una red floja y retome si se corta. Todo cae en la carpeta del día.

type EstadoArchivo = "pendiente" | "subiendo" | "ok" | "fallo";
interface Item { id: string; file: File; estado: EstadoArchivo; pct: number; razonFallo?: string }

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

  const marcar = (id: string, cambio: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambio } : it)));

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
  function razonVisible(etapa: Etapa, err: unknown): string {
    const e = err as { message?: string; originalResponse?: { getStatus?: () => number } } | undefined;
    const status = e?.originalResponse?.getStatus ? e.originalResponse.getStatus() : null;
    const donde = t(NOMBRE_DE_ETAPA[etapa]);
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
    marcar(it.id, { estado: "subiendo", pct: 0, razonFallo: undefined });
    try {
      const path = await iniciarConReintentos(it);
      if (!path) { marcar(it.id, { estado: "fallo" }); return false; }
      try {
        await subirConTus({ bucket: BUCKET, path, file: it.file, onPct: (p) => marcar(it.id, { pct: p }) });
      } catch (err) {
        logError(it, "tus", err);
        marcar(it.id, { estado: "fallo", razonFallo: razonVisible("subida", err) });
        return false;
      }
      let ultimo: unknown = null;
      for (let c = 1; c <= ESPERAS.length; c++) {
        try {
          await invocarAporte(token, "confirmar", { path, nombre_archivo: it.file.name, size: it.file.size, quien });
          marcar(it.id, { estado: "ok", pct: 100 });
          return true;
        } catch (err) { ultimo = err; await dormir(ESPERAS[c - 1]); }
      }
      logError(it, "confirmar", ultimo);
      marcar(it.id, { estado: "fallo", razonFallo: razonVisible("confirmar", ultimo) });
      return false;
    } catch (err) {
      logError(it, "subirUno", err);
      marcar(it.id, { estado: "fallo", razonFallo: razonVisible("general", err) });
      return false;
    }
  }

  function agregar(files: FileList | File[] | null) {
    const lista = files ? Array.from(files) : [];
    if (lista.length === 0) return;
    const nuevos: Item[] = lista.map((file) => ({ id: crypto.randomUUID(), file, estado: "pendiente", pct: 0 }));
    setItems((prev) => [...prev, ...nuevos]);
    // De a uno, para no ahogar la red del celular.
    void (async () => {
      let alguno = false;
      for (const it of nuevos) alguno = (await subirUno(it)) || alguno;
      if (alguno) alSubir?.();
    })();
  }

  const subidos = items.filter((i) => i.estado === "ok").length;
  const enCurso = items.some((i) => i.estado === "subiendo" || i.estado === "pendiente");

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

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div key={it.id} className="flex flex-col gap-1.5 rounded-control border border-border/40 bg-card/30 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{it.file.name}</span>
                {it.estado === "subiendo" && <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">{it.pct > 0 ? `${it.pct}%` : <Loader2 className="h-3.5 w-3.5 animate-spin" />}</span>}
                {it.estado === "pendiente" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />}
                {it.estado === "ok" && <span className="flex shrink-0 items-center gap-1 text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t("drive.aportar.ok")}</span>}
                {it.estado === "fallo" && (
                  <button type="button" onClick={() => void subirUno(it)} className="flex shrink-0 items-center gap-1 text-[11px] text-destructive hover:underline">
                    <AlertCircle className="h-3.5 w-3.5" />{t("drive.aportar.fallo")}
                  </button>
                )}
              </div>
              {it.estado === "fallo" && it.razonFallo && <p className="text-[10px] text-destructive/80">{it.razonFallo}</p>}
              {it.estado === "subiendo" && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                  <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${Math.max(4, it.pct)}%` }} />
                </div>
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
