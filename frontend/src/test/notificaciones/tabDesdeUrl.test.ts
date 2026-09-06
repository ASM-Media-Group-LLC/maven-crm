// La pestaña de Ajustes → Notificaciones vive en la URL: refrescar en Eventos
// tiene que volver a Eventos (antes F5 devolvía siempre a General).
import { describe, it, expect } from "vitest";
import { TABS, tabDesdeUrl, urlDeTab } from "@/pages/ajustes/notificaciones/tabs";

describe("tabDesdeUrl", () => {
  it("cada pestaña se recupera de su propio parámetro", () => {
    for (const t of TABS) expect(tabDesdeUrl(t.id)).toBe(t.id);
  });
  it("sin parámetro o con uno inventado cae en General", () => {
    expect(tabDesdeUrl(null)).toBe("general");
    expect(tabDesdeUrl(undefined)).toBe("general");
    expect(tabDesdeUrl("")).toBe("general");
    expect(tabDesdeUrl("hackers")).toBe("general");
  });
  it("urlDeTab omite el parámetro para General y lo pone para el resto", () => {
    expect(urlDeTab("general")).toBe("/ajustes/notificaciones");
    expect(urlDeTab("canales")).toBe("/ajustes/notificaciones?tab=canales");
    expect(tabDesdeUrl(new URL("https://x" + urlDeTab("eventos")).searchParams.get("tab"))).toBe("eventos");
  });
});
