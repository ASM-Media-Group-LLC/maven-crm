import { describe, expect, it } from "vitest";
import { agruparVisibles } from "@/pages/creadores/LineamientosSoloLectura";

// Frontera de privacidad: qué lineamientos de la creadora ve el chatter que
// abre el perfil por su roster. Lo que no está en la lista blanca NO se muestra
// —ni el número de emergencia, ni datos bancarios, ni contratos— y una sección
// desconocida tampoco pasa.
const fila = (guideline_type: string, title: string) => ({ guideline_type, title, content: "x" });

const aplanar = (g: Array<{ items: Array<{ title: string }> }>) => g.flatMap((x) => x.items.map((i) => i.title));

describe("lineamientos del chatter · lista blanca", () => {
  it("muestra lo operativo, en los dos vocabularios de guideline_type", () => {
    const grupos = agruparVisibles([
      fila("limits", "No mostrar cara completa"),          // slug viejo
      fila("pricing", "Video personalizado (1 min)"),        // slug viejo
      fila("Operación Core", "Precios"),                     // nombre de categoría
      fila("Gestión de Chats", "Fans VIP / Whales"),
    ]);
    expect(aplanar(grupos).sort()).toEqual([
      "Fans VIP / Whales", "No mostrar cara completa", "Precios", "Video personalizado (1 min)",
    ].sort());
  });

  it("NUNCA muestra contacto, plata, contratos ni cuentas backup", () => {
    const grupos = agruparVisibles([
      fila("payments", "Datos bancarios"),
      fila("contracts", "Contrato de management firmado"),
      fila("backup_accounts", "Cuenta backup Fansly"),
      fila("verification", "Documentos 2257 completos"),
      fila("emergency_contact", "Celular de la mamá"),
      fila("Horarios", "Contacto de Emergencia"),
      fila("Plataformas y Cuentas", "Cuentas Backup"),
      fila("Administrativo", "Info de Pagos"),
    ]);
    expect(grupos).toEqual([]);
  });

  it("una sección desconocida no pasa (la lista es blanca, no negra)", () => {
    expect(agruparVisibles([fila("datos_personales", "Dirección de la casa")])).toEqual([]);
  });

  it("deja el resto de una categoría permitida cuando excluye un título", () => {
    const grupos = agruparVisibles([
      fila("Horarios", "Contacto de Emergencia"),
      fila("Horarios", "Horarios y Disponibilidad"),
      fila("Horarios", "Zonas Horarias"),
    ]);
    expect(aplanar(grupos)).toEqual(["Horarios y Disponibilidad", "Zonas Horarias"]);
  });

  it("agrupa en el orden de las secciones: lo operativo primero", () => {
    const grupos = agruparVisibles([
      fila("retention", "Contenido exclusivo semanal"),
      fila("limits", "Palabras prohibidas"),
      fila("Operación Core", "Límites"),
    ]);
    expect(grupos.map((g) => g.etiqueta)).toEqual(["Operación core", "Límites", "Retención"]);
  });

  it("tolera datos sucios sin romperse", () => {
    const grupos = agruparVisibles([
      { guideline_type: "  LIMITS  ", title: null, content: "y" },
      { guideline_type: null, title: "sin sección", content: "y" },
    ]);
    expect(grupos.map((g) => g.etiqueta)).toEqual(["Límites"]);
  });
});
