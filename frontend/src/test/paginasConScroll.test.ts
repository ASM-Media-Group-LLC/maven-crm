import { describe, it, expect } from "vitest";

// EL CONTRATO DE LAYOUT DE MAVEN, PUESTO POR ESCRITO.
//
// `AppShell` envuelve la app en `h-dvh` + `overflow-hidden` (a propósito: así el
// Messenger y las llamadas manejan su propio alto y el composer no queda tapado
// por el teclado en mobile). La consecuencia es que **cada página pone su propio
// scroll**: un `<div>` con solo padding crece más allá de la pantalla, el shell
// lo recorta, y lo que sobra queda inalcanzable.
//
// Lo reportó Jhon en Grabaciones: 26 grabaciones y solo se veían las primeras.
// La auditoría encontró cinco páginas más en el mismo estado. Este test las
// mantiene arregladas y agarra la próxima antes de que llegue a prod.
//
// Cómo se cumple: un contenedor `flex-1 min-h-0 overflow-y-auto`
// (`overflow-auto` también vale) en la página o en el componente al que delega.
// `min-h-0` es imprescindible: sin eso el hijo no puede encogerse dentro de la
// columna flex y el overflow nunca se activa.
//
// El código se lee con `import.meta.glob` y no con `node:fs` a propósito: el
// tsconfig de la app apunta al navegador y no trae los tipos de Node. El patrón
// tiene que ser un literal y arranca en la RAÍZ DEL REPO (vitest corre desde
// ahí, no desde frontend/), de ahí el prefijo /frontend/src.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

const leer = (ruta: string): string | null => fuentes[ruta] ?? null;

/** No son páginas sino LAYOUTS: montan un `<Outlet>`/`children` y el scroll lo
 *  pone cada hijo (por eso HRStaffSchedules trae el suyo). */
const SON_LAYOUT = new Set(["HRLayout"]);

/** Páginas que NO viven dentro del AppShell: la ventana scrollea sola. */
const FUERA_DEL_SHELL = new Set([
  "Portada", "Privacidad", "Concepto", "Login", "NotFound", "ForgotPassword", "ResetPassword",
  "VideoCallPage", "MeetGuestPage", "ChatterPublicSession", "DesignSystem", "Docs", "Roadmap",
]);

/** El scroll de un MODAL no es el scroll de la página.
 *
 *  ⚠️ Antes esto buscaba el overflow suelto en cualquier parte del archivo, y por
 *  eso dejó pasar /chatters/horarios: la página no tenía contenedor de scroll,
 *  pero el guard encontró el `overflow-y-auto` de un <DialogContent> dentro de
 *  Equipo.tsx (a un salto de import) y la dio por cubierta. El test pasaba en
 *  verde con el bug en vivo.
 *
 *  Se descarta por ETIQUETA, no por cercanía: borrar la etiqueta de apertura de
 *  los contenedores de superposición deja fuera su className y nada más. Probé
 *  antes con una ventana de 200 caracteres hacia atrás y daba falsos positivos
 *  (HROrganigrama tiene su scroll, pero arriba hay un <SelectContent>).
 *
 *  Tampoco se pide `min-h-0` junto al overflow, aunque sea lo recomendado: media
 *  base usa `flex-1 overflow-y-auto` sin él y funciona — exigirlo marcaba 75
 *  páginas sanas. */
const SIN_SUPERPOSICIONES = /<(?:Dialog|AlertDialog|Sheet|Drawer|Popover|DropdownMenu|ContextMenu|HoverCard|Command|Select)Content\b[^>]*>|<CommandList\b[^>]*>/g;

const tieneScroll = (src: string) =>
  /overflow-(?:y-)?auto|overflow-y-scroll/.test(src.replace(SIN_SUPERPOSICIONES, ""));

/** Muchas páginas son una cáscara: el contenido (y el scroll) vive en un
 *  componente aparte. Se sigue el rastro de los imports locales —hasta dos
 *  saltos, que es lo que usa el repo— para no mantener a mano una lista que se
 *  desactualiza sola. */
function cubreElScroll(ruta: string, saltos = 2, vistos = new Set<string>()): boolean {
  if (vistos.has(ruta)) return false;
  vistos.add(ruta);
  const src = leer(ruta);
  if (src == null) return false;
  if (tieneScroll(src)) return true;
  if (saltos <= 0) return false;

  const carpeta = ruta.slice(0, ruta.lastIndexOf("/"));
  return [...src.matchAll(/from "((?:\.\/|@\/)[^"]+)"/g)]
    .map((m) => m[1])
    // ⚠️ Los primitivos de shadcn NO cuentan: un <Tooltip>, un <Select> o un
    // <Command> traen su propio scroll interno, y seguirlos daba por cubierta a
    // cualquier página que importara uno. Así se coló ChatterRendimiento, que
    // solo tiene overflow-x.
    .filter((r) => !r.startsWith("@/components/ui/"))
    .some((r) => {
      const base = r.startsWith("@/") ? `/frontend/src/${r.slice(2)}` : `${carpeta}/${r.slice(2)}`;
      const limpio = base.replace(/\/\.\//g, "/");
      return [".tsx", ".ts"].some((ext) => cubreElScroll(limpio + ext, saltos - 1, vistos));
    });
}

describe("contrato de layout: cada página trae su propio scroll", () => {
  const app = leer("/frontend/src/App.tsx") ?? "";
  const paginas = [...app.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/(pages\/[^"]+)"\)\)/g)]
    .map((m) => ({ nombre: m[1], ruta: `/frontend/src/${m[2]}.tsx` }))
    .filter(({ nombre, ruta }) =>
      !FUERA_DEL_SHELL.has(nombre) && !SON_LAYOUT.has(nombre) && leer(ruta) != null);

  it("encuentra las páginas (si esto falla, cambió cómo se declaran las rutas)", () => {
    expect(paginas.length).toBeGreaterThan(50);
  });

  it("las páginas que arreglamos por este bug siguen teniendo su contenedor", () => {
    for (const ruta of [
      "/frontend/src/pages/grabaciones/GrabacionesPage.tsx",
      "/frontend/src/pages/inbox/BotsPage.tsx",
      "/frontend/src/pages/inbox/InboxAnalyticsPage.tsx",
      "/frontend/src/pages/opportunities/OpportunitiesPage.tsx",
      "/frontend/src/pages/correo/CorreoConectarPage.tsx",
    ]) {
      const src = leer(ruta) ?? "";
      expect(src, `${ruta}: el contenedor necesita min-h-0`).toContain("flex-1 min-h-0 overflow-y-auto");
    }
    // Esta scrollea en su propia columna: HRLayout le da un contenedor con
    // overflow-hidden, así que el scroll sale de la página.
    expect(leer("/frontend/src/pages/hr/HRStaffSchedules.tsx") ?? "").toContain("min-h-0 flex-col gap-4 overflow-y-auto");
  });

  it("ninguna página nueva se olvida del scroll", () => {
    const sinScroll = paginas.filter(({ ruta }) => !cubreElScroll(ruta)).map(({ nombre }) => nombre);

    // Si agregás una página y este test falla: metele un
    // `<main className="flex-1 min-h-0 overflow-y-auto">` alrededor del
    // contenido. Si el scroll lo pone un componente que está a más de dos
    // imports de distancia, acercalo o sumá la página a SON_LAYOUT con el
    // motivo — no cambies la aserción.
    expect(sinScroll).toEqual([]);
  });
});
