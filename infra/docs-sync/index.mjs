// docs-sync — el servidor de edición compartida de la Oficina de Maven.
//
// Qué hace: mantiene vivo el documento de Yjs mientras varias personas lo
// escriben, fusiona lo que manda cada una, reparte los cursores y baja el
// resultado a Postgres. Es la pieza que TIENE LA VERDAD: Supabase Realtime sabe
// reenviar mensajes pero no guarda ni fusiona, así que con él solo, quien entra
// tarde no vería lo ya escrito y si se desconectan todos se pierde lo último.
//
// Env:
//   SUPABASE_URL              (obligatorio)
//   SUPABASE_SERVICE_ROLE_KEY (obligatorio — para leer/escribir el estado)
//   SUPABASE_ANON_KEY         (obligatorio — para verificar el token de quien entra)
//   PORT                      (default 8080)
//   GUARDAR_CADA_MS           (default 2000)
//
// ⚠️ La clave de servicio NUNCA sale de acá: el navegador se conecta con SU
// token de Maven y este servicio decide si lo deja entrar.
// ⚠️ `Server` es un singleton ya instanciado con `.configure()`, NO una clase:
// `new Server(...)` tira "Server is not a constructor". `Hocuspocus` sí es la
// clase, y se prefiere porque deja una instancia explícita en vez de un global.
import { Hocuspocus } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || 8080);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const GUARDAR_CADA_MS = Number(process.env.GUARDAR_CADA_MS || 2000);

for (const [nombre, valor] of Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY,
})) {
  if (!valor) {
    console.error(`Falta ${nombre}`);
    process.exit(1);
  }
}

/** Cliente con la clave de servicio: solo para leer y escribir el estado ya
 *  autorizado. NO se usa para decidir si alguien puede entrar. */
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un color estable por persona, para su cursor. El mismo hash siempre da el
 *  mismo tono, así que a lo largo del día cada quien "es" del mismo color. */
function colorDe(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 55%)`;
}

const servidor = new Hocuspocus({
  port: PORT,
  quiet: true,

  /** La puerta. Se corre ANTES de mandarle un solo byte del documento a nadie.
   *
   *  No se verifica la firma del token a mano: se le pregunta a Supabase con la
   *  clave pública, que es quien sabe. Y para "¿puede ver ESTE documento?" se
   *  consulta la tabla CON EL TOKEN DE LA PERSONA, para que conteste la misma
   *  RLS que gobierna el resto de Maven. Duplicar acá las reglas de acceso sería
   *  garantizar que algún día se desincronicen. */
  async onAuthenticate({ token, documentName }) {
    if (!ES_UUID.test(documentName)) throw new Error("Documento inválido");
    if (!token) throw new Error("Sin token");

    const comoLaPersona = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: auth, error: errAuth } = await comoLaPersona.auth.getUser(token);
    if (errAuth || !auth?.user) throw new Error("Token inválido");

    const { data: fila, error: errDoc } = await comoLaPersona
      .from("documents")
      .select("id")
      .eq("id", documentName)
      .maybeSingle();
    if (errDoc) throw new Error("No se pudo verificar el acceso");
    if (!fila) throw new Error("Sin acceso a este documento");

    const u = auth.user;
    const nombre =
      u.user_metadata?.full_name || u.user_metadata?.name || u.email || "Alguien";

    // Lo que vuelve acá viaja a los DEMÁS participantes (es lo que dibuja el
    // cursor con su nombre), así que va solo lo que puede verse: nada de correo
    // ni de token.
    return { user: { id: u.id, name: nombre, color: colorDe(u.id) } };
  },

  extensions: [
    new Database({
      /** Primera vez que alguien abre el documento en este servidor. */
      async fetch({ documentName }) {
        const { data, error } = await admin
          .from("documents")
          .select("ydoc")
          .eq("id", documentName)
          .maybeSingle();
        if (error) {
          console.error("[docs-sync] fetch", documentName, error.message);
          throw error;
        }
        if (!data?.ydoc) return null; // nunca se abrió: el navegador lo siembra
        return Buffer.from(data.ydoc, "base64");
      },

      /** Cada GUARDAR_CADA_MS mientras haya cambios, y una vez más al quedar la
       *  sala vacía. */
      async store({ documentName, state }) {
        const { error } = await admin
          .from("documents")
          .update({
            ydoc: Buffer.from(state).toString("base64"),
            ydoc_saved_at: new Date().toISOString(),
          })
          .eq("id", documentName);
        if (error) console.error("[docs-sync] store", documentName, error.message);
      },
    }),
  ],

  // Escribir es una ráfaga de mensajes chiquitos; guardar en cada uno sería
  // pegarle a Postgres decenas de veces por minuto y por documento.
  debounce: GUARDAR_CADA_MS,
  maxDebounce: 10000,

  async onConnect({ documentName }) {
    console.log(`[docs-sync] entra a ${documentName}`);
  },
  async onDisconnect({ documentName, clientsCount }) {
    console.log(`[docs-sync] sale de ${documentName} (quedan ${clientsCount})`);
  },
});

servidor.listen();
console.log(`[docs-sync] escuchando en :${PORT} (guarda cada ${GUARDAR_CADA_MS} ms)`);
