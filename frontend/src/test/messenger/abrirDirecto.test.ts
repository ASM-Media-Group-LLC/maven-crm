// ABRIR UN DIRECTO: reusar el canónico, crearlo, y la carrera.
//
// Desde la migración 20260929210000 la base no deja crear un segundo directo
// entre las mismas dos personas: el tercer paso de la creación da
// `directo_duplicado`. Pasa solo cuando los dos se abren el chat a la vez (o dos
// pestañas). El que pierde tiene que borrar lo suyo y abrir el del otro, sin
// mostrar un error.
import { describe, it, expect } from "vitest";
import {
  abrirDirecto,
  esDirectoDuplicado,
  pasosDeSupabase,
  type ClienteParaDirecto,
  type PasosDelDirecto,
  type Respuesta,
} from "@/hooks/abrirDirecto";

const YO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";
const NUEVO = "33333333-3333-4333-8333-333333333333";
const GANADOR = "44444444-4444-4444-8444-444444444444";

// Lo que responde la base cuando el trigger de chat_participants rechaza el duplicado.
const DUPLICADO = {
  code: "P0001",
  message: "directo_duplicado: ya hay un chat directo entre esas dos personas",
};

type Llamada = string;
function pasosFalsos(respuestas: {
  buscar: Respuesta<string>[];
  crear?: Respuesta;
  creador?: Respuesta;
  otro?: Respuesta;
}) {
  const llamadas: Llamada[] = [];
  const buscar = [...respuestas.buscar];
  const pasos: PasosDelDirecto = {
    buscar: async (otro) => {
      llamadas.push(`buscar ${otro}`);
      const r = buscar.shift();
      if (!r) throw new Error("buscar de más");
      return r;
    },
    crearConversacion: async (id) => {
      llamadas.push(`crear ${id}`);
      return respuestas.crear ?? { error: null };
    },
    sumar: async (conv, persona, rol) => {
      llamadas.push(`sumar ${conv} ${persona} ${rol}`);
      return (persona === YO ? respuestas.creador : respuestas.otro) ?? { error: null };
    },
    deshacer: async (conv) => {
      llamadas.push(`deshacer ${conv}`);
      return { error: null };
    },
  };
  return { pasos, llamadas };
}

