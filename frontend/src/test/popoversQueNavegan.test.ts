import { describe, it, expect } from "vitest";

// UN POPOVER QUE TE LLEVA A OTRA PANTALLA TIENE QUE CERRARSE SOLO.
//
// Radix no cierra el panel cuando el clic ocurre DENTRO de él: solo reacciona al
// clic afuera, a Escape o al propio trigger. Así que un `navigate()` metido en
// el contenido del popover cambia la página y deja el panel abierto encima,
// tapándola — y toca dar otro clic afuera para sacarlo.
//
// Lo reportó Jhon en la campana de notificaciones (08/09): "Ver todas las
// notificaciones" llevaba a /notificaciones con el panel todavía abierto. La
// nube de Messenger (MessagesBell) ya lo hacía bien desde antes, así que el
// arreglo fue copiarla.
//
// La regla: si un componente monta un Popover Y navega, el Popover va
// CONTROLADO (`<Popover open={...} onOpenChange={...}>`) para poder cerrarlo
// antes de navegar. Sin `open`, no hay forma de cerrarlo desde el handler.
//
// Se lee con import.meta.glob y no con node:fs porque el tsconfig de la app
// apunta al navegador. El patrón arranca en la RAÍZ del repo: vitest corre ahí.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.tsx", { query: "?raw", import: "default", eager: true });

describe("un popover que navega se cierra al navegar", () => {
  // Solo lo que está DENTRO de <PopoverContent>…</PopoverContent>. Mirar el
  // archivo entero daba tres falsos positivos: en las pantallas de RRHH el
  // popover es un calendario y el navigate es la flecha de volver; en
  // ThreadPanel el popover es el selector de emojis y el navigate abre el DM de
  // una mención. Nada que ver entre ellos.
  //
  // LÍMITE CONOCIDO: solo ve los `navigate()` escritos ahí mismo. Si el panel
  // llama a un handler declarado más arriba que navega, esto no lo detecta;
  // seguirlo pediría análisis de flujo, que no es para un test de guarda.
  const paneles = (codigo: string): string[] =>
    [...codigo.matchAll(/<PopoverContent[\s\S]*?<\/PopoverContent>/g)].map((m) => m[0]);

  it("todos los que llevan a otra pantalla están controlados", () => {
    const culpables: string[] = [];

    for (const [ruta, codigo] of Object.entries(fuentes)) {
      const navegaDesdeElPanel = paneles(codigo).some((panel) => /\bnavigate\(/.test(panel));
      if (!navegaDesdeElPanel) continue;

      // Controlado = el Popover recibe `open`. Con eso el handler puede cerrarlo.
      const controlado = /<Popover\s[^>]*\bopen=/.test(codigo);
      if (!controlado) culpables.push(ruta);
    }

    expect(culpables, `Estos popovers navegan pero no se pueden cerrar:\n${culpables.join("\n")}`)
      .toEqual([]);
  });

  it("el test se mira a sí mismo: encuentra los popovers que navegan", () => {
    // Si un refactor renombra PopoverContent o parte el JSX de otra forma, el
    // test de arriba pasaría en verde sin revisar NADA. Esto lo delata.
    const conNavegacion = Object.entries(fuentes).filter(([, c]) =>
      paneles(c).some((panel) => /\bnavigate\(/.test(panel)),
    );
    expect(conNavegacion.length).toBeGreaterThan(0);
  });
});
