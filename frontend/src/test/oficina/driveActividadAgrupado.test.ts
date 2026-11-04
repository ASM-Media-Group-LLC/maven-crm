import { describe, it, expect } from "vitest";
import { agrupar } from "@/pages/oficina/drive/PanelDeActividad";
import type { EventoActividad, AccionDrive } from "@/hooks/useActividadDrive";

// GUARDA de la Actividad del Drive (Alvaro, 04/11): una subida de 23 archivos
// tiene que verse como UNA línea ("Fulano subió 23 elementos"), no 23. El
// agrupado junta eventos SEGUIDOS del mismo actor + misma acción dentro de la
// misma ventana de 2 min; un actor/acción/ventana distinta abre otro grupo.

const BASE = Date.parse("2026-11-04T13:41:00-05:00");
function ev(actorId: string, accion: AccionDrive, nombre: string, segundos: number): EventoActividad {
  return {
    id: `${actorId}-${accion}-${segundos}`,
    itemId: null,
    actorId,
    actorNombre: actorId,
    actorAvatarUrl: null,
    actorAvatarSeed: null,
    accion,
    nombre,
    createdAt: new Date(BASE - segundos * 1000).toISOString(),
  };
}

describe("agrupar actividad del Drive", () => {
  it("junta 23 subidas del mismo actor en la misma ventana en UN solo grupo", () => {
    const eventos = Array.from({ length: 23 }, (_, i) => ev("ana", "subio", `foto_${i}.jpg`, i));
    const grupos = agrupar(eventos);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].accion).toBe("subio");
    expect(grupos[0].items).toHaveLength(23);
    expect(grupos[0].actorNombre).toBe("ana");
  });

  it("separa por actor distinto", () => {
    const grupos = agrupar([ev("ana", "subio", "a.jpg", 0), ev("beto", "subio", "b.jpg", 1)]);
    expect(grupos).toHaveLength(2);
  });

  it("separa por acción distinta", () => {
    const grupos = agrupar([ev("ana", "subio", "a.jpg", 0), ev("ana", "movio", "a.jpg", 1)]);
    expect(grupos).toHaveLength(2);
  });

  it("separa cuando pasan más de 2 minutos (otra ventana)", () => {
    // 0 s y 200 s caen en buckets de 120 s distintos.
    const grupos = agrupar([ev("ana", "subio", "a.jpg", 0), ev("ana", "subio", "b.jpg", 200)]);
    expect(grupos).toHaveLength(2);
  });

  it("no agrega nombres vacíos a la lista del grupo", () => {
    const sinNombre = ev("ana", "borro", "", 0);
    sinNombre.nombre = null;
    const grupos = agrupar([sinNombre]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].items).toHaveLength(0);
  });
});
