import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// LA CAMPANA SE ENTERA AL INSTANTE, TAMBIÉN DESPUÉS DE UNA CAÍDA DEL SOCKET.
//
// Jhon (16/09): la mención llegó al popup y a la nube al instante, pero a la
// campana "mucho rato después". Su canal tenía nombre fijo y nadie lo revivía
// cuando el socket lo dejaba en CLOSED; el respaldo (refetch de 60 s) se pausa
// sin foco. Va por useCanalQueRevive, como todo Messenger.
// Desde la raíz del repo (root de vitest): en jsdom import.meta.url no es file:.
const src = readFileSync(resolve(process.cwd(), "frontend/src/hooks/useNotifications.ts"), "utf8");

describe("campana en vivo", () => {
  it("usa el canal que revive, con topic versionado por usuario", () => {
    expect(src).toMatch(/useCanalQueRevive\(\{\s*topic: uid \? `notifications-\$\{uid\}` : null/);
    expect(src).toMatch(/alRevivir: \(\) => \{ void qc\.invalidateQueries/);
  });
  it("ya no hay canal de nombre fijo ni subscribe a mano", () => {
    expect(src).not.toMatch(/\.channel\("notifications-realtime"\)/);
    // Código, no comentarios: una línea que empiece por `.subscribe(`.
    expect(src).not.toMatch(/\n\s*\.subscribe\(/);
  });
  it("los ajustes de sonido no recrean el canal (van por ref)", () => {
    expect(src).toMatch(/sonidoRef\.current = \{ sonar: notifSettings\.sound_enabled/);
  });
});
