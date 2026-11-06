import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CloudUpload, Loader2, CheckCircle2, AlertCircle, FileUp, Lock } from "lucide-react";
import { supabaseAnon } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { subirConTus } from "@/lib/subirConTus";

// PÁGINA PÚBLICA de subida por link (Alvaro, 04/11). Cualquiera abre /aportar/:token
// SIN cuenta y sube archivos a una carpeta del Drive. El token se valida en la
// edge drive-aporte, que entrega el path destino; el navegador sube directo con
// TUS (chunks resumibles de 6 MB, ver lib/subirConTus.ts) para que un video de
// 10+ min aguante una red flaky y pueda reanudar si se corta. Los archivos van a
// Supabase y migran al NAS aparte.

type EstadoLink = "cargando" | "ok" | "cerrado" | "noExiste";
type EstadoArchivo = "pendiente" | "subiendo" | "ok" | "fallo";
interface Item { id: string; file: File; estado: EstadoArchivo; pct: number; }

const BUCKET = "drive-aportes";

async function invocar(action: string, extra: Record<string, unknown>) {
  const { data, error } = await supabaseAnon.functions.invoke("drive-aporte", { body: { action, ...extra } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export default function PaginaAportar() {
  const { token = "" } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const [estado, setEstado] = useState<EstadoLink>("cargando");
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [quien, setQuien] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const info = await invocar("info", { token });
        if (!vivo) return;
        if (!info?.existe) { setEstado("noExiste"); return; }
        if (!info.activo) { setEstado("cerrado"); return; }
        setCarpeta(info.carpeta ?? null);
        setEtiqueta(info.etiqueta ?? null);
        setEstado("ok");
      } catch {
        if (vivo) setEstado("noExiste");
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  const marcar = (id: string, cambio: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambio } : it)));

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // Reintento robusto para el "iniciar": el navegador puede estar con red
  // flaky y el primer POST al edge falla. Hasta 5 intentos con backoff antes
  // de rendirse.
  async function iniciarConRetry(nombreArchivo: string): Promise<{ path: string } | null> {
    for (let c = 1; c <= 5; c++) {
      try {
        const ini = await invocar("iniciar", { token, nombre_archivo: nombreArchivo });
        if (ini?.path) return { path: ini.path as string };
      } catch { /* reintento abajo */ }
      await sleep([1000, 3000, 8000, 20000, 40000][c - 1] ?? 10000);
    }
    return null;
  }

  async function subirUno(it: Item) {
    marcar(it.id, { estado: "subiendo", pct: 0 });
    try {
      const ini = await iniciarConRetry(it.file.name);
      if (!ini) { marcar(it.id, { estado: "fallo" }); return; }

      // Subida TUS: chunks de 2 MB con escalera de retries interna de ~9 min
      // (ver lib/subirConTus.ts). Cada PATCH que falla se reintenta solo ese
      // chunk desde el offset exacto que el servidor confirmó. Por eso NO
      // envolvemos esto en otro for de reintentos: tus-js-client ya reintenta
      // mucho internamente. Si aún así falla → fallo real (no fue red).
      await subirConTus({
        bucket: BUCKET,
        path: ini.path,
        file: it.file,
        onPct: (p) => marcar(it.id, { pct: p }),
      });

      // Confirmar es CRÍTICO: si esto falla, el objeto queda huérfano en
      // storage y lo barre el rescatador. 5 intentos con backoff.
      let confirmado = false;
      for (let c = 1; c <= 5 && !confirmado; c++) {
        try {
          await invocar("confirmar", { token, path: ini.path, nombre_archivo: it.file.name, size: it.file.size, quien });
          confirmado = true;
        } catch { await sleep([1000, 3000, 8000, 20000, 40000][c - 1] ?? 10000); }
      }
      if (!confirmado) { marcar(it.id, { estado: "fallo" }); return; }
      marcar(it.id, { estado: "ok", pct: 100 });
    } catch {
      marcar(it.id, { estado: "fallo" });
    }
  }

  function agregar(files: FileList | null | File[]) {
    const lista = files ? Array.from(files) : [];
    if (lista.length === 0) return;
    const nuevos: Item[] = lista.map((file) => ({ id: crypto.randomUUID(), file, estado: "pendiente", pct: 0 }));
    setItems((prev) => [...prev, ...nuevos]);
    // Subir de a uno (no saturar la red del celular).
    void (async () => { for (const it of nuevos) await subirUno(it); })();
  }

  const subidos = items.filter((i) => i.estado === "ok").length;
  const enCurso = items.some((i) => i.estado === "subiendo" || i.estado === "pendiente");

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><CloudUpload className="h-6 w-6" /></span>
          <h1 className="font-display text-xl font-bold tracking-tight">{t("drive.aportar.titulo")}</h1>
          {estado === "ok" && carpeta && <p className="mt-1 text-sm text-muted-foreground">{t("drive.aportar.aLaCarpeta", { c: etiqueta || carpeta })}</p>}
        </div>

        {estado === "cargando" ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : estado !== "ok" ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/40 px-6 py-12 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{t(estado === "cerrado" ? "drive.aportar.cerrado" : "drive.aportar.noExiste")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="quien" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("drive.aportar.tuNombre")}</label>
              <input id="quien" value={quien} onChange={(e) => setQuien(e.target.value)} className="w-full rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 text-sm outline-none ring-primary/40 focus:ring-2" autoComplete="name" />
            </div>

            {/* Un <label> que ENVUELVE el input real: el clic es un gesto nativo del
                navegador, así el selector de archivos abre también dentro de los
                navegadores embebidos de Instagram/WhatsApp (un .click() simulado a
                un input oculto NO abre ahí). El input va visualmente escondido
                (sr-only), pero presente y activo. */}
            <label
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center transition ${arrastrando ? "border-primary bg-primary/10" : "border-border/70 bg-card/20 hover:border-primary/50 hover:bg-card/40"}`}
            >
              <FileUp className="h-7 w-7 text-primary" />
              <span className="text-sm font-semibold">{t("drive.aportar.elegir")}</span>
              <span className="text-xs text-muted-foreground">{t("drive.aportar.arrastra")}</span>
              <input ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => { agregar(e.target.files); e.target.value = ""; }} />
            </label>

            {items.length > 0 && (
              <div className="flex flex-col gap-2">
                {items.map((it) => (
                  <div key={it.id} className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-card/30 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm">{it.file.name}</span>
                      {it.estado === "subiendo" && <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">{it.pct > 0 ? `${it.pct}%` : <Loader2 className="h-3.5 w-3.5 animate-spin" />}</span>}
                      {it.estado === "pendiente" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />}
                      {it.estado === "ok" && <span className="flex shrink-0 items-center gap-1 text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t("drive.aportar.ok")}</span>}
                      {it.estado === "fallo" && (
                        <button type="button" onClick={() => void subirUno(it)} className="flex shrink-0 items-center gap-1 text-[11px] text-destructive hover:underline"><AlertCircle className="h-3.5 w-3.5" />{t("drive.aportar.fallo")}</button>
                      )}
                    </div>
                    {it.estado === "subiendo" && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                        <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${Math.max(4, it.pct)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Mensaje de ÉXITO ENORME y persistente (Alvaro, 06/11): que la creadora
                no tenga duda de que su archivo llegó. No se puede cerrar, queda
                hasta que recargue o cierre la pestaña. */}
            {subidos > 0 && !enCurso && (
              <div role="status" className="rounded-2xl border-2 border-success bg-success/15 px-5 py-6 text-center shadow-[0_0_30px_rgba(34,197,94,0.25)]">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg">
                    <CheckCircle2 className="h-9 w-9" />
                  </span>
                </div>
                <h2 className="font-display text-2xl font-bold text-success">{t("drive.aportar.exitoTitulo")}</h2>
                <p className="mt-1 text-base text-success/90">{t("drive.aportar.exitoDetalle", { n: subidos })}</p>
                <p className="mt-3 text-[11px] text-muted-foreground">{t("drive.aportar.exitoPie")}</p>
              </div>
            )}

            <p className="text-center text-[11px] text-muted-foreground">{t("drive.aportar.pie")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
