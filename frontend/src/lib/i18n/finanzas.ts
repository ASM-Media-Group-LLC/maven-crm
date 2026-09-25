// Finanzas.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_FINANZAS = ["finanzas."] as const;

export const finanzas = {
} as const satisfies Record<string, { es: string; en: string }>;
