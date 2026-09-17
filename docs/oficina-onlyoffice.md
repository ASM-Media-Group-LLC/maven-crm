# Oficina · ONLYOFFICE

Cómo queda montada la Oficina de Maven con **ONLYOFFICE Docs** autohospedado, y
qué hay que hacer para levantarla.

## Quién hace qué

ONLYOFFICE **no guarda nada**. Abre un archivo que le pasás por URL y, cuando la
última persona cierra el documento, avisa que hay una versión nueva para bajar.
Todo lo demás —quién puede, dónde vive el archivo, qué versión es— lo pone Maven.

```
navegador ──abrir──► edge oficina-doc ──► config firmada + URL de R2
    │                                            │
    └────── editor de ONLYOFFICE ◄───────────────┘
                     │
                     ├── baja el .docx  ──────────► R2 (URL firmada, 1 h)
                     └── "hay versión nueva" ────► edge oficina-doc (?guardar=token)
                                                        └──► sube a R2 y sube `version`
```

⚠️ **El archivo no pasa por la edge al abrir.** Se le entrega a ONLYOFFICE una
URL firmada de R2 que vence en una hora: bajarlo es entre él y Cloudflare.
Proxearlo sería meter un archivo de megas en una función con 256 MB de memoria
para no ganar nada.

⚠️ **Por eso el balde `maven-oficina` NO necesita CORS.** Quien baja el archivo
es el *servidor* de ONLYOFFICE, no el navegador. Es la diferencia con
`maven-convertidos`, donde el navegador sí va directo a R2 y el CORS es
imprescindible.

## Dónde vive

La suite es lo único pesado de todo Maven, y la máquina de siempre está **al 62%
de CPU** con `whisper` llevándose 4 de los 8 núcleos al transcribir los audios
del bot. Va en otra máquina, con **su propio Dokploy**:

| | Maven | Oficina |
|---|---|---|
| Dokploy | `147.93.3.97` | `217.216.95.7:3000` |
| Proyecto | — | `Maven microservicios` |
| Servicio | — | `onlyoffice` |
| RAM | 32 GB | 62,8 GB |
| CPU en uso | ~62% | ~7% |

Son dos paneles separados, no un Dokploy con Remote Servers. Se evaluó la
segunda opción y se descartó: esta máquina ya traía su Dokploy instalado.

## La marca

La edición Community **obliga a mantener el logo de ONLYOFFICE visible** dentro
del editor. Quitarlo o poner el de Maven exige licencia comercial. Decidido con
Jhon el 16/09/2026: convivimos con el logo.

Por eso `customization` no toca el branding. Si alguien lo saca, Maven queda
usando software AGPL fuera de sus términos.

## Cómo quedó configurado

Lo de abajo ya está hecho en el Dokploy de `217.216.95.7`:

- **Servicio** `onlyoffice` en el proyecto `Maven microservicios`, proveedor
  Docker, imagen `onlyoffice/documentserver:9.4.0.1`.
  ⚠️ **9.4 o superior**: antes de esa versión la edición Community estaba
  limitada a 20 conexiones simultáneas, y somos 57. La 9.4 además se sacó de
  encima RabbitMQ y la base de datos, así que es un solo contenedor.
- **Dominio** `oficina.maven-ai.me`, puerto de contenedor **80**, HTTPS con
  Let's Encrypt (desafío HTTP por el puerto 80, que ya está abierto).
- **Volumen** `onlyoffice-data` en `/var/lib/onlyoffice`. Ahí ONLYOFFICE deja lo
  que todavía no guardó; sin volumen, un reinicio a mitad de edición se lleva el
  trabajo de quien estaba escribiendo.
- **Balde `maven-oficina`** en R2, sin acceso público, y el token de R2 ampliado
  a ese balde (⚠️ el token está limitado a baldes específicos: crear el balde
  **no** alcanza). Se amplió editando el token, que **no** rota el secreto.
