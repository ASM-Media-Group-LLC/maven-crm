// EL CHIP «INTERNET INESTABLE · N CAÍDAS» DEL HUB (Alvaro, 17/11/2026: «aviso
// automático a la persona y su supervisor»). El supervisor ve en la tarjeta de
// la sala a quien se le cayó la llamada 3 veces o más en la última hora.
// Lo de la persona (el cartel en su llamada) vive en
// test/videocall/caidasSeguidas.test.tsx.
//
// Lo que cuidan estas guardas: que un fallo no se pinte como «0 caídas», que el
// hub no le pegue a la base más de una vez cada 2 minutos ni con la pestaña
// oculta, y que la lectura siga las reglas de Argos (sin abrir llamada_cortes).
import { describe, it, expect } from "vitest";
import { getTranslation } from "@/lib/i18n";
import {
  CAIDAS_PARA_EL_CHIP, LEER_CAIDAS_CADA_MS, VENTANA_DEL_CHIP_MIN,
  caidasPorPersona, errorSinArreglo, hayChipDeCaidas, tocaLeerCaidas,
} from "@/lib/caidasSeguidas";

const fuentes = import.meta.glob([
  "/frontend/src/pages/cowork/CoworkHostDashboard.tsx",
  "/frontend/src/hooks/useCaidasDelEquipo.ts",
  "/supabase/migrations/20261118030000_cowork_caidas_recientes.sql",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const leer = (ruta: string) => {
  const s = fuentes[ruta];
  if (!s) throw new Error(`no se cargó ${ruta}`);
  return s;
};

describe("cuándo sale el chip", () => {
  it("los umbrales son los decididos: 3 caídas en la última hora, leído cada 2 minutos", () => {
    expect(CAIDAS_PARA_EL_CHIP).toBe(3);
    expect(VENTANA_DEL_CHIP_MIN).toBe(60);
    expect(LEER_CAIDAS_CADA_MS).toBe(2 * 60_000);
  });

  it("con 3 o más sí; con menos, o sin dato, no", () => {
    expect(hayChipDeCaidas(3)).toBe(true);
    expect(hayChipDeCaidas(36)).toBe(true);
    expect(hayChipDeCaidas(2)).toBe(false);
    expect(hayChipDeCaidas(0)).toBe(false);
    expect(hayChipDeCaidas(undefined)).toBe(false);
    expect(hayChipDeCaidas(null)).toBe(false);
  });

  it("dice cuántas, en los dos idiomas", () => {
    expect(getTranslation("cowork.host.chip.unstableInternet", "es")).toBe("Internet inestable · {n} caídas");
    expect(getTranslation("cowork.host.chip.unstableInternet", "en")).toBe("Unstable internet · {n} drops");
  });
});

describe("la lectura: un fallo no es «nadie se cayó»", () => {
  it("las filas de la RPC se vuelven un mapa uid → caídas", () => {
    expect(caidasPorPersona([{ user_id: "ana", caidas: 4 }, { user_id: "beto", caidas: "2" }])).toEqual({ ana: 4, beto: 2 });
  });

  it("una lista vacía es «nadie se cayó» (mapa vacío)…", () => {
    expect(caidasPorPersona([])).toEqual({});
  });

  it("…pero null o algo que no es lista es «no se sabe» (null, sin chips)", () => {
    expect(caidasPorPersona(null)).toBeNull();
    expect(caidasPorPersona({ error: "x" })).toBeNull();
    expect(caidasPorPersona(undefined)).toBeNull();
  });

  it("filas raras se saltan sin romper", () => {
    expect(caidasPorPersona([null, { user_id: 5, caidas: 3 }, { user_id: "ana" }, { user_id: "beto", caidas: 0 }])).toEqual({});
  });

  it("sin permiso o sin la RPC en la base se deja de preguntar; un corte de red se reintenta", () => {
    expect(errorSinArreglo("42501")).toBe(true);
    expect(errorSinArreglo("PGRST202")).toBe(true);
    expect(errorSinArreglo(undefined)).toBe(false);
    expect(errorSinArreglo("08006")).toBe(false);
  });

  it("lee solo con la pestaña a la vista y cada 2 minutos como mucho", () => {
    const t0 = 1_800_000_000_000;
    expect(tocaLeerCaidas(t0, null, true)).toBe(true);
    expect(tocaLeerCaidas(t0, null, false)).toBe(false);
    expect(tocaLeerCaidas(t0 + 20_000, t0, true)).toBe(false);
    expect(tocaLeerCaidas(t0 + LEER_CAIDAS_CADA_MS, t0, true)).toBe(true);
    // Un intervalo que llega unos ms antes no se salta la lectura.
    expect(tocaLeerCaidas(t0 + LEER_CAIDAS_CADA_MS - 50, t0, true)).toBe(true);
    expect(tocaLeerCaidas(t0 + LEER_CAIDAS_CADA_MS, t0, false)).toBe(false);
  });
});

describe("guardas del hub", () => {
  it("el chip va junto a los demás llamados de atención y solo con dato", () => {
    const s = leer("/frontend/src/pages/cowork/CoworkHostDashboard.tsx");
    const etiquetas = s.slice(s.indexOf("const etiquetasDe = ("), s.indexOf("const TONO_ETIQUETA"));
    expect(etiquetas).toContain('t("cowork.host.chip.unstableInternet", { n: caidas })');
    expect(etiquetas).toContain("hayChipDeCaidas(caidas)");
    expect(etiquetas).toContain("caidasDelEquipo?.[a.user_id]");
    // Solo visibilidad: el chip no habla ni manda nada.
    const chip = etiquetas.slice(etiquetas.indexOf("hayChipDeCaidas(caidas)"), etiquetas.indexOf("const problema = faceIssue"));
    expect(chip).not.toMatch(/encolarVoz|playCoordinatorRequestSound|notifications|toast/);
    expect(s).toContain("const caidasDelEquipo = useCaidasDelEquipo();");
  });

  it("el hook lee por la RPC (nunca la tabla), con la pestaña a la vista y sin push", () => {
    const h = leer("/frontend/src/hooks/useCaidasDelEquipo.ts");
    expect(h).toContain('rpc("cowork_caidas_recientes", { _minutos: VENTANA_DEL_CHIP_MIN })');
    expect(h).not.toContain('from("llamada_cortes")');
    expect(h).toContain("tocaLeerCaidas(Date.now(), ultimaLectura, document.visibilityState === \"visible\")");
    expect(h).toContain("window.setInterval(() => { void leer(); }, LEER_CAIDAS_CADA_MS)");
    // Un fallo se avisa en la consola y deja el mapa en null (sin chips).
    expect(h).toMatch(/console\.warn\("\[cowork_caidas_recientes\]"/);
    expect(h).toContain("setCaidas(null)");
    expect(h).not.toMatch(/from\("notifications"\)|encolarVoz|toast/);
  });

  it("la RPC sigue las reglas de Argos, cuenta solo «caida» y no abre la tabla", () => {
    const sql = leer("/supabase/migrations/20261118030000_cowork_caidas_recientes.sql");
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toContain("public.ve_argos()");
    expect(sql).toContain("public.argos_vigilables()");
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain("lc.fase = 'caida'");
    // Las caídas generales del servidor (3 o más personas a la vez) no cuentan.
    expect(sql).toMatch(/count\(distinct o\.uid\)[\s\S]*< 3/);
    expect(sql).toContain("revoke all on function public.cowork_caidas_recientes(integer) from public, anon;");
    // No toca la RLS de la tabla ni escribe nada.
    expect(sql).not.toMatch(/create policy|alter policy|drop policy|insert into|update public\.|delete from/i);
  });
});