describe("abrirDirecto", () => {
  it("si ya hay un directo, lo abre y no crea nada", async () => {
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: GANADOR, error: null }] });
    expect(await abrirDirecto(pasos, YO, OTRO, NUEVO)).toEqual({ tipo: "existente", id: GANADOR });
    expect(llamadas).toEqual([`buscar ${OTRO}`]);
  });

  it("si no hay, lo crea en tres pasos y en orden: conversación, yo admin, el otro member", async () => {
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: null, error: null }] });
    expect(await abrirDirecto(pasos, YO, OTRO, NUEVO)).toEqual({ tipo: "creado", id: NUEVO });
    expect(llamadas).toEqual([
      `buscar ${OTRO}`,
      `crear ${NUEVO}`,
      `sumar ${NUEVO} ${YO} admin`,
      `sumar ${NUEVO} ${OTRO} member`,
    ]);
  });

  it("si la búsqueda falla, NO crea nada (sería un duplicado)", async () => {
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: undefined, error: { message: "Failed to fetch" } }] });
    expect(await abrirDirecto(pasos, YO, OTRO, NUEVO)).toEqual({ tipo: "sin_saber", motivo: "Failed to fetch" });
    expect(llamadas).toEqual([`buscar ${OTRO}`]);
  });

  it("una respuesta rara de la búsqueda tampoco se lee como «no existe»", async () => {
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: 42 as unknown as string, error: null }] });
    expect((await abrirDirecto(pasos, YO, OTRO, NUEVO)).tipo).toBe("sin_saber");
    expect(llamadas).toEqual([`buscar ${OTRO}`]);
  });

  it("en la carrera (directo_duplicado) borra lo suyo y abre el del otro, sin error", async () => {
    const { pasos, llamadas } = pasosFalsos({
      buscar: [{ data: null, error: null }, { data: GANADOR, error: null }],
      otro: { error: DUPLICADO },
    });
    expect(await abrirDirecto(pasos, YO, OTRO, NUEVO)).toEqual({ tipo: "existente", id: GANADOR });
    expect(llamadas).toEqual([
      `buscar ${OTRO}`,
      `crear ${NUEVO}`,
      `sumar ${NUEVO} ${YO} admin`,
      `sumar ${NUEVO} ${OTRO} member`,
      `deshacer ${NUEVO}`,
      `buscar ${OTRO}`,
    ]);
  });

  it("si en la carrera no encuentra al ganador, no inventa: sin_saber", async () => {
    const { pasos } = pasosFalsos({
      buscar: [{ data: null, error: null }, { data: undefined, error: { message: "Failed to fetch" } }],
      otro: { error: DUPLICADO },
    });
    expect((await abrirDirecto(pasos, YO, OTRO, NUEVO)).tipo).toBe("sin_saber");
  });

  it("otro error en el tercer paso: borra lo suyo y es un error, sin volver a buscar", async () => {
    const { pasos, llamadas } = pasosFalsos({
      buscar: [{ data: null, error: null }],
      otro: { error: { code: "P0001", message: "chat_otra_agencia: esa persona no es de la agencia de la conversación" } },
    });
    expect((await abrirDirecto(pasos, YO, OTRO, NUEVO)).tipo).toBe("error");
    expect(llamadas[llamadas.length - 1]).toBe(`deshacer ${NUEVO}`);
    expect(llamadas.filter((l) => l.startsWith("buscar"))).toHaveLength(1);
  });

  it("si falla el paso del creador, deshace y no suma al otro", async () => {
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: null, error: null }], creador: { error: { message: "x" } } });
    expect((await abrirDirecto(pasos, YO, OTRO, NUEVO)).tipo).toBe("error");
    expect(llamadas).toEqual([`buscar ${OTRO}`, `crear ${NUEVO}`, `sumar ${NUEVO} ${YO} admin`, `deshacer ${NUEVO}`]);
  });

  it("si falla la conversación, no sigue", async () => {
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: null, error: null }], crear: { error: { message: "x" } } });
    expect((await abrirDirecto(pasos, YO, OTRO, NUEVO)).tipo).toBe("error");
    expect(llamadas).toEqual([`buscar ${OTRO}`, `crear ${NUEVO}`]);
  });

  it("con el tope de directos del día, el motivo trae el código que useChat reconoce", async () => {
    const tope = { code: "P0001", message: "chat_tope_directos: ya abriste 100 chats directos en las últimas 24 horas" };
    const { pasos, llamadas } = pasosFalsos({ buscar: [{ data: null, error: null }], crear: { error: tope } });
    const r = await abrirDirecto(pasos, YO, OTRO, NUEVO);
    expect(r.tipo).toBe("error");
    expect(r.tipo === "error" && r.motivo.includes("chat_tope_directos")).toBe(true);
    expect(llamadas).toEqual([`buscar ${OTRO}`, `crear ${NUEVO}`]);
  });

  it("esDirectoDuplicado mira el código de la base en el mensaje", () => {
    expect(esDirectoDuplicado(DUPLICADO)).toBe(true);
    expect(esDirectoDuplicado({ message: "directo_lleno: un chat directo es de dos personas" })).toBe(false);
    expect(esDirectoDuplicado(null)).toBe(false);
  });
});

