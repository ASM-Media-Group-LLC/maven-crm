// POR QUÉ A GRACE LE SALÍAN TODOS LOS CHATS COMO "Usuario" (09/09).
//
// El mapa de perfiles llegaba vacío a la construcción de la lista, y
// profileName(undefined) devuelve "Usuario" como último recurso: 13 mensajes
// directos, todos llamados igual, con avatar "U".
//
// Dos caminos llevaban al mapa vacío y estos casos cubren los dos: el microtask
// que corría antes del render (el ref todavía en {}), y la petición que fallaba
// una vez y dejaba el mapa vacío para toda la sesión porque nadie la reintentaba.

import { describe, it, expect, vi } from "vitest";
import { perfilesGarantizados, type MapaDePerfiles } from "@/hooks/perfilesGarantizados";

const mapaCon = (...ids: string[]): MapaDePerfiles =>
  Object.fromEntries(ids.map((id) => [id, { id, full_name: `Persona ${id}` } as never]));

describe("perfilesGarantizados", () => {
  it("el mapa recién cargado gana sobre el ref (el ref va un render atrás)", async () => {
    const recargar = vi.fn();
    const r = await perfilesGarantizados(mapaCon("nuevo"), mapaCon("viejo"), recargar);
    expect(Object.keys(r)).toEqual(["nuevo"]);
    expect(recargar).not.toHaveBeenCalled();
  });

  it("sin mapa nuevo, usa el del ref y no pide nada", async () => {
    const recargar = vi.fn();
    const r = await perfilesGarantizados(undefined, mapaCon("a", "b"), recargar);
    expect(Object.keys(r)).toEqual(["a", "b"]);
    expect(recargar).not.toHaveBeenCalled();
  });

  it("si los dos están vacíos, RECARGA — este es el bug de Grace", async () => {
    const recargar = vi.fn().mockResolvedValue(mapaCon("rescatado"));
    const r = await perfilesGarantizados(undefined, {}, recargar);
    expect(recargar).toHaveBeenCalledOnce();
    expect(Object.keys(r)).toEqual(["rescatado"]);
  });

  it("un mapa nuevo VACÍO no tapa el reintento", async () => {
    // `{}` es un objeto, así que un `??` a secas lo daba por bueno.
    const recargar = vi.fn().mockResolvedValue(mapaCon("rescatado"));
    const r = await perfilesGarantizados({}, {}, recargar);
    expect(recargar).toHaveBeenCalledOnce();
    expect(Object.keys(r)).toEqual(["rescatado"]);
  });

  it("si el reintento también falla, devuelve vacío sin explotar", async () => {
    // Peor caso: la lista sale con nombres genéricos, pero la app no se cae y
    // el siguiente ciclo de recarga vuelve a intentarlo.
    const recargar = vi.fn().mockResolvedValue(null);
    const r = await perfilesGarantizados(undefined, {}, recargar);
    expect(r).toEqual({});
    expect(recargar).toHaveBeenCalledOnce();
  });
});
