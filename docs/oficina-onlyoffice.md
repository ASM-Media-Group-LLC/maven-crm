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

## Por qué en otro servidor

La suite es lo único pesado de todo Maven, y la máquina de siempre está **al 62%
de CPU** con `whisper` llevándose 4 de los 8 núcleos al transcribir los audios
del bot. Va en un servidor aparte, agregado al mismo Dokploy como **Remote
Server**: un solo panel, dos máquinas.

Recomendado: **4 vCPU / 8 GB**, Ubuntu con SSH.

## La marca

La edición Community **obliga a mantener el logo de ONLYOFFICE visible** dentro
del editor. Quitarlo o poner el de Maven exige licencia comercial. Decidido con
Jhon el 16/09/2026: convivimos con el logo.

Por eso `customization` no toca el branding. Si alguien lo saca, Maven queda
usando software AGPL fuera de sus términos.

## Pasos para levantarlo

1. **Servidor nuevo** (4 vCPU / 8 GB, Ubuntu, SSH).
2. **Dokploy → Settings → SSH Keys**: crear una llave e instalar la pública en
   el servidor.
3. **Dokploy → Remote Servers**: agregar el servidor. Dokploy le instala Docker.
4. **Servicio nuevo de tipo Docker** en ese servidor, con la imagen
   `onlyoffice/documentserver:latest` (9.4 o superior — antes de esa versión la
   edición Community estaba limitada a 20 conexiones simultáneas).
   - Variable `JWT_ENABLED=true` y `JWT_SECRET=<un secreto largo>`.
   - Dominio con **HTTPS**: el editor se embebe desde una página segura y el
     navegador bloquea contenido sin cifrar.
5. **Balde `maven-oficina`** en R2, con CORS que permita `GET` desde
   `app.maven-ai.me` y `maven.asmtech.ai`, y el token de R2 ampliado a ese balde
   (⚠️ el token está limitado a baldes específicos: crear el balde **no** alcanza).
6. **Secretos de Supabase** (Edge Functions → Secrets):
   - `ONLYOFFICE_URL` — la URL pública del servidor, con `https://`
   - `ONLYOFFICE_JWT_SECRET` — el mismo `JWT_SECRET` de arriba
   - `R2_BUCKET_OFICINA` — `maven-oficina` (opcional; es el valor por defecto)
7. **Desplegar la edge**, que además hay que redesplegar cada vez que se agrega
   un secreto: un secreto nuevo NO lo ve una edge ya desplegada.
   ```bash
   npx supabase functions deploy oficina-doc --project-ref lsagslbkliprespbyhts
   ```

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

## Lo que quedó pendiente

- **Buscar dentro del texto.** Existía con el editor propio y se perdió: ahora el
  contenido es un `.docx` en R2. Para recuperarlo hay que extraerle el texto al
  guardar. El listado sigue buscando por título.
- **Hojas de cálculo y presentaciones.** La base y la edge ya aceptan `xlsx` y
  `pptx`; falta la plantilla en blanco de cada uno y habilitarlo en la UI.
- **`infra/docs-sync` quedó superado.** ONLYOFFICE trae colaboración en vivo
  propia, así que el servidor de Yjs ya no cumple ninguna función. El código
  sigue en el repo por si se quiere para otra cosa, pero **el servicio de Dokploy
  se puede apagar**.
