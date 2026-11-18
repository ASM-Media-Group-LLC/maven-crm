// Banco de pruebas: la app de Maven (18/11/2026).
// /harness.html?ver=guia-app[&sistema=mac|windows][&en=app|celular][&tema=claro] → la guía /app.
// /harness.html?ver=app-equipo[&tema=claro] → la tarjeta «Con la app» del Hub, abierta.
// Sin sesión ni base: la guía se pinta con props y la tarjeta con presencias armadas
// (dos con la app, uno en el navegador, uno con un Maven viejo, uno en el celular).
import { MemoryRouter } from "react-router-dom";
import { VistaGuiaApp } from "@/pages/guiaApp/GuiaAppPage";
import { MarcaApp, ResumenAppDelEquipo } from "@/pages/cowork/AppDelEquipo";
import type { MediaState } from "@/hooks/useCoworkMediaPresence";

export function BancoGuiaApp({ sistema, en }: { sistema: string; en: string }) {
  return (
    <MemoryRouter>
      <div className="fondo-glass flex h-dvh w-full overflow-hidden p-2 text-foreground">
        <main className="vidrio-panel relative flex flex-1 flex-col min-h-0 overflow-hidden">
          <VistaGuiaApp
            sistemaInicial={sistema === "mac" ? "mac" : "windows"}
            enApp={en === "app"}
            enCelular={en === "celular"}
            desde={new Date(2026, 10, 20)}
          />
        </main>
      </div>
    </MemoryRouter>
  );
}

const base = { micOn: true, camOn: true, screenShareOn: true };
const ESTADOS: Record<string, MediaState> = {
  u1: { ...base, enApp: true, equipo: "windows" },
  u2: { ...base, enApp: true, equipo: "mac" },
  u3: { ...base, enApp: false, equipo: "windows" },
  u4: { ...base },
  u5: { ...base, enApp: false, equipo: "celular" },
};
const NOMBRES: Record<string, string> = { u1: "Laura Gómez", u2: "Mateo Ruiz", u3: "Sofía Díaz", u4: "Pedro Castro", u5: "Ana Ríos" };

export function BancoAppDelEquipo() {
  return (
    <div className="fondo-glass flex h-dvh w-full justify-end overflow-hidden p-2 text-foreground">
      <aside className="w-72 overflow-y-auto rounded-2xl border border-border/60 bg-card/65 pb-3 backdrop-blur-xl">
        <ResumenAppDelEquipo
          uids={Object.keys(ESTADOS)}
          mediaStates={ESTADOS}
          nombreDe={(u) => NOMBRES[u]}
          avatares={{}}
          onEscribir={() => {}}
        />
        <section className="mx-3 mt-3 space-y-1 rounded-2xl border border-border/60 bg-background/50 p-3">
          {Object.keys(ESTADOS).map((u) => (
            <div key={u} className="flex items-center gap-1.5 rounded-xl bg-primary/5 px-2 py-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
              <span className="truncate text-xs text-foreground/90">{NOMBRES[u]}</span>
              <MarcaApp estado={ESTADOS[u]} />
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}
