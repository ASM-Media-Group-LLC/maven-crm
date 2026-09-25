// Company QA (agency QA).
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_AGENCY_QA = ["agencyQa."] as const;

export const agencyQa = {
} as const satisfies Record<string, { es: string; en: string }>;
