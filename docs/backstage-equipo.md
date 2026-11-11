# Backstage manda el equipo — `POST /equipo/sync`

Decisión de Alvaro (11/11/2026): **Backstage manda** sobre quién está en el equipo, su rol, su
equipo y a quién reporta cada persona. Maven abre la puerta y Backstage le empuja la lista
completa. Si alguien sale o queda inactivo en Backstage, en Maven va a la **papelera** (30 días,
igual que «Eliminar» en la app): las cuentas nunca se borran de verdad.

Todo nace en **ensayo**: hasta que el dueño de la agencia prenda «aplicar», Maven solo contesta
qué cambiaría y no toca nada.

---

## 1. La llave

1. En Maven: **Ajustes → API keys → Nueva key**, con el permiso **«⚠️ Backstage manda el equipo»**
   (`equipo:write`). La tiene que crear un **admin o el dueño**: la key actúa como quien la crea
   y la base exige que esa persona sea admin o dueña de la agencia.
2. Recomendado: ponerle las IPs fijas del servidor de Backstage y un vencimiento.
3. La key (`mvk_live_…`) se muestra **una sola vez**. Se guarda como secreto en Backstage, nunca en
   el código ni en un chat.

## 2. El pedido

```
POST https://lsagslbkliprespbyhts.supabase.co/functions/v1/public-api/equipo/sync
Authorization: Bearer mvk_live_...        (o la cabecera X-API-Key: mvk_live_...)
Content-Type: application/json
Accept-Language: es                        (o en, para los mensajes de error en inglés)
```

Cuerpo (JSON, hasta **64 KB**, unas 250 personas; tope de 1000 personas por envío):

