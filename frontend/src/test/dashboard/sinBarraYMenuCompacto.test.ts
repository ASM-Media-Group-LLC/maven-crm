import { describe, expect, it } from "vitest";
import { personasQueCoinciden } from "@/pages/messenger/ChatSidebar";

// SIN BARRA DE ARRIBA, MENÚ ABIERTO Y COMPACTO, UN SOLO BUSCADOR EN MENSAJES
// (Alvaro, 18/11/2026, preguntas y respuestas):
//   · «esta mierda (la barra de arriba) volátela… no quita espacio» → se va en
//     computador; idioma, mensajes y campana bajan al pie del menú; el buscador
//     sigue con ⌘K y con una lupa arriba del menú. En el teléfono la barra
//     sigue (ahí se abre el menú). En la app queda una franja para arrastrar.
//   · «que Maven me reciba abierto el lado izquierdo… está muy grande» → abierto
//     por defecto, 13.5rem, letra e íconos más chicos.
//   · «search all chats y el + es pendejada» → un buscador que trae chats y
//     gente nueva; el «+» es solo «Nuevo grupo».
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.
type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  [
    "/frontend/src/components/dashboard/DashboardTopbar.tsx",
    "/frontend/src/components/dashboard/AppShell.tsx",
    "/frontend/src/components/dashboard/DashboardSidebar.tsx",
    "/frontend/src/pages/messenger/ChatSidebar.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

describe("la barra de arriba", () => {
  it("en computador no está; en el teléfono sí", () => {
    expect(fuente("DashboardTopbar.tsx")).toMatch(/<header className="barra-arrastrable vidrio-barra[^"]*md:hidden">/);
  });
  it("en la app queda la franja para arrastrar la ventana", () => {
    expect(fuente("DashboardTopbar.tsx")).toMatch(/<div className="barra-arrastrable hidden h-7 shrink-0 items-center md:flex">/);
  });
  it("el buscador se abre también desde el menú", () => {
    expect(fuente("DashboardTopbar.tsx")).toContain("window.addEventListener(EVENTO_ABRIR_BUSCADOR, abrir);");
    expect(fuente("DashboardSidebar.tsx")).toContain("onClick={abrirBuscador}");
  });
});

describe("el menú izquierdo", () => {
  it("arranca abierto y más angosto", () => {
    expect(fuente("AppShell.tsx")).toContain('<SidebarProvider defaultOpen style={{ "--sidebar-width": "13.5rem" } as CSSProperties}>');
  });
  it("trae el botón para plegarlo y, abajo, idioma, mensajes y campana", () => {
    const s = fuente("DashboardSidebar.tsx");
    expect(s).toMatch(/<SidebarTrigger className="h-8 w-8 rounded-full"/);
    expect(s).toMatch(/<SelectorDeIdioma \/>\s*<MessagesBell \/>\s*<NotificationBell \/>/);
  });
});

describe("un solo buscador en Mensajes", () => {
  const gente = [
    { id: "1", full_name: "Grace Gelves M." },
    { id: "2", full_name: "Ángela Pérez" },
    { id: "3", full_name: "Daniel Ospina" },
  ];
  it("trae la gente que coincide, sin tildes ni mayúsculas", () => {
    expect(personasQueCoinciden(gente, "angela", new Set()).map((p) => p.id)).toEqual(["2"]);
    expect(personasQueCoinciden(gente, "GELVES", new Set()).map((p) => p.id)).toEqual(["1"]);
  });
  it("quien ya tiene chat contigo no sale dos veces", () => {
    expect(personasQueCoinciden(gente, "a", new Set(["1", "2"])).map((p) => p.id)).toEqual(["3"]);
  });
  it("sin búsqueda, nada", () => {
    expect(personasQueCoinciden(gente, "  ", new Set())).toEqual([]);
  });
  it("el «+» crea un grupo", () => {
    expect(fuente("ChatSidebar.tsx")).toMatch(/onClick=\{onNewGroup\}\s*title=\{t\("messenger\.sidebar\.nuevoGrupo"\)\}/);
  });
});
