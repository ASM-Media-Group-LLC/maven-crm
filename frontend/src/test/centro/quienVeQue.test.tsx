import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { Clock } from "lucide-react";

// GUARD de «quién ve qué» (Alvaro, 10/11/2026: «no quiero que todo el mundo vaya
// a ver esta mierda»):
//  · Salud de la plataforma y el NAS: solo el dueño (los admins, no).
//  · Pulso: dueño/admin/manager por jerarquía, RR. HH. a todo el personal y
//    cada supervisor SOLO a su equipo.
//  · RR. HH. tiene su tablero (asistencia, tardanzas, conectados, Argos).
//  · El resto ve «solo lo suyo»: sus horas, sus avisos y sus accesos.
// Un fallo siempre se dice como fallo, nunca como «vacío».

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => ({ tier: "agent", isLoading: false }) }));

import { alcanceDelPulso } from "@/lib/pulsoEquipo";
import { filterNavCatalog, NAV_CATALOG, type NavCatalogEntry } from "@/lib/navCatalog";
import { MiTableroVista, accesosDirectos, type AvisoMio, type EstadoLectura } from "@/pages/dashboard/MiTablero";
import { TableroRRHHVista, type DatosRRHH } from "@/pages/dashboard/TableroRRHH";

const fuente = (ruta: string): string => {
  const todo = import.meta.glob(
    [
      "/frontend/src/components/centro/SaludPlataformaBloque.tsx",
      "/frontend/src/components/centro/EspacioNasBloque.tsx",
      "/frontend/src/components/dashboard/DashboardSidebar.tsx",
      "/frontend/src/pages/Dashboard.tsx",
      "/frontend/src/App.tsx",
      "/supabase/migrations/20261110230000_quien_ve_que.sql",
    ],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>;
  return todo[ruta] ?? "";
};

const enRouter = (n: ReactNode) => render(<MemoryRouter>{n}</MemoryRouter>);
const listo = <T,>(data: T): EstadoLectura<T> => ({ data, cargando: false, fallo: false, reintentar: () => undefined });

describe("Salud y NAS: solo el dueño", () => {
  it("los bloques del Centro se abren solo con esDueno (ya no con isAdmin)", () => {
    for (const ruta of ["/frontend/src/components/centro/SaludPlataformaBloque.tsx", "/frontend/src/components/centro/EspacioNasBloque.tsx"]) {
      const src = fuente(ruta);
      expect(src, ruta).toContain("esDueno === true");
      expect(src, ruta).not.toMatch(/\bisAdmin\b/);
    }
  });

  it("el menú, el buscador y la ruta del NAS piden dueño", () => {
    expect(fuente("/frontend/src/components/dashboard/DashboardSidebar.tsx")).not.toMatch(/esAdminDelMenu/);
    expect(fuente("/frontend/src/App.tsx")).toMatch(/path="\/oficina\/espacio-nas" element=\{<PermissionRoute module="Oficina" soloDueno>/);
    const nas = NAV_CATALOG.find((e) => e.url === "/oficina/espacio-nas")!;
    const todo = () => true;
    expect(filterNavCatalog(todo, true, [nas], false)).toEqual([]); // admin, no dueño
    expect(filterNavCatalog(todo, true, [nas], true)).toEqual([nas]); // dueño
  });

  it("la base cierra las funciones de Salud/NAS al dueño y abre a cada supervisor solo su equipo", () => {
    const sql = fuente("/supabase/migrations/20261110230000_quien_ve_que.sql");
    expect(sql).toContain("replace(pg_get_functiondef(f.oid), 'public.es_admin_o_dueno(', 'public.es_dueno(')");
    expect(sql).toMatch(/alter policy nas_espacio_admin_lee[\s\S]*es_dueno\(\(select auth\.uid\(\)\)\)/);
    for (const tabla of ["monitor_rondas", "cowork_breaks", "monitor_eventos"]) {
      expect(sql).toMatch(new RegExp(`create policy \\w+ on public\\.${tabla}[\\s\\S]*?mi_equipo_supervisado\\(\\)`));
    }
    // Las políticas que ya existían no se borran (ALTER, nunca DROP + CREATE).
    expect(sql).not.toMatch(/drop policy/i);
  });
});

describe("a quién ve cada uno en el Pulso", () => {
  it("jerarquía, RR. HH. y supervisor (solo su equipo)", () => {
    expect(alcanceDelPulso("dueno", false)).toBe("jerarquia");
    expect(alcanceDelPulso("admin", false)).toBe("jerarquia");
    expect(alcanceDelPulso("manager", false)).toBe("jerarquia");
    expect(alcanceDelPulso("agente", true)).toBe("rrhh");     // Andrea, Lina, hhrr
    expect(alcanceDelPulso("manager", true)).toBe("rrhh");
    expect(alcanceDelPulso("supervisor", false)).toBe("equipo"); // Daniel, Breyner, Vanessa
    expect(alcanceDelPulso("agente", false)).toBeNull();
    expect(alcanceDelPulso(null, false)).toBeNull();
  });
});

describe("el repartidor de tableros", () => {
  it("RR. HH. va a su tablero y el resto a «solo lo suyo» (no al genérico)", () => {
    const src = fuente("/frontend/src/pages/Dashboard.tsx");
    expect(src).toMatch(/if \(esRh === true\) \{\s*return <Suspense fallback=\{<Cargando \/>\}><TableroRRHH \/>/);
    expect(src).not.toContain("DashboardContent");
    expect(src).toMatch(/return <MiTablero \/>;\s*\};/);
  });
});

const AVISOS: AvisoMio[] = [
  { id: "1", title: "Te llegó un aviso", message: "Revisa tu turno", created_at: new Date().toISOString(), status: "new", deep_link_url: "/cowork" },
];
const ACCESOS: NavCatalogEntry[] = [
  { title: "Correo", i18nKey: "nav.mail", url: "/correo", icon: Clock, section: "Menú" },
];

describe("«solo lo tuyo»", () => {
  it("muestra tus horas, tus avisos y tus accesos", () => {
    enRouter(<MiTableroVista nombre="Angie" fecha="lunes" horas={listo({ hoy: 2.5, semana: 11 })} avisos={listo(AVISOS)} accesos={ACCESOS} />);
    expect(screen.getByText("2 h 30 m")).toBeInTheDocument();
    expect(screen.getByText("11 h 00 m")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Te llegó un aviso/ })).toHaveAttribute("href", "/cowork");
    expect(screen.getByRole("link", { name: "nav.mail" })).toHaveAttribute("href", "/correo");
  });

  it("⚠️ si las horas o los avisos fallan lo dice con Reintentar (no «0 h» ni «sin avisos»)", () => {
    const reintentar = vi.fn();
    enRouter(<MiTableroVista nombre="" fecha="" horas={{ data: undefined, cargando: false, fallo: true, reintentar }}
      avisos={{ data: undefined, cargando: false, fallo: true, reintentar }} accesos={[]} />);
    const alertas = screen.getAllByRole("alert");
    expect(alertas).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "dashboard.centro.reintentar" })[0]);
    expect(reintentar).toHaveBeenCalled();
    expect(screen.queryByText("dashboard.mio.sinAvisos")).toBeNull();
  });

  it("los accesos no repiten el tablero ni traen Admin/Sistema", () => {
    const urls = accesosDirectos(NAV_CATALOG).map((e) => e.url);
    expect(urls).not.toContain("/dashboard");
    expect(accesosDirectos(NAV_CATALOG).some((e) => e.section === "Admin" || e.section === "Sistema")).toBe(false);
  });
});

