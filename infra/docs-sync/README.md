# docs-sync — edición compartida de la Oficina

El servidor que mantiene vivo el documento mientras **varias personas lo escriben
a la vez**: fusiona lo que manda cada una, reparte los cursores y baja el
resultado a Postgres.

Es la pieza que **tiene la verdad** del documento mientras se edita. Supabase
Realtime no sirve para esto: sabe *reenviar* mensajes, pero no guarda ni fusiona
— con él solo, quien entra tarde no vería lo ya escrito y si se desconectan
todos se pierde lo último.

## Por qué es barato

Websockets y fusiones chiquitas: **~300 MB de RAM y casi nada de CPU**. Importa
porque comparte máquina con `whisper`, que salta a 4 de los 8 núcleos cuando
transcribe los audios del bot de WhatsApp — algo que alguien está esperando del
otro lado. Un OnlyOffice o un Collabora habrían pedido 2-4 GB y CPU de verdad.

## Cómo decide quién entra

1. Verifica el token contra Supabase con la **clave pública**. No se valida la
   firma a mano: Supabase es quien sabe.
2. Consulta `documents` **con el token de la persona**, para que conteste la
   misma RLS que gobierna el resto de Maven.

Duplicar acá las reglas de acceso sería garantizar que algún día se
desincronicen. La clave de servicio se usa **solo** para leer y escribir el
estado ya autorizado, y nunca sale del proceso.

⚠️ El **nombre y el color del cursor los publica el navegador**, no este
servidor: así funciona la extensión de cursores de TipTap. La etiqueta que ven
los demás es una comodidad, no una prueba de identidad. Lo que sí se controla
acá, que es lo que importa, es el **acceso**.

## Variables

Copiar `.env.example` a `.env` y completar. `SUPABASE_SERVICE_ROLE_KEY` es un
secreto: no va al repo ni a un chat.

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | El proyecto. |
| `SUPABASE_SERVICE_ROLE_KEY` | Leer y escribir `documents.ydoc`. **Secreto.** |
| `SUPABASE_ANON_KEY` | Verificar el token de quien se conecta. |
| `PORT` | Default 8080 (en local usamos 8081). |
| `GUARDAR_CADA_MS` | Default 2000. Cada cuánto baja el estado a Postgres. |

## Correrlo en local

```bash
cd infra/docs-sync
cp .env.example .env     # y completar las dos claves
npm install
node --env-file=.env index.mjs
```

Y en `frontend/.env.local` (que no se versiona):

```
VITE_DOCS_SYNC_URL=ws://localhost:8081
```

**Sin esa variable el editor funciona de a uno** y guarda contra la base como en
la Fase 1. No es un error: es lo correcto donde el servicio no está levantado.

## Qué guarda

`documents.ydoc` — el estado de Yjs en **base64 sobre una columna de texto**, no
en `bytea`. PostgREST viaja en JSON: meter bytes crudos obliga a codificarlos
igual (hex con prefijo `\x`) y a acordarse de decodificarlos en los dos
extremos. base64 cuesta un 33% de tamaño —irrelevante para un documento— y
elimina esa clase entera de errores.

`documents.ydoc_saved_at` es el **latido**: si está viejo mientras hay gente
editando, este servicio no está guardando.

`content_html` lo sigue escribiendo el navegador, y sigue siendo lo que se lee,
se busca y se imprime. Con la colaboración pasa a ser el **resultado**, no la
fuente.

## Pendiente antes de usarlo de verdad

- [ ] Aplicar la migración `20260914180000_oficina_colaboracion.sql` (agrega
      `ydoc` y `ydoc_saved_at`).
- [ ] Servicio en Dokploy con las dos claves, y `VITE_DOCS_SYNC_URL` apuntando
      ahí por `wss://` (no `ws://`: el frontend va por HTTPS y el navegador
      bloquea un websocket sin cifrar desde una página segura).
