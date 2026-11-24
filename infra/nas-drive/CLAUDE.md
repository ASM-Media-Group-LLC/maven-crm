# Trabajar en el mini5 (el servidor del Drive de Oficina)

Esta guía es para un Claude que opera **en** el mini5 (`unlok-server-5`, usuario `asm002`) o que entra por ssh desde otro Mac. El mini **no es una máquina de desarrollo**: aquí se opera infraestructura. Las reglas generales están en el `CLAUDE.md` de la raíz; cómo está hecho el servidor, en el `README.md` de esta carpeta.

## Qué corre aquí y cómo se comprueba

| Pieza | Cómo corre | Cómo se comprueba |
|---|---|---|
| Servidor de archivos del Drive | LaunchAgent `ai.maven.nas-drive` → `~/maven-nas-drive/server.mjs` (Node, puerto 8790, solo acepta peticiones firmadas) | `curl -s http://127.0.0.1:8790/salud` en el mini; desde fuera `https://drive.147-93-3-97.nip.io/salud` (la puerta; hasta el 23/10 era `drive.217-216-95-7.nip.io`). Registro: `~/maven-nas-drive/servidor.log` |
| Índice diario de los discos | LaunchAgent `ai.maven.nas-drive-indice`, 3:15 de la madrugada | `~/maven-nas-drive/indice.log`; deja `_indice/actual.csv` y `.json` en cada disco |
| Runner del CI (revisión de cada PR) | LaunchDaemon `ai.maven.ci-runner`, usuario aislado `maven-ci` | `launchctl print system/ai.maven.ci-runner` (state = running) o `gh api repos/<repo>/actions/runners` |
| Herramientas de la salida de Google | rclone con los remotos `gdrive` (lectura), `gborrar` (borrado) y `nas`; carpetas `~/importar`, `~/vaciar`, `~/permisos` | los scripts dejan `.log` al lado |
| Copia del repo | `~/Projects/maven-crm`, se actualiza por empuje desde el Mac de Jhon (`actualizar-repo-equipo`) | `git log -1` ahí. No tiene acceso a GitHub: desde el mini no se abren PRs |

El camino de un archivo: el frontend pide a la edge `drive` de Supabase, que firma un permiso; el navegador va a la **puerta** (`infra/nas-drive/puerta`, Caddy + Tailscale en el Dokploy de 147.93.3.97; cómo montarla o mudarla, en el `README.md`), y la puerta entra al mini por Tailscale con el nombre MagicDNS `unlok-workstation`, nunca por IP (cambia al volver a entrar). En disco los archivos son `/Volumes/NASx/maven-drive/<agencia>/<id>`, sin nombre ni carpeta: eso vive en `drive_items` en la base.

## Actualizar el servidor

Desde la copia del repo, con respaldo y sin reiniciar a ciegas:

```bash
cd ~/Projects/maven-crm/infra/nas-drive
for f in server.mjs firma.mjs zip.mjs miniaturas.mjs papelera.mjs indice.mjs tipos.mjs; do
  cp ~/maven-nas-drive/$f ~/maven-nas-drive/$f.antes-$(date +%d-%m) 2>/dev/null; cp $f ~/maven-nas-drive/$f
done
# Carga server.mjs con TODO lo que importa, sin arrancarlo: si falta un archivo, falla aquí y no en el reinicio.
# (la ruta NO va como argumento: con ella en argv[1], server.mjs se creería el principal y arrancaría)
node -e 'import(process.env.HOME + "/maven-nas-drive/server.mjs").then(() => console.log("server.mjs carga bien"))'
launchctl kickstart -k gui/$(id -u)/ai.maven.nas-drive
tail -5 ~/maven-nas-drive/servidor.log && curl -s http://127.0.0.1:8790/salud
```

- `server.mjs` importa `firma.mjs`, `zip.mjs`, `miniaturas.mjs` y `papelera.mjs` (`indice.mjs` también usa `papelera.mjs`): si falta uno, no arranca. Se copian juntos.
- El reinicio a veces lo bloquea el clasificador de comandos; entonces lo corre Jhon. Después del reinicio, mirar siempre `servidor.log` y `/salud`.
- Agregar un disco = sumarlo a `RAICES` en `~/maven-nas-drive/.env`, reiniciar y tocar «Permitir» en la pantalla.

## Trampas que ya nos costaron

- **macOS pide «Permitir»** la primera vez que `node` toca un volumen externo, y otra vez si Homebrew cambia la ruta de Node. Por ssh no se puede: alguien lo toca en la **pantalla** del mini. Sin eso, el servidor se queda colgado **sin error**.
- **Los discos no se leen por ssh** (`Operation not permitted`). Lo que tenga que mirar `/Volumes` se lanza con `open -a Terminal script.sh` y vuelca la salida a `~`.
- **`ssh host 'false'` devuelve 0** y en el zsh del mini **`grep -q` es un alias que también da 0**: para esperar algo remoto, comparar la salida (`/usr/bin/grep -c`), nunca el código de salida.
- **`perl alarm` no frena a rclone**: un tope de tiempo real es fork + `kill TERM` al vencer (`~/vaciar/vaciar7.sh`).
- **`rclone lsjson -R` sigue los accesos directos** (el ID trae un tabulador) y `--fast-list` no ve lo recién creado en «compartido conmigo».
- Con un volumen a medias, `rsync`/`cp` pueden quedarse pegados sin error: comprobar antes `df -h /Volumes/NAS1 /Volumes/NAS2`.

## Lo que no se hace desde aquí

- No se borra nada del NAS a mano: lo que se elimina en Maven lo quita el propio servidor, y las limpiezas de Google solo borran **archivos** ya verificados en el NAS, nunca carpetas ni unidades. Los scripts de vaciado los lanza Jhon.
- Lo que se borra para siempre en Maven no desaparece en el acto: pasa 30 días en `<raíz>/.borrados/AAAA-MM-DD/<agencia>/<id>` (mismo disco) y la purga la hace `indice.mjs` cada noche. No se vacía `.borrados` a mano para «hacer lugar»: es la única red si alguien borró por error. Cómo recuperar algo: `README.md`, «La papelera del disco».
- No se toca el usuario `maven-ci` ni se le da acceso a los discos: su aislamiento es lo que protege el NAS de un PR malicioso.
- No se imprimen ni se copian los secretos de `~/maven-nas-drive/.env` (`DRIVE_SECRETO`, `RAICES`, `ORIGENES`, `PUERTO`, `HOST`, `MAVEN_FUNCIONES`). El mismo secreto vive en Supabase como `DRIVE_SECRETO`, junto con `DRIVE_NAS_URL`.
- No hay copia de seguridad del Drive ni los discos son espejo (decisión de Jhon, 28/09/2026). Un disco muerto son archivos perdidos: cualquier operación sobre `/Volumes` se piensa dos veces.
