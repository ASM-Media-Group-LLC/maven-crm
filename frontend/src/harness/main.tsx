// Banco de pruebas visual — NO se compila en producción (vive fuera de App.tsx
// y de cualquier ruta; se sirve sólo por /harness.html en el dev server).
//
// Sirve para mirar una pantalla con datos reales sin tener que loguearse:
// se le pasan los props a mano, así no hace falta Supabase ni sesión.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/hooks/useLanguage";
import UsersTable from "@/pages/admin/UsersTable";
import UsersGrid from "@/pages/admin/UsersGrid";
import type { AdminUser } from "@/pages/admin/useAdminUsers";
import BancoNas from "./bancoNas";
import BancoLinks from "./bancoLinks";
import BancoTableros from "./bancoTableros";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VirtualOfficePage from "@/pages/oficina-ai/VirtualOfficePage";
import TardanzasPage from "@/pages/admin/TardanzasPage";
import "@/index.css";

// Gente real del roster (nombre, rol y avatar_seed salidos de prod) para que los
// muñequitos se dibujen con su seed de verdad y no con uno inventado.
const u = (
  full_name: string,
  email: string,
  role: string | null,
  avatar_seed: string | null,
): AdminUser => ({
  id: avatar_seed ?? email,
  full_name,
  email,
  role: role as AdminUser["role"],
  nivel: null,
  avatar_seed,
  avatar_url: null,
  created_at: "2026-08-21T20:33:52Z",
  manageable: true,
  role_level: 1,
  linked_employee: null,
  ai_daily_quota_override: null,
});

const USERS: AdminUser[] = [
  u("Alexandra Giraldo", "alexandra.giraldo@maven-ai.me", "Chatter", "1b192984-d94d-4d93-8dc1-f185e2c51b12:cmfwbo"),
  u("Alvaro René", "alvaro.rene@maven-ai.me", "admin", "fcdfdfcb-c0ab-4c82-b6d9-d50d37ab086e:kj6afl"),
  u("Breyner Garzon", "breyner.garzon@unlok.me", "Chatter", "4dbb13f9-8831-4247-b054-ce738a808486:x1wtbh"),
  u("Daniel Ospina", "daniel.ospina@unlok.me", "Chatter Supervisor", "4d502376-eb16-42f6-bda2-4b92582a26e6:8akzua"),
  u("David Aunta", "david.aunta@maven-ai.me", "Coordinador", "3671c9da-d3f9-40e6-8635-ff53745ed282:yqdu4q"),
  u("Fabiana Durán", "fabiana.duran@unlok.me", "manager", "dd959846-929b-4b10-a8ba-42c821996e8a:41y34u"),
  u("Isabel Tuiran", "isabel.tuiran@unlok.me", "Warming", "85726405-3037-456a-9af2-c167f707237a:qsv2tq"),
  u("Jhon Lopez", "jhon.j.lopez@unlok.me", "admin", "c5b124cb-f272-458d-aa8e-1b11de0ff4d6:u26ao5"),
  // Sin muñequito elegido → iniciales sobre degradé (la otra rama del fallback).
  u("Michel Zarate", "michel.zarate@unlok.me", null, null),
  u("Monica Duque", "monica.duque@unlok.me", "manager", null),
];

const noop = () => {};

// UsersTable y UsersGrid llaman a useLanguage(), que tira sin proveedor: sin
// esto la página se caía al montar. Con él también se puede mirar en inglés
// (localStorage app-language=en y recargar).
// /harness.html?ver=nas → el medidor del NAS; ?ver=nas-pagina → su página completa.
const ver = new URLSearchParams(window.location.search).get("ver");
const verNas = ver === "nas" || ver === "nas-pagina" || ver === "links";
const verTablero = ver === "mio" || ver === "rrhh";
// /harness.html?ver=oficina-ai | tardanzas → pantallas del contrato de diseño (sin sesión).
const verPantalla = ver === "oficina-ai" || ver === "tardanzas";

createRoot(document.getElementById("root")!).render(
  verPantalla ? (
    <StrictMode>
      <LanguageProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <div className="flex h-dvh flex-col bg-background text-foreground">
              {ver === "oficina-ai" ? <VirtualOfficePage /> : <TardanzasPage />}
            </div>
          </MemoryRouter>
        </QueryClientProvider>
      </LanguageProvider>
    </StrictMode>
  ) :
  verTablero ? (
    <StrictMode>
      <LanguageProvider><BancoTableros cual={ver as "mio" | "rrhh"} /></LanguageProvider>
    </StrictMode>
  ) :
  verNas ? (
    <StrictMode>
      <LanguageProvider>{ver === "links" ? <BancoLinks /> : <BancoNas pagina={ver === "nas-pagina"} />}</LanguageProvider>
    </StrictMode>
  ) :
  <StrictMode>
    <LanguageProvider>
      <MemoryRouter>
        <div className="min-h-dvh bg-background p-6 text-foreground">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Vista lista
          </h2>
          <UsersTable
            users={USERS}
            onEditRole={noop}
            onEdit={noop}
            onResetPassword={noop}
            onMigrarCorreo={noop}
            onDelete={noop}
            onRemoveRole={noop}
          />
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Vista tarjetas
          </h2>
          <UsersGrid
            users={USERS}
            onEditRole={noop}
            onEdit={noop}
            onResetPassword={noop}
            onMigrarCorreo={noop}
            onDelete={noop}
            onRemoveRole={noop}
          />
        </div>
      </MemoryRouter>
    </LanguageProvider>
  </StrictMode>,
);
