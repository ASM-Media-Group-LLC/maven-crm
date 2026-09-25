// Scouter Assist.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_SCOUTER = ["scouter."] as const;

export const scouter = {
} as const satisfies Record<string, { es: string; en: string }>;