describe("pasosDeSupabase: lo que le pide a la base", () => {
  function clienteFalso(rpcData: unknown) {
    const pedidos: unknown[] = [];
    const db: ClienteParaDirecto = {
      rpc: async (fn, args) => {
        pedidos.push(["rpc", fn, args]);
        return { data: rpcData, error: null };
      },
      from: (tabla) => ({
        insert: async (fila) => {
          pedidos.push(["insert", tabla, fila]);
          return { error: null };
        },
        delete: () => ({
          eq: async (col, val) => {
            pedidos.push(["delete", tabla, col, val]);
            return { error: null };
          },
        }),
      }),
    };
    return { db, pedidos };
  }

  it("busca con chat_directo_con(_otro) y crea sin mandar tenant_id", async () => {
    const { db, pedidos } = clienteFalso(null);
    expect(await abrirDirecto(pasosDeSupabase(db, YO), YO, OTRO, NUEVO)).toEqual({ tipo: "creado", id: NUEVO });
    expect(pedidos).toEqual([
      ["rpc", "chat_directo_con", { _otro: OTRO }],
      ["insert", "chat_conversations", { id: NUEVO, type: "direct", created_by: YO }],
      ["insert", "chat_participants", { conversation_id: NUEVO, user_id: YO, role: "admin" }],
      ["insert", "chat_participants", { conversation_id: NUEVO, user_id: OTRO, role: "member" }],
    ]);
  });

  it("deshace borrando la CONVERSACIÓN (no la participación: la dejaría huérfana)", async () => {
    const { db, pedidos } = clienteFalso(null);
    await pasosDeSupabase(db, YO).deshacer(NUEVO);
    expect(pedidos).toEqual([["delete", "chat_conversations", "id", NUEVO]]);
  });

  it("el null de la RPC es «no hay»; el error es «no sé»", async () => {
    expect(await pasosDeSupabase(clienteFalso(null).db, YO).buscar(OTRO)).toEqual({ data: null, error: null });
    const conError: ClienteParaDirecto = {
      ...clienteFalso(null).db,
      rpc: async () => ({ data: null, error: { message: "Failed to fetch" } }),
    };
    expect((await pasosDeSupabase(conError, YO).buscar(OTRO)).data).toBeUndefined();
  });
});

// Los nombres que la app compara tienen que ser los que la base de verdad usa
// (lección de `refs` vs `references`: un nombre distinto es una función muerta
// en silencio, con los tests en verde). Se leen con el glob de Vite y no con
// node:fs: el tsconfig del front compila los tests y no trae los tipos de Node.
// Un glob que no encuentra nada no falla solo: por eso el primer test mira que
// los dos fuentes hayan cargado.
const MIGRACION = "/supabase/migrations/20260929210000_chat_agencia_y_huecos.sql";
const USE_CHAT = "/frontend/src/hooks/useChat.ts";
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(
  ["/supabase/migrations/20260929210000_chat_agencia_y_huecos.sql", "/frontend/src/hooks/useChat.ts"],
  { query: "?raw", import: "default", eager: true },
);
const leer = (ruta: string): string => fuentes[ruta] ?? "";

describe("el contrato con la migración", () => {
  it("los fuentes se cargaron", () => {
    expect(leer(MIGRACION).length).toBeGreaterThan(1000);
    expect(leer(USE_CHAT).length).toBeGreaterThan(1000);
  });

  it("la base define chat_directo_con(_otro uuid) y los errores que la app reconoce", () => {
    const sql = leer(MIGRACION);
    expect(sql).toMatch(/create or replace function public\.chat_directo_con\(_otro uuid\)/);
    expect(sql).toMatch(/raise exception 'directo_duplicado:/);
    expect(sql).toMatch(/raise exception 'chat_tope_grupos:/);
    expect(sql).toMatch(/raise exception 'chat_tope_directos:/);
  });

  it("useChat abre los directos con abrirDirecto y ya no busca con limit(1) sin orden", () => {
    const src = leer(USE_CHAT);
    expect(src).toContain("abrirDirecto(");
    expect(src).not.toContain('chat_conversations!inner(type)');
    expect(src).toContain('"chat_tope_grupos"');
    expect(src).toContain('"chat_tope_directos"');
  });
});
