import { describe, expect, it } from "vitest";
import { RUTA_DESCARGAR_CON_GUIA } from "@/lib/guiaApp";

// Guarda (18/11/2026): a Daniel le salió el aviso azul de Windows al instalar y
// nadie le dijo qué hacer. Los botones de descarga de adentro de Maven pasan por
// la guía, que baja el archivo sola y muestra los pasos.
const abrir = Object.values(import.meta.glob("../../components/AbrirEnApp.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const soloApp = Object.values(import.meta.glob("../../components/CoworkSoloApp.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const guia = Object.values(import.meta.glob("../../pages/guiaApp/GuiaAppPage.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("descargar con la guía", () => {
  it("la ruta abre la guía y pide bajar", () => {
    expect(RUTA_DESCARGAR_CON_GUIA).toBe("/app?descargar=1");
  });
  it("los avisos de adentro de Maven no dan el archivo pelado", () => {
    expect(abrir).toContain("RUTA_DESCARGAR_CON_GUIA");
    expect(soloApp).toContain("RUTA_DESCARGAR_CON_GUIA");
    expect(abrir).not.toContain("Maven-Windows.exe");
  });
  it("la guía baja sola con ?descargar=1", () => {
    expect(guia).toContain('params.get("descargar") !== "1"');
  });
});
