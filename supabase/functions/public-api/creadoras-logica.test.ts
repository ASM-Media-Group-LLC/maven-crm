import { assertEquals } from "jsr:@std/assert@1";
import { leerCreadoraNueva, leerCuentasOF, rutaDeCreadoras } from "./creadoras-logica.ts";

// Backstage, 18/11/2026: crear creadoras y cargar el ID de OnlyFans por la API.

Deno.test("POST /creators: nombre e ID de OnlyFans obligatorios; el ID solo números", () => {
  assertEquals(leerCreadoraNueva({ onlyfans_id: "123" }).ok, false);
  assertEquals((leerCreadoraNueva({ name: "Ana" }) as { campo: string }).campo, "onlyfans_id");
  assertEquals((leerCreadoraNueva({ name: "Ana", onlyfans_id: "ana123" }) as { campo: string }).campo, "onlyfans_id");
  const ok = leerCreadoraNueva({ name: " Ana ", artistic_name: "Anita", email: "ANA@X.COM", onlyfans_id: 987654321, onlyfans_handle: "@anita" });
  assertEquals(ok.ok, true);
  if (ok.ok) {
    assertEquals(ok.name, "Ana");
    assertEquals(ok.email, "ana@x.com");
    assertEquals(ok.status, "active");
    assertEquals(ok.cuenta, { onlyfans_id: "987654321", handle: "anita", url: null });
  }
});

Deno.test("POST /creators: correo y estado se validan", () => {
  assertEquals((leerCreadoraNueva({ name: "A", onlyfans_id: "1", email: "no-correo" }) as { campo: string }).campo, "email");
  assertEquals((leerCreadoraNueva({ name: "A", onlyfans_id: "1", status: "terminated" }) as { campo: string }).campo, "status");
  const ob = leerCreadoraNueva({ name: "A", onlyfans_id: "1", status: "onboarding" });
  assertEquals(ob.ok && ob.status, "onboarding");
});

Deno.test("PATCH /creators/:id: lista de cuentas, sin IDs repetidos", () => {
  assertEquals(leerCuentasOF([]).ok, false);
  assertEquals(leerCuentasOF([{ onlyfans_id: "1" }, { onlyfans_id: "1" }]).ok, false);
  assertEquals((leerCuentasOF([{ onlyfans_id: "1", url: "onlyfans.com/x" }]) as { campo: string }).campo, "onlyfans_accounts[0].url");
  const ok = leerCuentasOF([{ onlyfans_id: "1", handle: "x", url: "https://onlyfans.com/x" }, { onlyfans_id: "2" }]);
  assertEquals(ok.ok && ok.cuentas.length, 2);
});

Deno.test("rutas: POST a /creators, PATCH a /creators/:uuid; lo demás 404/405", () => {
  assertEquals(rutaDeCreadoras("POST", []), { ok: true, accion: "crear" });
  assertEquals(rutaDeCreadoras("PATCH", []).ok, false);
  const id = "0f1e2d3c-4b5a-4968-8776-655443322110";
  assertEquals(rutaDeCreadoras("PATCH", [id]), { ok: true, accion: "cuentas", id });
  assertEquals(rutaDeCreadoras("DELETE", [id]).ok, false);
  assertEquals(rutaDeCreadoras("PATCH", ["no-uuid"]), { ok: false, estado: 404 });
});
