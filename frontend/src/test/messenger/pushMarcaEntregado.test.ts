// EL ✓ DE "LE LLEGÓ AL TELÉFONO".
//
// Antes, a alguien le sonaba el celular con un mensaje de Maven y al que lo
// mandó le seguía diciendo "Enviado · aún no le llegó" hasta que la persona
// abriera la aplicación. Le había llegado de verdad y la base no se enteraba.
//
// El camino es: `web-push` mete en el aviso la dirección a la que contestar
// (`ackUrl`), el service worker responde con su PROPIA suscripción, y la edge
// `push-entregado` resuelve de quién es esa suscripción y escribe el acuse.
//
// Estas guardas cuidan las tres cosas que no se pueden romper sin que alguien
// se entere, y una de ellas es de seguridad.
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(
  [
    "/frontend/public/sw-push.js",
    "/supabase/functions/web-push/index.ts",
    "/supabase/functions/push-entregado/index.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

// Sin esto, una guarda que no carga nada pasa en verde sin comprobar nada.
describe("los fuentes se cargaron de verdad", () => {
  it("los tres archivos están", () => {
    expect(Object.keys(fuentes)).toHaveLength(3);
    expect(leer("sw-push.js")).toContain("addEventListener");
  });
});

describe("el aviso lleva a dónde contestar", () => {
  it("web-push mete ackUrl en el aviso de mensaje de chat", () => {
    const s = leer("web-push/index.ts");
    expect(s).toContain("ackUrl");
    // Se arma con la URL del proyecto, no escrita a mano: sw-push.js es estático
    // y no sabe contra qué entorno corre.
    expect(s).toMatch(/ackUrl:\s*`\$\{Deno\.env\.get\("SUPABASE_URL"\)/);
  });
});

describe("el service worker contesta con su propia suscripción", () => {
  const sw = leer("sw-push.js");

  it("pregunta por su suscripción, que es lo único que lo identifica", () => {
    expect(sw).toContain("pushManager");
    expect(sw).toContain("getSubscription");
  });

  it("manda messageId y endpoint a la dirección que vino en el aviso", () => {
    expect(sw).toMatch(/fetch\(\s*data\.ackUrl/);
    expect(sw).toContain("messageId: data.messageId");
    expect(sw).toContain("endpoint: sub.endpoint");
  });

  it("⚠️ el acuse corre EN PARALELO al aviso, no solo si se dibuja la tarjeta", () => {
    // Con una ventana de Maven abierta, `mostrarAviso` sale temprano sin dibujar
    // nada. El mensaje llegó igual a este dispositivo y hay que decirlo, así que
    // el acuse no puede colgar de que la notificación se muestre.
    expect(sw).toMatch(/Promise\.all\(\[\s*mostrarAviso\(data\),\s*avisarEntregado\(data\)/);
  });

  it("no reintenta ni rompe si la puerta falla: es un ✓, no un mensaje", () => {
    expect(sw).toMatch(/\.catch\(function \(\) \{/);
  });
});

describe("⚠️ seguridad de la puerta push-entregado", () => {
  const edge = leer("push-entregado/index.ts");

  it("NUNCA escribe read_at: recibir no es leer", () => {
    // Lo único que se escribe es delivered_at. Marcar "leído" porque el teléfono
    // recibió algo sería mentirle al que mandó.
    const sinComentarios = edge.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).toContain("delivered_at");
    expect(sinComentarios).not.toContain("read_at");
  });

  it("comprueba que la persona sea PARTICIPANTE de la conversación", () => {
    // Sin esto, una dirección de suscripción filtrada serviría para marcar como
    // entregado cualquier mensaje de cualquier chat.
    expect(edge).toContain("chat_participants");
    expect(edge).toMatch(/\.eq\("conversation_id"/);
  });

  it("no pisa un acuse anterior", () => {
    expect(edge).toContain("ignoreDuplicates: true");
  });

  it("no delata qué suscripciones existen: contesta 200 igual", () => {
    expect(edge).toMatch(/if \(!sub\?\.user_id\) return json\(req, \{ ok: true, marcado: false \}\)/);
  });

  it("uno no se entrega sus propios mensajes", () => {
    expect(edge).toMatch(/msg\.sender_id === sub\.user_id/);
  });
});
