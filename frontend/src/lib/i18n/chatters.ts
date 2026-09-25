// Chatters (evaluador, rendimiento, horarios).
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_CHATTERS = ["chatters."] as const;

export const chatters = {
} as const satisfies Record<string, { es: string; en: string }>;
