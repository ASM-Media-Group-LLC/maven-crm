// Banco «antes → después» de Argos: dibuja las PANTALLAS REALES (HRExpediente y
// HRMonitorIA) con el Supabase de mentira. El mismo archivo corre sobre el código
// de antes y el de ahora. ?ver=expediente | dia | equipos | donde
//   &clic=<texto de un botón>  → lo toca al cargar (p. ej. «Turno AM»)
//   &sel=<selector css>&n=<i>  → toca ese elemento al cargar (p. ej. una miniatura)
import "./reloj";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AuthContext } from "@/hooks/useAuth";
import HRExpediente from "@/pages/hr/HRExpediente";
import HRMonitorIA from "@/pages/hr/HRMonitorIA";
import { PERSONA, VIEWER } from "./datos";
import "@/index.css";

const q = new URLSearchParams(window.location.search);
const ver = q.get("ver") ?? "expediente";
const ruta = ver === "expediente" ? `/hr/expediente/${PERSONA}`
  : ver === "dia" ? "/hr/monitor-ia?t=dia"
  : ver === "equipos" ? "/hr/monitor-ia?t=dia&vista=equipos"
  : "/hr/monitor-ia?t=donde";
// Chrome sin ventana no baja de 500 px de ancho: con &ancho=375 el cuerpo mide 375 y
// es el bloque de los «fixed» (los diálogos), así la página se dibuja como en un teléfono.
const ancho = Number(q.get("ancho") ?? "0");
if (ancho) {
  Object.assign(document.body.style, { width: `${ancho}px`, minHeight: "100vh", overflowX: "hidden", transform: "translateZ(0)" });
  // Foto de un diálogo: el cuerpo mide lo que la ventana, para que quede centrado en ella.
  if (q.get("sel")) Object.assign(document.body.style, { height: "100vh", overflowY: "hidden" });
}
if (q.get("skin")) document.documentElement.setAttribute("data-skin", q.get("skin")!);
if (q.get("tema") === "claro") document.documentElement.classList.remove("dark");
else document.documentElement.classList.add("dark");

function Tocar() {
  useEffect(() => {
    const clic = q.get("clic");
    const sel = q.get("sel");
    const n = Number(q.get("n") ?? "0");
    const a = setTimeout(() => {
      // &clic=A|B: toca A y, 1,5 s después, B (por el texto con que empieza el botón).
      (clic ?? "").split("|").filter(Boolean).forEach((txt, i) => setTimeout(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim().startsWith(txt));
        b?.click();
      }, i * 1500));
      if (sel) (document.querySelectorAll(sel)[n] as HTMLElement | undefined)?.click();
    }, 1500);
    // &ir=<texto>: lleva la vista al primer título que empiece con ese texto.
    const ir = q.get("ir");
    const c = ir ? setTimeout(() => {
      const el = [...document.querySelectorAll("p, h2, span")].find((x) => x.textContent?.trim().startsWith(ir));
      // En vez de desplazar (el contenedor de <Page> no se deja), se esconde lo de arriba.
      let sec = el?.closest("section")?.previousElementSibling as HTMLElement | null | undefined;
      while (sec) { sec.style.display = "none"; sec = sec.previousElementSibling as HTMLElement | null; }
    }, 3000) : undefined;
    // &solo=<texto>: marca en <body data-recorte> el rectángulo de las secciones que
    // contienen ese texto (para recortar la foto justo a esa sección).
    const solo = q.get("solo");
    const d = solo ? setTimeout(() => {
      const secs = [...document.querySelectorAll("section")].filter((x) => x.textContent?.includes(solo) && !x.parentElement?.closest("section"));
      if (!secs.length) return;
      const rs = secs.map((x) => x.getBoundingClientRect());
      const top = Math.min(...rs.map((r) => r.top)), left = Math.min(...rs.map((r) => r.left));
      const bottom = Math.max(...rs.map((r) => r.bottom)), right = Math.max(...rs.map((r) => r.right));
      document.body.dataset.recorte = JSON.stringify({ x: Math.max(0, left - 12), y: Math.max(0, top - 12), w: right - left + 24, h: bottom - top + 24 });
    }, 6000) : undefined;
    // &contenido=1: el recorte va de arriba hasta el último texto o tarjeta visible.
    const e0 = q.get("contenido") ? setTimeout(() => {
      let fondo = 0;
      document.querySelectorAll("section, ul, li, button, p, h1, h2, a, img").forEach((x) => {
        const r = x.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) fondo = Math.max(fondo, r.bottom);
      });
      document.body.dataset.recorte = JSON.stringify({ x: 0, y: 0, w: window.innerWidth, h: Math.ceil(fondo + 24) });
    }, 7000) : undefined;
    if (c || d || e0) { const b0 = a; return () => { clearTimeout(b0); if (c) clearTimeout(c); if (d) clearTimeout(d); if (e0) clearTimeout(e0); }; }
    return () => clearTimeout(a);
  }, []);
  return null;
}

const auth = { user: { id: VIEWER } as never, session: { access_token: "x" } as never, loading: false, signOut: async () => {} };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}>
          <MemoryRouter initialEntries={[ruta]}>
            <div className="fondo-glass min-h-dvh bg-background text-foreground">
              <Routes>
                <Route path="/hr/expediente/:userId" element={<HRExpediente />} />
                <Route path="/hr/monitor-ia" element={<HRMonitorIA />} />
              </Routes>
              <Tocar />
            </div>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>
    </LanguageProvider>
  </StrictMode>,
);