describe("el tablero de RR. HH.", () => {
  const DATOS: DatosRRHH = {
    tardanzas: [{ id: "t1", nombre: "Laura Gómez", avatarUrl: null, avatarSeed: null, turno: "AM", tardeMin: 12, entroAt: "2026-11-10T13:12:00Z" }],
    asistencia: [{ id: "u1", nombre: "Pedro Ruiz", avatarUrl: null, avatarSeed: null, horas: 6.25, sinCamara: 0.5, sinPantalla: 0 }],
  };

  it("tardanzas con sus minutos y asistencia con sus horas (y lo que estuvo sin cámara)", () => {
    enRouter(<TableroRRHHVista fecha="lunes" datos={listo(DATOS)} pulso={<div>pulso</div>} />);
    expect(screen.getByText("Laura Gómez")).toBeInTheDocument();
    expect(screen.getByText(/dashboard.rrhh.minTarde.*12/)).toBeInTheDocument();
    expect(screen.getByText("6 h 15 m")).toBeInTheDocument();
    expect(screen.getByText(/dashboard.rrhh.sinCamara.*30 m/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard.rrhh.abrirArgos/ })).toHaveAttribute("href", "/hr/monitor-ia");
  });

  it("⚠️ si la lectura falla lo dice (no «nadie llegó tarde»)", () => {
    enRouter(<TableroRRHHVista fecha="" datos={{ data: undefined, cargando: false, fallo: true, reintentar: () => undefined }} pulso={null} />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByText("dashboard.rrhh.sinTardanzas")).toBeNull();
  });
});
