// Correr: deno test --no-check supabase/functions/oficina-doc/jwt.test.ts
import { firmar, verificar } from "./jwt.ts";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

Deno.test("firma HS256 estándar: el vector público de jwt.io", async () => {
  const jwt = await firmar({ sub: "1234567890", name: "John Doe", iat: 1516239022 }, "your-256-bit-secret");
  assert(
    jwt === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    jwt,
  );
});

Deno.test("lo firmado se verifica; con otro secreto o tocado, no", async () => {
  const jwt = await firmar({ document: { title: "Año fiscal — ñandú.docx" } }, "s".repeat(32));
  assert(await verificar(jwt, "s".repeat(32)), "verifica");
  assert(!(await verificar(jwt, "t".repeat(32))), "otro secreto");
  const [a, , c] = jwt.split(".");
  assert(!(await verificar(`${a}.${btoa("{}")}.${c}`, "s".repeat(32))), "cuerpo tocado");
  assert(!(await verificar("no.es", "s".repeat(32))), "mal formado");
});
