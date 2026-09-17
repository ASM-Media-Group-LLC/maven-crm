import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// LA RLS DE INVITADOS ES EL LUGAR DONDE ESTO SE ROMPE EN SILENCIO.
//
// La política de `calendar_events` pregunta "¿estoy invitado?" y la de
// `calendar_event_guests` pregunta "¿soy el dueño?". Escritas como subconsultas
// sueltas se llaman entre sí y Postgres corta con "infinite recursion detected
// in policy" — el mismo error que ya pasó con los documentos. SECURITY DEFINER
// salta la RLS adentro y corta el ciclo.
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260917090000_calendario_invitados.sql"),
  "utf8",
);

describe("RLS de invitados al calendario", () => {
  it("⚠️ las dos funciones que cruzan tablas son SECURITY DEFINER", () => {
    for (const fn of ["soy_invitado_al_evento", "soy_dueno_del_evento"]) {
      const i = sql.indexOf(`FUNCTION public.${fn}`);
      expect(i, fn).toBeGreaterThan(-1);
      // Se mira solo el cuerpo de ESA función, no el archivo entero.
      const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
      expect(cuerpo, fn).toContain("SECURITY DEFINER");
      // Sin search_path fijo, una función SECURITY DEFINER es un agujero.
      expect(cuerpo, fn).toContain("SET search_path");
    }
  });

  it("un invitado puede ver el evento aunque sea privado", () => {
    const i = sql.indexOf("FOR SELECT TO authenticated");
    const politica = sql.slice(i, i + 400);
    expect(politica).toContain("soy_invitado_al_evento(id)");
  });

  it("⚠️ responder es solo lo propio: el organizador NO contesta por otro", () => {
    // Una reunión donde el organizador puede marcar "va" en nombre de la gente
    // deja de servir para saber quién va.
    const i = sql.indexOf('"Responder a mi invitación"');
    expect(i).toBeGreaterThan(-1);
    const politica = sql.slice(i, i + 220);
    expect(politica).toContain("USING (user_id = auth.uid())");
    expect(politica).toContain("WITH CHECK (user_id = auth.uid())");
    expect(politica).not.toContain("soy_dueno");
  });

  it("invitar y desinvitar es solo del dueño", () => {
    for (const nombre of ['"Invitar a mi evento"', '"Desinvitar de mi evento"']) {
      const i = sql.indexOf(nombre);
      expect(i, nombre).toBeGreaterThan(-1);
      expect(sql.slice(i, i + 200), nombre).toContain("soy_dueno_del_evento(event_id)");
    }
  });

  it("un trigger congela las llaves para que nadie mueva su fila a otro evento", () => {
    const i = sql.indexOf("FUNCTION public.tocar_invitado");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
    expect(cuerpo).toContain("NEW.event_id = OLD.event_id");
    expect(cuerpo).toContain("NEW.user_id = OLD.user_id");
  });
});
