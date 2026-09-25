// Cowork.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_COWORK = ["cowork."] as const;

export const cowork = {
} as const satisfies Record<string, { es: string; en: string }>;