- **DNS**: registro A `oficina` → `217.216.95.7`, TTL media hora.
  ⚠️ **maven-ai.me está en GoDaddy, no en Cloudflare.** Cloudflare solo tiene
  R2. Comprobado que resuelve, que el 80 redirige a HTTPS, que el 443 contesta
  (502: la ruta existe, falta el contenedor) y que
  `/.well-known/acme-challenge/` **no** se redirige, así que Let's Encrypt va a
  poder validar cuando el servicio levante.

## Lo que falta para encenderlo

1. **`JWT_SECRET`** en el servicio de Dokploy (pestaña Environment): un secreto
   largo y aleatorio (`openssl rand -hex 32`). La variable ya está creada, vacía.
2. **Secretos de Supabase** (Edge Functions → Secrets):
   - `ONLYOFFICE_URL` — `https://oficina.maven-ai.me`
   - `ONLYOFFICE_JWT_SECRET` — **el mismo** valor del paso 1
   - `R2_BUCKET_OFICINA` — no hace falta: `maven-oficina` ya es el valor por
     defecto en el código. Las llaves de R2 son las mismas que ya usan
     grabaciones y el conversor.
3. **Deploy del servicio** en Dokploy (⚠️ el botón tiene diálogo de
   confirmación: parece que no hace nada hasta que apretás Confirm).
4. **Desplegar la edge**, que además hay que redesplegar cada vez que se agrega
   un secreto: un secreto nuevo NO lo ve una edge ya desplegada.
   ```bash
   npx supabase functions deploy oficina-doc --project-ref lsagslbkliprespbyhts
   ```

⚠️ **No desplegar el servicio antes del paso 1.** Con `JWT_ENABLED=true` y el
secreto vacío la firma deja de proteger nada, y Traefik enruta por cabecera
`Host`: alcanza con mandarle esa cabecera a la IP para llegar al editor aunque
el DNS todavía no exista.

## Cosas que rompen y cuestan encontrar

- **La `key` del documento.** ONLYOFFICE cachea por esa llave y se niega a
  recargar si no cambia: mostraría la versión vieja y la persona jura que no se
  guardó lo suyo. Por eso `documents.version` sube en cada guardado y la llave es
  `<id>-v<version>`.
- **El aviso de guardado llega sin sesión de Maven**, porque lo manda el
  servidor de ONLYOFFICE y no el navegador. Se identifica con un permiso de un
  solo uso (`document_edit_grants`) y además viene firmado. Un 4xx ante un aviso
  mal formado deja a ONLYOFFICE reintentando para siempre: por eso se contesta
  `200 {error:1}`.
- **El `api.js` tiene que venir del mismo servidor** que después atiende al
  editor: lleva adentro su versión y sus rutas. Servirlo desde otro lado da un
  editor que carga y se queda en blanco.
- **El editor se embebe desde una página HTTPS**, así que el servidor tiene que
  ser HTTPS o el navegador lo bloquea sin decir por qué.

## Lo que quedó pendiente

- **El email de Let's Encrypt** de ese Dokploy quedó en el default de fábrica
  (`test@localhost.com`, en Settings → Web Server). Los certificados se emiten
  igual, pero los avisos de vencimiento no le llegan a nadie.
- **Buscar dentro del texto.** Existía con el editor propio y se perdió: ahora el
  contenido es un `.docx` en R2. Para recuperarlo hay que extraerle el texto al
  guardar. El listado sigue buscando por título.
- **Hojas de cálculo y presentaciones.** La base y la edge ya aceptan `xlsx` y
  `pptx`; falta la plantilla en blanco de cada uno y habilitarlo en la UI.
- **`infra/docs-sync` quedó superado.** ONLYOFFICE trae colaboración en vivo
  propia, así que el servidor de Yjs ya no cumple ninguna función. El código
  sigue en el repo por si se quiere para otra cosa, pero **el servicio de Dokploy
  se puede apagar**.
- **Sobras en `217.216.95.7`**: hay contenedores `kashcallqa-kashqadb`
  (postgres:18) de hace 4 meses, uno corriendo y cuatro muertos, que no
  pertenecen a ningún proyecto de Dokploy. No molestan —la máquina está al 7% de
  CPU— pero conviene confirmar que nadie los quiere antes de borrarlos: borrar
  el servicio se lleva el volumen con los datos.
