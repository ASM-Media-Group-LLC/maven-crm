import { describe, it, expect, vi, beforeEach } from "vitest";

const avisarPersona = vi.fn();
vi.mock("@/lib/avisoPersona", () => ({ avisarPersona: (...a: unknown[]) => avisarPersona(...a) }));

const maybeSingle = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));

import type { Room } from "livekit-client";
import { avisarSalidaDeLlamada, debeAvisarSalida, uuidDeIdentity, mostrarAvisoDeSala, ID_AVISO_ME_SILENCIARON } from "@/lib/avisosDeLlamada";

const UUID_ANA = "11111111-1111-4111-8111-111111111111";
const UUID_LUIS = "22222222-2222-4222-8222-222222222222";

function sala(identities: string[], state = "connected") {
  return {
    state,
    remoteParticipants: new Map(identities.map((id) => [id, { identity: id }])),
  } as unknown as Room;
}

beforeEach(() => {
  avisarPersona.mockClear();
  maybeSingle.mockReset();
});

describe("uuidDeIdentity", () => {
  it("saca el uuid con y sin sufijo, y nada para invitados", () => {
    expect(uuidDeIdentity(UUID_ANA)).toBe(UUID_ANA);
    expect(uuidDeIdentity(`${UUID_ANA}_ab12cd34`)).toBe(UUID_ANA);
    expect(uuidDeIdentity("guest_" + UUID_ANA)).toBeNull();
    expect(uuidDeIdentity("cualquier-cosa")).toBeNull();
  });
});

describe("debeAvisarSalida", () => {
  it("no avisa si la sala ya no está conectada (fui yo el que se salió)", () => {
    expect(debeAvisarSalida({ identity: `${UUID_ANA}_1` }, sala([], "disconnected"))).toBe(false);
  });
  it("no avisa por el supervisor de Cowork mirando ni por la vista previa", () => {
    expect(debeAvisarSalida({ identity: `${UUID_ANA}__monitor` }, sala([]))).toBe(false);
    expect(debeAvisarSalida({ identity: `${UUID_ANA}__preview` }, sala([]))).toBe(false);
  });
  it("no avisa si la misma persona sigue adentro desde otra pestaña", () => {
    expect(debeAvisarSalida({ identity: `${UUID_ANA}_1` }, sala([`${UUID_ANA}_2`, `${UUID_LUIS}_9`]))).toBe(false);
  });
  it("avisa cuando la persona realmente ya no está", () => {
    expect(debeAvisarSalida({ identity: `${UUID_ANA}_1` }, sala([`${UUID_LUIS}_9`]))).toBe(true);
  });
});

describe("avisarSalidaDeLlamada", () => {
  it("dispara el aviso con nombre, foto y muñequito del perfil", async () => {
    maybeSingle.mockResolvedValue({ data: { full_name: "Ana Gómez", avatar_url: null, avatar_seed: "gatito" } });
    const ok = await avisarSalidaDeLlamada({ identity: `${UUID_ANA}_1`, name: "Ana" }, sala([]));
    expect(ok).toBe(true);
    expect(avisarPersona).toHaveBeenCalledTimes(1);
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({
      nombre: "Ana Gómez",
      seed: "gatito",
      titulo: "Ana Gómez salió de la reunión",
      id: `salio-${UUID_ANA}`,
    });
  });

  it("recuerda el perfil: la segunda salida de la misma persona no vuelve a la base", async () => {
    await avisarSalidaDeLlamada({ identity: `${UUID_ANA}_2`, name: "Ana" }, sala([]));
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({ nombre: "Ana Gómez" });
  });

  it("un invitado sin cuenta sale con el nombre que dio en LiveKit", async () => {
    const ok = await avisarSalidaDeLlamada({ identity: "guest_" + UUID_LUIS, name: "Carlos (externo)" }, sala([]));
    expect(ok).toBe(true);
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({
      nombre: "Carlos (externo)",
      titulo: "Carlos (externo) salió de la reunión",
      seed: null,
    });
  });

  it("si la base falla, igual avisa con el nombre de LiveKit", async () => {
    maybeSingle.mockRejectedValue(new Error("sin red"));
    const ok = await avisarSalidaDeLlamada({ identity: `${UUID_LUIS}_1`, name: "Luis" }, sala([]));
    expect(ok).toBe(true);
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({ nombre: "Luis", titulo: "Luis salió de la reunión" });
  });

  it("no avisa cuando no corresponde", async () => {
    const ok = await avisarSalidaDeLlamada({ identity: `${UUID_ANA}_1`, name: "Ana" }, sala([`${UUID_ANA}_2`]));
    expect(ok).toBe(false);
    expect(avisarPersona).not.toHaveBeenCalled();
  });
});

