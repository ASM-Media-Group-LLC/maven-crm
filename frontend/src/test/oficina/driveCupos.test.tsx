import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Jhon, 28/09: cupo por persona (50 GB general), chequeo de lugar antes de
// subir, y la barrita «usás X de Y».

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
let uso = { usado: 0, cupo: 50 * 1024 ** 3 };
vi.mock("@/hooks/useDrive", async (original) => ({
  ...(await original<typeof import("@/hooks/useDrive")>()),
  useUsoDrive: () => ({ data: uso }),
}));

import { BarraDeUso, CUPO_POR_DEFECTO } from "@/components/oficina/DriveCupos";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/supabase/migrations/20260929090000_drive_cupos.sql", "/supabase/functions/drive/index.ts"], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";

describe("la barrita de uso", () => {
  it("dice cuánto se usa de cuánto", () => {
    uso = { usado: 3.2 * 1024 ** 3, cupo: 50 * 1024 ** 3 };
    render(<BarraDeUso />);
    expect(screen.getByText("Usás 3.2 GB de 50 GB")).toBeInTheDocument();
    expect(screen.queryByText(/Te queda poco espacio/)).not.toBeInTheDocument();
  });
  it("al 90% avisa y se pone ámbar", () => {
    uso = { usado: 46 * 1024 ** 3, cupo: 50 * 1024 ** 3 };
    render(<BarraDeUso />);
    expect(screen.getByText(/Te queda poco espacio/)).toBeInTheDocument();
  });
});

describe("⚠️ las reglas", () => {
  it("el general de la pantalla es el mismo de la base (50 GB)", () => {
    expect(CUPO_POR_DEFECTO).toBe(50 * 1024 ** 3);
    expect(leer("drive_cupos.sql")).toMatch(/SELECT 50::bigint \* 1024 \* 1024 \* 1024/);
  });
  it("el cupo lo edita solo un admin DE LA MISMA agencia", () => {
    const mig = leer("drive_cupos.sql");
    expect(mig).toMatch(/drive_soy_admin\(\)\) AND tenant_id = \(SELECT public\.current_tenant_id\(\)\)/);
    expect(mig).toMatch(/AND public\.drive_es_de_mi_agencia\(user_id\)/);
  });
  it("la subida chequea cupo y lugar en el NAS ANTES de crear la ficha", () => {
    const edge = leer("drive/index.ts");
    const i = edge.indexOf('if (accion === "subir_iniciar")');
    const cupo = edge.indexOf("chequearCupo(", i);
    const lugar = edge.indexOf("hayLugarEnElNas(", i);
    const ficha = edge.indexOf('admin.from("drive_items").insert(', i);
    expect(cupo).toBeGreaterThan(i);
    expect(lugar).toBeGreaterThan(cupo);
    expect(ficha).toBeGreaterThan(lugar);
  });
});