```json
{
  "ensayo": true,
  "personas": [
    {
      "correo": "ana@maven-ai.me",
      "nombre": "Ana Pérez",
      "rol": "Chatter",
      "equipo": "Chatters A",
      "reporta_a": "beto@maven-ai.me",
      "nivel": "agente",
      "activo": true,
      "hora_entrada": "08:00",
      "hora_salida": "16:00"
    },
    { "correo": "carla@maven-ai.me", "activo": false }
  ]
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `personas` | sí | La lista **completa** del equipo (de 1 a 1000). |
| `ensayo` | no (`false`) | `true` = que no se aplique nada aunque el interruptor de Maven esté prendido. |
| `correo` | sí | Correo de trabajo. Así se encuentra a la persona en Maven (sin mayúsculas). |
| `nombre` | no | Solo para el reporte (`pendientes_de_crear`). Maven no cambia nombres por aquí. |
| `rol` | no | Nombre del rol. Tiene que existir en Maven (ver §5). |
| `equipo` | no | Texto libre, hasta 80 caracteres. `null` lo vacía. |
| `reporta_a` | no | **Correo** del jefe. Tiene que estar en Maven y activo. `null` lo vacía. |
| `nivel` | no | `agente`, `supervisor` o `manager`. (admin y dueño solo se ponen a mano en Maven.) |
| `activo` | no (`true`) | `false` = a la papelera. |
| `hora_entrada`, `hora_salida` | no | `HH:MM` de 24 h. `null` vacía el horario propio (queda el del rol). |

Un campo que **no viene** no se toca. Un campo en `null` se vacía (equipo, jefe, horario).

## 3. Las reglas

- Se busca a cada persona **por su correo, solo dentro de la agencia de la key**. Una key nunca ve
  ni toca a nadie de otra agencia.
- **Admins y dueños no se tocan nunca** (salen en `protegidos`). Tampoco la persona de la key.
- **Nadie sube a admin o dueño** por aquí: ni con `rol` ni con `nivel` (sale en `rechazados`).
- `activo: false` → papelera: se cierra su sesión, se bloquea la entrada y queda en la bitácora de
  cuentas (como «Eliminar»). Volver de la papelera lo hace una persona en Maven (Papelera → Restaurar);
  si Backstage la manda activa, sale en `en_papelera`.
- **Quien no está en Maven no se crea**: sale en `pendientes_de_crear`.
- **Quien está en Maven y no vino en la lista no se toca**: sale en `no_vienen_en_backstage`. Faltar
  no es irse; para sacar a alguien hay que mandarlo con `activo: false`.
- **Un rol que Maven no tiene no se inventa**: sale en `roles_desconocidos`.
- **Freno de bajas**: si un envío trae más bajas que el tope (5 al empezar), no se aplica ninguna de
  esas bajas (sí lo demás) y sale `freno_de_bajas`. Un error de Backstage no vacía el equipo.
- Un correo repetido en la lista no toca a nadie con ese correo (sale en `rechazados`).

## 4. La respuesta (200)

```json
{
  "object": "equipo_sync",
  "ensayo": true,
  "aplicar_activado": false,
  "sync_id": "6f1c…",
  "recibidas": 2,
  "cambios": [
    { "user_id": "a1…", "correo": "ana@maven-ai.me", "nombre": "Ana", "campo": "rol",
      "antes": "Warming", "despues": "Chatter", "aplicado": false, "se_aplicaria": true },
    { "user_id": "a1…", "correo": "ana@maven-ai.me", "nombre": "Ana", "campo": "reporta_a",
      "antes": null, "despues": "beto@maven-ai.me", "aplicado": false, "se_aplicaria": true },
    { "user_id": "c3…", "correo": "carla@maven-ai.me", "nombre": "Carla", "campo": "papelera",
      "antes": null, "despues": "papelera", "aplicado": false, "se_aplicaria": true }
  ],
  "pendientes_de_crear": [{ "correo": "nueva@maven-ai.me", "nombre": "Nueva", "rol": "Chatter", "equipo": "Chatters A" }],
  "roles_desconocidos": [{ "rol": "Closer Senior", "correos": ["luis@maven-ai.me"] }],
  "protegidos": [{ "user_id": "d4…", "correo": "dueno@maven-ai.me", "nombre": "Dueño", "motivo": "admin_o_dueno" }],
  "no_vienen_en_backstage": [{ "user_id": "e5…", "correo": "eva@maven-ai.me", "nombre": "Eva", "rol": "Chatter" }],
  "en_papelera": [],
  "rechazados": [{ "indice": 4, "correo": "luis@maven-ai.me", "campo": "reporta_a", "motivo": "jefe_no_esta_en_maven", "valor": "x@y.com" }],
  "freno_de_bajas": null
}
```

- `campo` de un cambio: `rol`, `nivel`, `equipo`, `reporta_a`, `hora_entrada`, `hora_salida` o `papelera`.
- `aplicado`: se hizo en este envío. `se_aplicaria`: la base lo validó (en ensayo, se haría al prender).
- `motivo` de un rechazo: `no_es_un_objeto`, `campo_desconocido`, `correo_invalido`, `correo_repetido`,
  `tipo_invalido`, `texto_muy_largo`, `nivel_invalido`, `nivel_de_admin`, `rol_de_admin`,
  `hora_invalida`, `jefe_no_esta_en_maven`, `jefe_es_la_misma_persona`, `jefe_en_papelera`,
  `freno_de_bajas`, o uno de la base (`protegido`, `en_papelera`, `no_es_de_la_agencia`,
  `rol_desconocido`, `error_de_base`…).

Errores: `400` (cuerpo mal: `invalid_json`, `unknown_field`, `invalid_field`), `401` (key inválida,
revocada o vencida), `403` (`forbidden`: sin `equipo:write`, o quien creó la key ya no es admin ni
dueño; `resource_unavailable`: Maven tiene más de una agencia, ver §6), `413` (más de 64 KB),
`429` (cupo: 60 por minuto, 1000 por hora; respetar `Retry-After`), `503` (problema de Maven:
reintentar después de `Retry-After`; el envío es la foto completa, así que repetirlo es seguro).

## 5. Lo que maneja el dueño en Maven

Todo vive en la tabla `integracion_equipo` (una fila por agencia). Hasta que haya pantalla, se
cambia desde el editor SQL de Supabase:

```sql
-- Ver cómo está y lo último que llegó
select aplicar, max_bajas_por_sync, mapa_roles, ultima_sync, ultima_sync_at, actualizado_por
  from public.integracion_equipo;

