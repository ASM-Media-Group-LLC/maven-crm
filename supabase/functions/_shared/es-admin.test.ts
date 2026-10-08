// esAdmin (es-admin.ts) y la guarda contra rpc("has_role") en las edges.
// Correr: deno test --no-check --allow-read supabase/functions/_shared/es-admin.test.ts

import { type ClienteParaRoles, esAdmin } from "./es-admin.ts";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

type R<T> = { data: T | null; error: { message: string } | null };

function falso(grupo: R<boolean>, roles: R<{ role: string }[]>): ClienteParaRoles {
  return {
    rpc: () => Promise.resolve(grupo),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve(roles) }) }) }) }),
  };
}

Deno.test("su grupo es de admin: sí", async () => {
  assert(await esAdmin(falso({ data: true, error: null }, { data: [], error: null }), "u") === true, "grupo admin");
});

Deno.test("el rol se llama admin aunque no tenga fila en role_groups: sí", async () => {
  assert(await esAdmin(falso({ data: false, error: null }, { data: [{ role: "admin" }], error: null }), "u") === true, "rol admin");
});

Deno.test("ni grupo ni rol: no", async () => {
  assert(await esAdmin(falso({ data: false, error: null }, { data: [], error: null }), "u") === false, "no admin");
});

Deno.test("si la base falla, lanza (un fallo no es «no es admin»)", async () => {
  let lanzo = false;
  try {
    await esAdmin(falso({ data: null, error: { message: "PGRST203" } }, { data: [], error: null }), "u");
  } catch {
    lanzo = true;
  }
  assert(lanzo, "no lanzó con la base caída");
});

// Hay DOS has_role en la base (text y app_role): por PostgREST contesta 300 y
// data queda null, o sea «no es admin» para todos (creadora-accesos, 08/10/2026).
Deno.test("ninguna edge llama a has_role por rpc", async () => {
  const raiz = new URL("../", import.meta.url);
  const culpables: string[] = [];
  async function recorrer(dir: URL) {
    for await (const e of Deno.readDir(dir)) {
      const u = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
      if (e.isDirectory) await recorrer(u);
      else if (/\.ts$/.test(e.name) && !e.name.endsWith(".test.ts")) {
        const fuente = await Deno.readTextFile(u);
        if (/\.rpc\(\s*["'`]has_role["'`]/.test(fuente)) culpables.push(u.pathname.split("/functions/")[1]);
      }
    }
  }
  await recorrer(raiz);
  assert(culpables.length === 0, `usan rpc("has_role") (usar esAdmin de _shared/es-admin.ts): ${culpables.join(", ")}`);
});
