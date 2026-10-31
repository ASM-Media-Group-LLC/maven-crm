import { describe, it, expect } from "vitest";
import { moduloEstaOculto } from "@/lib/modulosOcultos";

// Guard del recorte reversible del menú (Alvaro, 31/10/2026). Si alguien cambia
// qué se esconde, este test lo avisa. El admin NO pasa por acá (se corta antes en
// canAccess); esto comprueba solo la regla de ocultamiento.

describe("recorte del menú (modulosOcultos)", () => {
  it("esconde Finanzas entero (con y sin submódulo)", () => {
    expect(moduloEstaOculto("Finanzas")).toBe(true);
    expect(moduloEstaOculto("Finanzas", "Nómina")).toBe(true);
    expect(moduloEstaOculto("Finanzas", "Collections")).toBe(true);
    expect(moduloEstaOculto("Finanzas", "Control Financiero")).toBe(true);
  });

  it("esconde Ventas y leads (LeadGen, Closers, Scouter, Teléfonos)", () => {
    expect(moduloEstaOculto("LeadGen")).toBe(true);
    expect(moduloEstaOculto("Closers")).toBe(true);
    expect(moduloEstaOculto("Scouter Assist")).toBe(true);
    expect(moduloEstaOculto("Telefonos")).toBe(true);
  });

  it("en RRHH esconde lo administrativo pero DEJA el control de tiempo, monitoreo y avisos", () => {
    // Escondidos
    for (const sub of [
      "Dashboard", "Empleados Activos", "Candidatos", "Onboarding", "Offboarding",
      "Vacaciones", "Permisos", "Incidentes", "Desempeño", "Capacitación",
      "Directorio", "Organigrama", "Deducciones",
    ]) {
      expect(moduloEstaOculto("HR", sub)).toBe(true);
    }
    // Visibles (reemplazo tipo-Hubstaff + monitoreo + avisos)
    for (const sub of [
      "Asistencia", "Horarios", "Horarios Chatters", "Horas Extra",
      "Banco de Horas", "Monitoreo", "Anuncios",
    ]) {
      expect(moduloEstaOculto("HR", sub)).toBe(false);
    }
    // Un ítem de HR sin submódulo no se esconde por sí solo.
    expect(moduloEstaOculto("HR")).toBe(false);
  });

  it("NO toca el núcleo que se queda (Menú, Operaciones salvo ventas, Oficina)", () => {
    for (const m of [
      "Dashboard", "Correo", "Messenger", "Cowork", "Meet", "Grabaciones",
      "Contactos", "Oficina", "Promolog", "Parrilla", "Personalizados",
      "WhatsApp", "Telegram", "Tickets", "Chatters", "Agency QA",
    ]) {
      expect(moduloEstaOculto(m)).toBe(false);
    }
  });
});
