// Los textos de Cowork que salen de un ESTADO (pausa del supervisor, reloj
// detenido) viven ahora en el diccionario y no en las funciones de lib/.
// Dos cosas que no pueden pasar en silencio:
//   1. que el español del diccionario deje de decir lo mismo que lib/ (en
//      español la pantalla tiene que quedar igual que antes);
//   2. que un estado nuevo llegue sin su clave (en inglés saldría la clave).
import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { getTranslation } from "@/lib/i18n";
import { ESTADOS_SUPERVISOR, fraseDePausaSupervisor, subtituloDePausaSupervisor, fijarPausaSupervisor } from "@/lib/pausaSupervisor";
import { motivoDetenido, motivoDetenidoDeOtro } from "@/lib/coworkReloj";
import { ESTADOS_TIEMPO, cuentaComoTrabajo } from "@/lib/coworkTiempoRegla";
import { ETIQUETA_SUPERVISOR, FRASE_SUPERVISOR, SUBTITULO_SUPERVISOR, claveMotivoDetenido } from "@/pages/cowork/textosCowork";
import PausaSupervisorBoton from "@/pages/cowork/PausaSupervisorBoton";
import { enEspanol } from "./enIngles";

const es = (k: Parameters<typeof getTranslation>[0]) => getTranslation(k, "es");

describe("el español del diccionario es el mismo de lib/", () => {
  it("la pausa del supervisor: chapa, frase y subtítulo", () => {
    for (const { valor, etiqueta } of ESTADOS_SUPERVISOR) {
      expect(es(ETIQUETA_SUPERVISOR[valor])).toBe(etiqueta);
      expect(es(FRASE_SUPERVISOR[valor])).toBe(fraseDePausaSupervisor(valor));
      expect(es(SUBTITULO_SUPERVISOR[valor])).toBe(subtituloDePausaSupervisor(valor));
    }
  });

  it("por qué está detenido el reloj, a la persona y a los demás", () => {
    for (const estado of ESTADOS_TIEMPO) {
      const propio = claveMotivoDetenido(estado);
      const deOtro = claveMotivoDetenido(estado, true);
      expect(propio ? es(propio) : null).toBe(motivoDetenido(estado));
      expect(deOtro ? es(deOtro) : null).toBe(motivoDetenidoDeOtro(estado));
    }
  });

  it("⚠️ todo estado en que el reloj se DETIENE tiene su motivo (null contra null no vale)", () => {
    // La prueba de arriba compara el diccionario con lib/: si faltaran los dos,
    // daría null contra null y pasaría en verde. Esta no.
    let detenidos = 0;
    for (const estado of ESTADOS_TIEMPO) {
      if (cuentaComoTrabajo(estado)) continue;
      detenidos++;
      expect(claveMotivoDetenido(estado), estado).not.toBeNull();
      expect(claveMotivoDetenido(estado, true), estado).not.toBeNull();
      expect(motivoDetenido(estado), estado).not.toBeNull();
      expect(motivoDetenidoDeOtro(estado), estado).not.toBeNull();
    }
    expect(detenidos).toBeGreaterThanOrEqual(5);
  });
});

describe("las piezas chicas en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    fijarPausaSupervisor(null);
  });

  const conIdioma = (ui: ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

  it("la tacita del supervisor y su menú", () => {
    conIdioma(<PausaSupervisorBoton />);
    const boton = screen.getByRole("button", { name: "Supervisor pause" });
    expect(boton.getAttribute("title")).toBe("Mark a pause: break, lunch or away");
    fireEvent.click(boton);
    expect(screen.getByText("Your chatters will see that you're paused")).toBeTruthy();
    fireEvent.click(screen.getByText("Away"));
    expect(enEspanol(document.body)).toEqual([]);
    expect(screen.getByRole("button", { name: "Supervisor pause" }).getAttribute("title")).toBe("You're away. Tap to change.");
  });
});
