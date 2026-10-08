import { describe, expect, it } from "vitest";
import pestana from "@/pages/creadores/PortalTabContent.tsx?raw";
import tarjeta from "@/pages/creadores/AccesosOFCard.tsx?raw";

// «ACCESOS DE ONLYFANS» ES SOLO PARA ADMINS, ENTERA (Jhon, 08/10): ni el usuario
// ni el correo de OF para el resto del equipo, no solo la contraseña. La edge
// creadora-accesos contesta solo_admin a cualquier otro.
//
// Y el «¿es admin?» de la tarjeta NO sale de la edge: hasta el 08/10 venía como
// es_admin de un rpc("has_role") que PostgREST no sabía resolver (hay dos
// has_role) y daba false para todos, así que ningún admin veía «Importar»,
// «Editar» ni la contraseña.

describe("Accesos de OnlyFans: solo admins", () => {
  it("la pestaña Portal monta la tarjeta solo para admins", () => {
    expect(pestana).toMatch(/const \{ isAdmin \} = useUserRole\(\);/);
    expect(pestana).toMatch(/\{isAdmin && <AccesosOFCard /);
    expect(pestana.match(/<AccesosOFCard /g)).toHaveLength(1);
  });

  it("ya no tiene «Importar desde una hoja» (Jhon, 08/10, después de la carga inicial)", () => {
    expect(tarjeta).not.toMatch(/ImportarAccesosDialog|portal\.accesos\.importar|FileSpreadsheet/);
  });

  it("la tarjeta no depende de un es_admin que mande la edge", () => {
    expect(tarjeta).not.toMatch(/es_admin/);
    expect(tarjeta).not.toMatch(/claveSoloAdmin/);
  });
});
