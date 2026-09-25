// Creadoras: la ficha, el listado y el resto de pages/creadores. Onboarding,
// offboarding y prospectos ya estaban traducidos y viven en creadoras.ts («cr.»).
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_CREADORES_FICHA = ["creadores."] as const;

export const creadoresFicha = {
} as const satisfies Record<string, { es: string; en: string }>;