-- PRENDER (aplica de verdad) / APAGAR (vuelve a ensayo)
update public.integracion_equipo set aplicar = true;
update public.integracion_equipo set aplicar = false;

-- Freno de bajas por envío
update public.integracion_equipo set max_bajas_por_sync = 10;

-- Nombres de rol de Backstage que no coinciden con los de Maven (Backstage → Maven, exacto)
update public.integracion_equipo set mapa_roles = '{"Chat Agent": "Chatter", "Closer Senior": "Closer +"}';

-- La bitácora: cada envío, qué calculó, qué aplicó y qué rechazó la base
select created_at, ultima_vez, repeticiones, ensayo, recibidas,
       jsonb_array_length(resumen->'cambios') cambios, aplicados, rechazados_base
  from public.integracion_equipo_syncs order by created_at desc limit 20;

-- El equipo y el jefe de cada persona según Backstage
select p.full_name, ie.equipo, j.full_name as reporta_a
  from public.integracion_equipo_personas ie
  join public.profiles p on p.id = ie.user_id
  left join public.profiles j on j.id = ie.reporta_a;
```

Desde la app, con la sesión del dueño, la RLS deja cambiar solo `aplicar`, `max_bajas_por_sync` y
`mapa_roles`, y solo al dueño de la agencia; los admins y el dueño pueden leer la bitácora.

Los roles se emparejan así: primero `mapa_roles`, después el nombre exacto, después el mismo nombre
sin mayúsculas ni acentos. Si no hay uno solo, no se adivina (`roles_desconocidos`).

## 6. Lo que todavía no hace

- **No crea cuentas** (decisión: Backstage avisa, una persona crea la cuenta en Maven).
- **El equipo y el jefe se guardan, pero Maven todavía no los usa** para la supervisión (Pulso,
  Argos, «mi equipo»): hoy el equipo se deduce del rol. Conectarlos es un paso aparte.
- **Con dos o más agencias en Maven el endpoint se apaga** (`403 resource_unavailable`) hasta probar
  la separación con la segunda agencia real. La base ya filtra todo por la agencia de la key; esto
  es un segundo cerrojo.

---

## 7. PROMPT para el Claude de Backstage

Copia y pega esto tal cual en el Claude que trabaja en el código de Backstage:

````text
Necesito que Backstage empuje el equipo completo a Maven (el CRM de la agencia). Maven ya tiene
el endpoint listo; tu trabajo es construir el lado de Backstage. Backstage es la fuente de verdad
de las personas, su rol, su equipo y a quién reporta cada una.

ENDPOINT
  POST https://lsagslbkliprespbyhts.supabase.co/functions/v1/public-api/equipo/sync
  Cabeceras:
    Authorization: Bearer <MAVEN_API_KEY>
    Content-Type: application/json
  MAVEN_API_KEY es un secreto (empieza con mvk_live_). Léelo de una variable de entorno o del
  gestor de secretos; nunca lo escribas en el código, en logs ni en mensajes de error.

CUERPO (JSON compacto, máximo 64 KB, máximo 1000 personas)
  {
    "ensayo": <bool>,
    "personas": [
      {
        "correo": "<correo de trabajo, el mismo que usa en Maven>",
        "nombre": "<nombre completo>",
        "rol": "<nombre del rol>",
        "equipo": "<nombre del equipo, o null>",
        "reporta_a": "<correo de trabajo de su jefe, o null>",
        "nivel": "agente" | "supervisor" | "manager",
        "activo": <bool>,
        "hora_entrada": "HH:MM" | null,
        "hora_salida": "HH:MM" | null
      }
    ]
  }
  - Manda SIEMPRE la lista COMPLETA, nunca solo lo que cambió.
  - Incluye a las personas inactivas o que salieron con "activo": false. Maven NO saca a nadie por
    no venir en la lista: si no la mandas con activo false, sigue activa en Maven.
  - Un campo que no conoces, NO lo mandes (no mandes null "por si acaso": null borra el valor en
    Maven para equipo, reporta_a y horario).
  - Nunca mandes nivel admin ni dueño, ni un rol de admin: Maven los rechaza.
  - Si el equipo es más grande que 64 KB de JSON, avísame antes de partirlo: no lo partas solo.

CUÁNDO MANDAR
  1. Cada 15 minutos (configurable con MAVEN_SYNC_MINUTOS), la lista completa.
  2. Además, cada vez que cambie algo del equipo en Backstage (alta, baja, cambio de rol, de
     equipo, de jefe, de nivel o de horario), con una espera de 30 segundos para juntar cambios
     seguidos en un solo envío.
  3. Nunca dos envíos a la vez: si uno está en curso, el siguiente espera a que termine.

ENSAYO
  - Agrega la variable MAVEN_SYNC_ENSAYO, por defecto "true", y mándala en el campo "ensayo".
  - Mientras sea true, Maven no cambia nada: solo contesta qué cambiaría. Además, Maven tiene su
    propio interruptor, también en ensayo, que prende su dueño. Pasar MAVEN_SYNC_ENSAYO a "false"
    lo decide la agencia cuando el ensayo se vea bien, no tú.

RESPUESTA 200 (guárdala y muéstrala)
  {
    "ensayo": bool, "aplicar_activado": bool, "sync_id": "...", "recibidas": n,
    "cambios": [{ "correo", "campo", "antes", "despues", "aplicado", "se_aplicaria" }],
    "pendientes_de_crear": [{ "correo", "nombre", "rol", "equipo" }],
    "roles_desconocidos": [{ "rol", "correos": [] }],
    "protegidos": [{ "correo", "motivo" }],
    "no_vienen_en_backstage": [{ "correo", "nombre", "rol" }],
    "en_papelera": [{ "correo", "nombre" }],
    "rechazados": [{ "indice", "correo", "campo", "motivo", "valor" }],
    "freno_de_bajas": null | { "bajas_pedidas", "tope" }
  }
  - Guarda cada respuesta (fecha, sync_id, ensayo, cuántos cambios, cuántos aplicados) en una
    tabla o log de Backstage, y muestra la última en la pantalla de administración de Backstage.
  - Muestra como AVISOS para un administrador de Backstage:
      · pendientes_de_crear: «esta persona no tiene cuenta en Maven; hay que crearla allá».
      · roles_desconocidos: «este rol no existe en Maven; hay que crearlo allá o pedir que lo
        emparejen».
      · rechazados: el motivo, para corregir el dato en Backstage.
      · freno_de_bajas: «Maven frenó N bajas en un solo envío; revisa que no sea un error».
      · no_vienen_en_backstage: «estas personas están en Maven y no en Backstage»; puede ser
        alguien que falta cargar en Backstage, o alguien que hay que dar de baja (activo false).
  - protegidos (admins y dueños) es normal: Maven no los toca. No es un error.

ERRORES
  - 400: el cuerpo está mal. No reintentes igual: registra el "message" y avisa.
  - 401: la key no sirve (revocada o vencida). No reintentes: avisa a un administrador.
  - 403: la key no tiene permiso, o Maven apagó el endpoint. No reintentes: avisa.
  - 413: el cuerpo pasa de 64 KB. Avisa.
  - 429 y 503: espera lo que diga la cabecera Retry-After (en segundos) y reintenta el MISMO
    envío, hasta 5 veces con espera creciente. Repetirlo es seguro: es la foto completa.
  - Error de red o tiempo agotado (usa 30 s): reintenta igual que un 503.
  - Todas las respuestas de error traen { "error": "<código>", "message": "<texto>" }.
    Con la cabecera Accept-Language: en, el texto viene en inglés.

PRUEBAS QUE QUIERO
  - Que el cuerpo se arma con TODAS las personas, también las inactivas (activo false).
  - Que un campo desconocido no se manda como null.
  - Que no hay dos envíos a la vez, y que los cambios seguidos se juntan en uno.
  - Que 429/503 reintentan respetando Retry-After y que 400/401/403/413 no reintentan.
  - Que la key nunca aparece en logs.

Empieza con MAVEN_SYNC_ENSAYO=true, haz un envío de prueba y muéstrame la respuesta completa
antes de dejar el envío automático encendido.
````