describe("mostrarAvisoDeSala (avisos del servidor)", () => {
  const YO = `${UUID_LUIS}_yo`;
  const jhon = { uuid: "33333333-3333-4333-8333-333333333333", nombre: "Jhon López" };

  it("ignora basura que no tiene forma de aviso", async () => {
    expect(await mostrarAvisoDeSala({ hola: 1 }, YO)).toBe(false);
    expect(await mostrarAvisoDeSala(null, YO)).toBe(false);
    expect(avisarPersona).not.toHaveBeenCalled();
  });

  it("si me silenciaron a mí: 'X silenció tu micrófono', reemplazando al genérico", async () => {
    maybeSingle.mockResolvedValue({ data: { full_name: "Jhon López", avatar_url: null, avatar_seed: "jhon" } });
    const ok = await mostrarAvisoDeSala(
      { clase: "silenciado", objetivo: { identity: YO, uuid: UUID_LUIS, nombre: "Luis" }, por: jhon }, YO,
    );
    expect(ok).toBe(true);
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({
      nombre: "Jhon López", seed: "jhon", titulo: "Jhon López silenció tu micrófono", id: ID_AVISO_ME_SILENCIARON, tono: "ojo",
    });
  });

  it("si silenciaron a otra: 'X silenció a Y' con la cara de Y", async () => {
    const ok = await mostrarAvisoDeSala(
      { clase: "silenciado", objetivo: { identity: `${UUID_ANA}_1`, uuid: UUID_ANA, nombre: "Ana" }, por: jhon }, YO,
    );
    expect(ok).toBe(true);
    // Ana ya está en cache de una prueba anterior (Ana Gómez, seed gatito).
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({
      nombre: "Ana Gómez", seed: "gatito", titulo: "Jhon López silenció a Ana Gómez", id: `silenciado-${UUID_ANA}`,
    });
  });

  it("lo que hice yo no me lo anuncia (mi botón ya me lo confirmó)", async () => {
    const yoMismo = { uuid: UUID_LUIS, nombre: "Luis" };
    expect(await mostrarAvisoDeSala({ clase: "silenciado", objetivo: { identity: `${UUID_ANA}_1`, uuid: UUID_ANA, nombre: "Ana" }, por: yoMismo }, YO)).toBe(false);
    expect(await mostrarAvisoDeSala({ clase: "grabando", por: yoMismo }, YO)).toBe(false);
    expect(await mostrarAvisoDeSala({ clase: "silenciados-todos", por: yoMismo }, YO)).toBe(false);
    expect(avisarPersona).not.toHaveBeenCalled();
  });

  it("grabación: empezó y detuvo, con la cara de quien lo hizo y el mismo id", async () => {
    await mostrarAvisoDeSala({ clase: "grabando", por: jhon }, YO);
    await mostrarAvisoDeSala({ clase: "grabacion-detenida", por: jhon }, YO);
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({ titulo: "Jhon López empezó a grabar la reunión", tono: "ojo", id: "grabacion" });
    expect(avisarPersona.mock.calls[1][0]).toMatchObject({ titulo: "Jhon López detuvo la grabación", id: "grabacion" });
  });

  it("silenció a todos", async () => {
    await mostrarAvisoDeSala({ clase: "silenciados-todos", por: jhon }, YO);
    expect(avisarPersona.mock.calls[0][0]).toMatchObject({ titulo: "Jhon López silenció a todos", id: ID_AVISO_ME_SILENCIARON });
  });
});
