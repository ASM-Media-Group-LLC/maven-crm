// PENDIENTES Y SUGERENCIAS (Alvaro, 27/11/2026): cuadrito abajo a la derecha,
// no bloquea, y cada cosa la ve quien la puede arreglar según su Posición.
import { describe, it, expect, beforeEach } from "vitest";
import { itemsVisibles, leerOcultos, ocultarHoy, ocultarSugerencia, type ItemPendiente } from "@/lib/pendientesDeGestion";

const fuentes = import.meta.glob(["../../../../supabase/migrations/20261127200000_pendientes_de_gestion.sql", "../../components/dashboard/AppShell.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const leer = (fin: string) => fuentes[Object.keys(fuentes).find((k) => k.endsWith(fin))!];

const items: ItemPendiente[] = [
  { clave: "comida_sin_hora", tipo: "sugerencia", n: 2, ruta: "/ajustes/empresa" },
  { clave: "horarios", tipo: "pendiente", n: 2, ruta: "/hr/horarios-equipo" },
];

describe("qué se muestra", () => {
  beforeEach(() => window.localStorage.clear());
  it("primero lo pendiente y después las sugerencias", () => {
    expect(itemsVisibles(items, leerOcultos(new Date("2026-11-27T15:00:00Z"))).map((i) => i.clave)).toEqual(["horarios", "comida_sin_hora"]);
  });
  it("la X lo cierra hasta mañana", () => {
    ocultarHoy(new Date("2026-11-27T15:00:00Z"));
    expect(itemsVisibles(items, leerOcultos(new Date("2026-11-27T20:00:00Z")))).toEqual([]);
    expect(itemsVisibles(items, leerOcultos(new Date("2026-11-28T15:00:00Z")))).toHaveLength(2);
  });
  it("«Ahora no» esconde la sugerencia una semana; lo pendiente sigue", () => {
    ocultarSugerencia("comida_sin_hora", new Date("2026-11-27T15:00:00Z"));
    expect(itemsVisibles(items, leerOcultos(new Date("2026-11-30T15:00:00Z"))).map((i) => i.clave)).toEqual(["horarios"]);
    expect(itemsVisibles(items, leerOcultos(new Date("2026-12-05T15:00:00Z")))).toHaveLength(2);
  });
});

describe("todo sale de los roles", () => {
  it("cada cosa la ve quien la puede arreglar", () => {
    const sql = leer("20261127200000_pendientes_de_gestion.sql");
    expect(sql).toContain("public.puede_editar_horario(p.id)");
    expect(sql).toContain("public.puedo_configurar_empresa()");
    expect(leer("AppShell.tsx")).toContain("<PendientesDeGestion />");
  });
});
