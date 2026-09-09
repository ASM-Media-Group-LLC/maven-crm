import { useEffect, useState } from "react";

// Medidas reales del dispositivo, para depurar la PWA en teléfonos sin
// inspector: alto de la ventana vs pantalla, áreas seguras, 100dvh, modo de
// visualización, si hay scroll lateral y qué compensación aplicó altoDeLaApp.
// Pública a propósito (no pide sesión): se abre, se saca captura y listo.
function medir() {
  const probe = document.getElementById("probe-dvh");
  const cs = getComputedStyle(document.documentElement);
  const safe = (lado: string) => {
    const el = document.getElementById(`probe-safe-${lado}`);
    return el ? getComputedStyle(el).paddingTop || "?" : "?";
  };
  return {
    "window.innerWidth × innerHeight": `${window.innerWidth} × ${window.innerHeight}`,
    "screen.width × height": `${window.screen.width} × ${window.screen.height}`,
    "visualViewport": window.visualViewport ? `${Math.round(window.visualViewport.width)} × ${Math.round(window.visualViewport.height)} (scale ${window.visualViewport.scale})` : "—",
    "100dvh (medido)": probe ? `${probe.getBoundingClientRect().height}px` : "?",
    "safe-area top / bottom": `${safe("top")} / ${safe("bottom")}`,
    "--compensacion-alto": cs.getPropertyValue("--compensacion-alto").trim() || "(sin definir)",
    "display-mode standalone": String(matchMedia("(display-mode: standalone)").matches),
    "navigator.standalone": String((navigator as Navigator & { standalone?: boolean }).standalone),
    "hover / pointer": `${matchMedia("(hover: none)").matches ? "none" : "hover"} / ${matchMedia("(pointer: coarse)").matches ? "coarse" : "fine"}`,
    "scroll lateral del documento": `${document.documentElement.scrollWidth} vs ${document.documentElement.clientWidth}${document.documentElement.scrollWidth > document.documentElement.clientWidth ? "  ← SÍ hay" : ""}`,
    "devicePixelRatio": String(window.devicePixelRatio),
    "viewport meta": document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "—",
    "userAgent": navigator.userAgent,
  };
}

export default function DiagnosticoPantalla() {
  const [datos, setDatos] = useState<Record<string, string>>({});
  useEffect(() => {
    const actualizar = () => setDatos(medir());
    actualizar();
    window.addEventListener("resize", actualizar);
    return () => window.removeEventListener("resize", actualizar);
  }, []);
  return (
    <div className="min-h-dvh bg-background p-4 text-foreground" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}>
      <div id="probe-dvh" style={{ position: "fixed", top: 0, left: 0, width: 1, height: "100dvh", visibility: "hidden" }} />
      <div id="probe-safe-top" style={{ position: "fixed", visibility: "hidden", paddingTop: "env(safe-area-inset-top, 0px)" }} />
      <div id="probe-safe-bottom" style={{ position: "fixed", visibility: "hidden", paddingTop: "env(safe-area-inset-bottom, 0px)" }} />
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign("/dashboard"))}
        className="mb-3 text-sm text-primary underline-offset-2 hover:underline"
      >
        ← Volver
      </button>
      <h1 className="text-lg font-bold">Diagnóstico de pantalla</h1>
      <p className="mb-3 text-xs text-muted-foreground">Sácale captura y mándala. No guarda nada.</p>
      <dl className="space-y-2 text-[13px]">
        {Object.entries(datos).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="break-all font-mono">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
