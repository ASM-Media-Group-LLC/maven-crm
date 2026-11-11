# Conectar la plataforma de una agencia a Maven

Guía para cualquier plataforma de RR. HH. de una agencia (Backstage fue la primera) que quiera
mandar su equipo a Maven y leer de vuelta lo que pasa. Decisiones de Alvaro (11/11/2026): **la
próxima agencia que llegue conecta su plataforma sola, sin pasar por nosotros.**

- La plataforma **manda** quién está en el equipo, su rol, su equipo, a quién reporta y su
  horario, y **la lista de roles**. Maven crea los roles que falten con el mismo nombre, **sin
  permisos**: no ven nada hasta que el dueño marca qué ve cada uno en Maven. No se inventa nada.
- Quien **no tiene cuenta** en Maven queda **pendiente**: el dueño o un admin la aprueba con un
  clic (se le crea la cuenta) o la descarta. Una descartada sigue descartada en los envíos
  siguientes.
- Maven **devuelve**: el equipo como quedó, las horas y la asistencia de Cowork, la nota de Argos
  con su desglose, y **avisos por webhook** cuando alguien entra, sale (papelera) o cambia de rol,
  ya sea por la plataforma o desde la app de Maven.
- Todo nace en **ensayo**: hasta que el dueño de la agencia prenda «aplicar», Maven solo contesta
  qué haría y no toca nada.
- Cada agencia ve y cambia **solo lo suyo**: la key es de una agencia y la base cruza todo con
  ella. Funciona igual con una agencia que con varias.

Las piezas: `supabase/migrations/20261111120000_backstage_equipo.sql` (el interruptor, la
bitácora, aplicar) y `20261111190000_agencias_conectadas.sql` (roles, pendientes, horas, notas y
webhooks); el endpoint en `supabase/functions/public-api/` (`equipo-logica.ts` es lo puro); los
avisos los manda `supabase/functions/messenger-webhooks/equipo.ts`. Los bancos con dos agencias:
`supabase/tests/equipo_backstage.ts` y `supabase/tests/agencias_conectadas.ts`.

---

## 1. La llave

1. En Maven: **Ajustes → API keys → Nueva key**, con el permiso `equipo:write` (hoy se llama
   «⚠️ Backstage manda el equipo» en la pantalla). La tiene que crear un **admin o el dueño** de
   la agencia: la key actúa como quien la crea, es de SU agencia, y la base exige que esa persona
   siga siendo admin o dueña.
2. Recomendado: IPs fijas del servidor de la plataforma y un vencimiento.
3. La key (`mvk_live_…`) se muestra **una sola vez**. Se guarda como secreto en la plataforma.

Todas las rutas usan la misma key y el mismo permiso:

```
Base:          https://lsagslbkliprespbyhts.supabase.co/functions/v1/public-api
Autorización:  Authorization: Bearer mvk_live_...     (o X-API-Key: mvk_live_...)
Idioma:        Accept-Language: en                     (opcional: los mensajes de error en inglés)
Cupo:          60 pedidos por minuto y 1000 por hora por key (429 + Retry-After)
```

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/equipo/sync` | Manda el equipo completo (y, si vienen, los roles). |
| `GET` | `/equipo` | El equipo como quedó en Maven. |
| `GET` | `/equipo/horas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | Horas y asistencia de Cowork, por persona y día. |
| `GET` | `/equipo/notas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | La nota de Argos (0–100) con su desglose, por persona y día. |

## 2. Mandar el equipo — `POST /equipo/sync`

Cuerpo (JSON, hasta **64 KB**; de 1 a 1000 personas; hasta 50 roles):

```json
{
  "ensayo": true,
  "roles": ["Chatter", "Closer", { "nombre": "Team Leader" }],
  "personas": [
    {
      "correo": "ana@agencia.com",
      "nombre": "Ana Pérez",
      "rol": "Closer",
      "equipo": "Ventas A",
      "reporta_a": "beto@agencia.com",
      "nivel": "agente",
      "activo": true,
      "hora_entrada": "08:00",
      "hora_salida": "16:00"
    },
    { "correo": "carla@agencia.com", "activo": false }
  ]
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `personas` | sí | La lista **completa** del equipo. |
| `roles` | no | La lista de roles de la plataforma (nombres, u objetos `{ "nombre" }`). Se procesa **primero**: las personas con un rol nuevo se resuelven en el mismo envío. |
| `ensayo` | no (`false`) | `true` = no aplicar nada aunque el interruptor de Maven esté prendido. |
| `correo` | sí | Correo de trabajo: así se encuentra a la persona, solo dentro de la agencia de la key. |
| `nombre` | no | Para el reporte y para el pendiente. Maven no cambia nombres por aquí. |
| `rol` | no | Nombre del rol. Si no existe en Maven y no vino en `roles`, sale en `roles_desconocidos`. |
| `equipo` | no | Texto libre, hasta 80 caracteres. `null` lo vacía. |
| `reporta_a` | no | **Correo** del jefe (tiene que estar en Maven y activo). `null` lo vacía. |
| `nivel` | no | `agente`, `supervisor` o `manager` (admin y dueño, solo a mano en Maven). |
| `activo` | no (`true`) | `false` = a la papelera (30 días, como «Eliminar»). |
| `hora_entrada`, `hora_salida` | no | `HH:MM` de 24 h. `null` vacía el horario propio. |

Un campo que **no viene** no se toca; uno en `null` se vacía (equipo, jefe, horario).

### Las reglas

- **Admins y dueños no se tocan nunca** (salen en `protegidos`), ni la persona de la key.
- **Nadie sube a admin o dueño** por aquí, ni con `rol` ni con `nivel`.
- **Faltar no es irse**: quien está en Maven y no vino sale en `no_vienen_en_backstage`. Para
  sacar a alguien, mándalo con `activo: false`.
- **Freno de bajas**: más bajas que el tope en un envío (5 al empezar) y no se aplica ninguna.
- Un correo repetido en la lista no toca a nadie con ese correo.

### Los roles

- Maven crea en **la agencia de la key** los roles que falten, con el mismo nombre, activos y
  **sin permisos**. El dueño los ve en Maven como «roles sin configurar» hasta que les marca qué
  ven (`equipo_roles_sin_permisos()`).
- «Closer» y «closer» son el mismo rol (sin mayúsculas ni acentos). Lo que resuelve el mapa de la
  agencia (`integracion_equipo.mapa_roles`) cuenta como que ya está.
- **Nunca un rol de admin**: `admin`, `administrador`, `dueño`, `owner`, `propietario`… ni
  ninguno que Maven trate como admin en esa agencia → `rol_de_admin`.
- Más de 60 caracteres → `nombre_muy_largo`; vacío o que no es texto → `nombre_invalido`; un rol
  que existe pero está apagado → `rol_inactivo` (prenderlo lo decide una persona en Maven).
- En **ensayo** no se crea nada: `creados` dice cuáles se crearían. Las personas con esos roles
  salen, en ensayo, en `roles_desconocidos`; al aplicar se resuelven en el mismo envío.

### Los pendientes

- Fuera de ensayo, cada persona activa que **no tiene cuenta** en la agencia queda pendiente
  (`integracion_equipo_pendientes`), con su nombre, rol, nivel, equipo y el correo del jefe. Cada
  envío que la vuelve a traer suma una vez y refresca esos datos.
- El dueño o un admin la **aprueba** desde Maven (se le crea la cuenta en esa agencia, y se le
  ponen el equipo y el jefe que mandó la plataforma) o la **descarta**. Una descartada no vuelve a
  pendiente aunque siga llegando.
- Maven **nunca crea una cuenta sola**: siempre la aprueba una persona.

### La respuesta (200)

```json
{
  "object": "equipo_sync",
  "ensayo": false,
  "aplicar_activado": true,
  "sync_id": "6f1c…",
  "recibidas": 2,
  "cambios": [
    { "user_id": "a1…", "correo": "ana@agencia.com", "nombre": "Ana", "campo": "rol",
      "antes": "Chatter", "despues": "Closer", "aplicado": true, "se_aplicaria": true }
  ],
  "pendientes_de_crear": [
    { "correo": "nueva@agencia.com", "nombre": "Nueva", "rol": "Closer", "nivel": "agente",
      "equipo": "Ventas A", "reporta_a": "beto@agencia.com" }
  ],
  "roles_desconocidos": [],
  "protegidos": [{ "user_id": "d4…", "correo": "dueno@agencia.com", "nombre": "Dueño", "motivo": "admin_o_dueno" }],
  "no_vienen_en_backstage": [],
  "en_papelera": [],
  "rechazados": [],
  "freno_de_bajas": null,
  "roles": {
    "ensayo": false,
    "creados": ["Team Leader"],
    "ya_estaban": ["Chatter", "Closer"],
    "rechazados": [{ "nombre": "Admin", "motivo": "rol_de_admin" }]
  },
  "pendientes": { "ensayo": false, "registradas": 1, "actualizadas": 0, "ignoradas": [] }
}
```

- `roles` es `null` si el envío no trajo `roles`; `pendientes` es `null` en ensayo o si no hubo
  nadie sin cuenta (en ensayo, `pendientes_de_crear` igual dice quiénes quedarían pendientes).
- `campo` de un cambio: `rol`, `nivel`, `equipo`, `reporta_a`, `hora_entrada`, `hora_salida` o
  `papelera`. `aplicado`: se hizo en este envío. `se_aplicaria`: la base lo validó.
- `motivo` de un rechazo: `no_es_un_objeto`, `campo_desconocido`, `correo_invalido`,
  `correo_repetido`, `tipo_invalido`, `texto_muy_largo`, `nivel_invalido`, `nivel_de_admin`,
  `rol_de_admin`, `hora_invalida`, `jefe_no_esta_en_maven`, `jefe_es_la_misma_persona`,
  `jefe_en_papelera`, `freno_de_bajas`, o uno de la base (`protegido`, `en_papelera`,
  `no_es_de_la_agencia`, `rol_desconocido`, `error_de_base`…).
- `pendientes.ignoradas[].motivo`: `correo_invalido` o `ya_tiene_cuenta`.

## 3. Leer de vuelta

### `GET /equipo`

```json
{
  "agencia": "30869615-…",
  "aplicar": true,
  "roles": [
    { "nombre": "Closer", "es_admin": false, "origen": "plataforma", "con_permisos": false },
    { "nombre": "admin", "es_admin": true, "origen": null, "con_permisos": true }
  ],
  "personas": [
    { "correo": "ana@agencia.com", "nombre": "Ana Pérez", "rol": "Closer", "nivel": "agente",
      "equipo": "Ventas A", "reporta_a": "beto@agencia.com", "hora_entrada": "08:00:00",
      "hora_salida": "16:00:00", "activo": true }
  ]
}
```

- `origen`: `null` = el rol se hizo en Maven; `"plataforma"` = lo creó la plataforma.
- `con_permisos`: si el rol ya ve algo en Maven.
- `activo`: `false` = está en la papelera. `reporta_a` va por correo.
- No acepta parámetros (uno de más es un `400`).

### `GET /equipo/horas` y `GET /equipo/notas`

- `desde` y `hasta` como `AAAA-MM-DD`, días de Bogotá. Sin ninguno: los últimos 7 días hasta hoy;
  con uno solo, el otro se completa a 7 días. Hasta **93 días**. Otro parámetro, una fecha mal o
  un rango de más → `400 invalid_range`.
- Solo la gente de la agencia de la key (sin cuentas externas, como las de creadoras).

Horas (van todas las personas activas, con `dias: []` si no tuvieron nada, y las de la papelera
que tuvieron algo en el rango; un día que no aparece es un día sin conexión a Cowork):

```json
{
  "desde": "2026-11-04",
  "hasta": "2026-11-10",
  "personas": [
    { "correo": "ana@agencia.com", "nombre": "Ana Pérez", "dias": [
      { "fecha": "2026-11-10", "minutos_trabajados": 240, "minutos_en_meet": 0, "minutos_pausa": 30,
        "minutos_en_sala": 270, "sesiones": 1, "primera_entrada": "2026-11-10T18:00:00+00:00",
        "ultima_salida": "2026-11-10T22:30:00+00:00", "llego_tarde": true, "minutos_tarde": 15,
        "hora_asignada": "12:45:00", "turno": "Tarde" }
    ] }
  ]
}
```

- `minutos_trabajados` es lo que se paga (activo, meet y caídas cortas de conexión), igual que
  `/cowork/time`. La tardanza sale del registro de tardanzas de la agencia.

Notas (van las personas con al menos un día con datos):

```json
{
  "desde": "2026-11-10",
  "hasta": "2026-11-10",
  "personas": [
    { "correo": "ana@agencia.com", "nombre": "Ana Pérez", "dias": [
      { "fecha": "2026-11-10", "nota": 56.1,
        "desglose": { "pantalla": 25.3, "camara": 17.5, "foco": 13.3 },
        "maximos": { "pantalla": 45, "camara": 35, "foco": 20 },
        "crudo": { "segundos_en_pantalla": 16200, "segundos_conectado": 16200, "capturas_camara": 2,
                   "capturas_con_cara": 1, "capturas_pantalla": 3, "capturas_distraido": 1 } }
    ] }
  ]
}
```

- La fórmula es la de `/argos/notas`: pantalla (sobre 8 h) + cámara con la cara + foco (las
  capturas perdonadas no cuentan).

## 4. Avisos por webhook

Maven avisa a la plataforma cuando, en su agencia:

| Evento | Cuándo | `data` |
|---|---|---|
| `equipo.persona_entro` | Alguien entra a la agencia (alta) o vuelve de la papelera. | `correo`, `nombre`, `rol`, `nivel`, `motivo` (`alta` o `restaurada`), `via` |
| `equipo.persona_salio` | Alguien va a la papelera o sale de la agencia. | `correo`, `nombre`, `rol`, `nivel`, `motivo` (`papelera` o `fuera_de_la_agencia`), `via` |
| `equipo.rol_cambio` | Le cambian el rol. | `correo`, `nombre`, `rol_anterior`, `rol`, `via` |

- `via`: `"api"` si el cambio lo hizo la plataforma (con su key), `"maven"` si se hizo en la app.
- Cada aviso sale **20 s después** de pasar, y en esos 20 s se juntan los de la misma persona: un
  alta desde la app llega como UN `persona_entro` con su rol final, y un cambio que se deshace en
  ese tiempo no llega.
- Llegan **en orden** por suscripción: uno que no se pudo entregar frena a los de atrás hasta
  entregarse.

### Registrar la URL (en Maven)

El dueño o un admin, desde Ajustes → API keys, sobre la key de la plataforma (con `equipo:write`):
URL `https://` (puerto 443, un nombre de dominio, nada de red interna ni de Maven) y los eventos que
quiere. Maven muestra el **secreto de firma una sola vez** (`whsec_…`); se guarda en la plataforma.
Hay un botón «Enviar prueba» (`webhook.test`) y se puede pausar, reanudar o borrar.

### El pedido que manda Maven

```
POST <la URL registrada>
Content-Type: application/json
User-Agent: Maven-Webhooks/1
webhook-id: <id del aviso, el mismo en cada reintento>
webhook-timestamp: <segundos desde 1970>
webhook-signature: v1,<base64 de HMAC-SHA256>
```

```json
{
  "id": "0b5e…",
  "type": "equipo.rol_cambio",
  "api_version": "v1",
  "created_at": "2026-11-11T15:00:00.123Z",
  "agency_id": "30869615-…",
  "data": { "correo": "ana@agencia.com", "nombre": "Ana Pérez", "rol_anterior": "Chatter",
            "rol": "Closer", "via": "maven" }
}
```

- La firma es **Standard Webhooks** (la misma de los webhooks del Messenger): se verifica con la
  librería oficial `standardwebhooks` y el secreto `whsec_…`, sin escribir criptografía. Rechaza
  un `webhook-timestamp` de más de 5 minutos.
- Contesta **2xx** rápido (en menos de 10 s) y procesa después. Usa `webhook-id` para no procesar
  dos veces el mismo aviso: un reintento trae el mismo id y los mismos bytes.
- Reintentos ante cualquier otra respuesta: 30 s, 2 min, 10 min, 30 min, 1 h, 2 h, 4 h, 8 h… (se
  respeta `Retry-After` hasta 1 h). **72 h fallando** la suscripción se detiene; un **410** la
  detiene en el acto. Una redirección (3xx) no se sigue: cuenta como fallo.
- Revocar la key, sacarle `equipo:write`, o que su persona deje de estar activa detiene la
  suscripción. Volver es «Reanudar» en Maven (lo de mientras estuvo parada no se avisa).

## 5. Ensayo → aplicar

1. La plataforma manda con `"ensayo": true` (y Maven, además, nace con su interruptor apagado).
   Revisa la respuesta: cambios, roles que se crearían, pendientes, rechazados.
2. Cuando el ensayo se ve bien, el **dueño de la agencia** prende «aplicar» en Maven
   (`integracion_equipo.aplicar = true`; la RLS solo se lo deja a él).
3. La plataforma pasa a `"ensayo": false`. Desde ahí se aplican los cambios, se crean los roles
   (sin permisos) y se anotan los pendientes.
4. El dueño configura qué ve cada rol nuevo y aprueba o descarta los pendientes.

Errores de todas las rutas: `400` (`invalid_json`, `unknown_field`, `invalid_field`,
`invalid_range`), `401` (key inválida, revocada o vencida), `403` (`forbidden`: sin `equipo:write`,
o quien creó la key ya no es admin ni dueño), `405`, `413` (más de 64 KB), `429` (cupo: respetar
`Retry-After`), `503` (problema de Maven: reintentar después de `Retry-After`; mandar el equipo es
la foto completa, así que repetirlo es seguro). Todos traen `{ "error", "message" }`.

---

## 6. Para la app de Maven (lo que usa el frontend)

Todo con la sesión de la persona (`supabase.rpc`), y solo para el dueño o un admin de la agencia
de la sesión; cada función lo verifica. Los errores traen el código al principio del mensaje
(`sin_permiso: …`).

| Qué | Cómo |
|---|---|
| Roles de la plataforma sin configurar | `equipo_roles_sin_permisos()` → `[{ nombre, creado_at }]` |
| Pendientes | `select` sobre `integracion_equipo_pendientes` (RLS: admins y dueños de la agencia) |
| Aprobar / descartar | `equipo_pendiente_resolver(_id, 'aprobar', _user_id)` (después de `create_user`) / `equipo_pendiente_resolver(_id, 'descartar')` → `{ id, estado, user_id, equipo, reporta_a }`. Errores: `pendiente_no_existe`, `sin_permiso`, `accion_invalida`, `ya_resuelta`, `falta_user_id`, `cuenta_no_coincide` |
| Webhooks de la agencia | `equipo_webhooks()` → `[{ id, api_key_id, url_host, eventos, status, disabled_reason, disabled_at, secret_last4, consecutive_failures, failing_since, last_attempt_at, last_success_at, last_status_code, last_error, created_by, created_at, pendientes }]` |
| Registrar | `equipo_webhook_crear(_api_key_id, _url, _eventos)` (`_eventos` null = los tres) → lo mismo más `secreto` (UNA vez). Mandar la URL como `new URL(x).href`. Errores: `llave_no_existe`, `llave_no_vigente`, `llave_sin_equipo`, `eventos_invalidos`, `url_invalida`, `ya_tiene_webhook` |
| Pausar / reanudar / borrar | `equipo_webhook_cambiar(_id, 'pausar' \| 'reanudar' \| 'borrar')` |
| Enviar prueba | `equipo_webhook_probar(_id)` → `{ entrega_id }` (sale en ≤ 30 s; una cada 12 s) |
| Entregas | `equipo_webhook_entregas(_id, _limite)` → las últimas (hasta 100), sin el cuerpo firmado |

## 7. Lo que el dueño maneja desde el editor SQL (hasta que haya pantalla)

```sql
-- Cómo está y lo último que llegó
select aplicar, max_bajas_por_sync, mapa_roles, ultima_sync, ultima_sync_at from public.integracion_equipo;
-- Prender / apagar
update public.integracion_equipo set aplicar = true;
-- Freno de bajas por envío
update public.integracion_equipo set max_bajas_por_sync = 10;
-- Nombres de rol de la plataforma que no coinciden con los de Maven
update public.integracion_equipo set mapa_roles = '{"Chat Agent": "Chatter"}';
-- La bitácora de envíos
select created_at, repeticiones, ensayo, recibidas, aplicados, rechazados_base
  from public.integracion_equipo_syncs order by created_at desc limit 20;
```

## 8. Lo que todavía no hace

- El equipo y el jefe se guardan, pero Maven todavía no los usa para la supervisión (Pulso, Argos):
  hoy el equipo se deduce del rol.
- No avisa cambios de nivel, de equipo ni de horario (solo entrar, salir y el rol).

---

## 9. PROMPT para quien programa la plataforma

Copia y pega esto tal cual en el asistente (o al equipo) que trabaja en el código de la plataforma:

````text
Necesito conectar nuestra plataforma de RR. HH. con Maven (el CRM de la agencia). Maven ya tiene
todo listo; tu trabajo es el lado de la plataforma. La plataforma es la fuente de verdad de las
personas, sus roles, su equipo, a quién reporta cada una y su horario.

LA LLAVE
  MAVEN_API_KEY (empieza con mvk_live_) es un secreto: léela de una variable de entorno o del
  gestor de secretos; nunca en el código, en logs ni en mensajes de error.
  Base: https://lsagslbkliprespbyhts.supabase.co/functions/v1/public-api
  Cabeceras: Authorization: Bearer <MAVEN_API_KEY>, Content-Type: application/json

1) MANDAR EL EQUIPO: POST /equipo/sync (JSON compacto, máximo 64 KB, máximo 1000 personas)
  {
    "ensayo": <bool>,
    "roles": ["<nombre de cada rol que usamos>", ...],        (hasta 50)
    "personas": [{ "correo", "nombre", "rol", "equipo", "reporta_a" (correo del jefe),
                   "nivel" ("agente"|"supervisor"|"manager"), "activo", "hora_entrada" ("HH:MM"),
                   "hora_salida" ("HH:MM") }]
  }
  - SIEMPRE la lista COMPLETA, también las personas que salieron (con "activo": false). Maven no
    saca a nadie por no venir en la lista.
  - Un campo que no conoces, NO lo mandes (null borra el valor en Maven).
  - Nunca nivel admin ni dueño, ni un rol de admin: Maven los rechaza.
  - Cada 15 minutos (MAVEN_SYNC_MINUTOS) y además 30 s después de cualquier cambio del equipo,
    juntando cambios seguidos. Nunca dos envíos a la vez.
  - MAVEN_SYNC_ENSAYO, por defecto "true", va en "ensayo". Pasarlo a "false" lo decide la
    agencia cuando el ensayo se vea bien, no tú.
  - Guarda cada respuesta (fecha, sync_id, ensayo, cambios, aplicados) y muestra como AVISOS para
    un administrador: pendientes_de_crear (no tienen cuenta en Maven: se aprueban allá),
    roles.rechazados, roles_desconocidos, rechazados, freno_de_bajas y no_vienen_en_backstage.
    protegidos (admins y dueños) es normal.

2) LEER DE VUELTA (con la misma key)
  - GET /equipo → el equipo como quedó (roles con su origen y si ya tienen permisos; personas
    con activo y el correo de su jefe).
  - GET /equipo/horas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → horas y asistencia por persona y día.
  - GET /equipo/notas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → nota de Argos (0-100) con desglose.
  - Hasta 93 días por pedido; sin fechas, los últimos 7 días.

3) RECIBIR AVISOS (webhook)
  - Haz un endpoint https público que reciba POST con eventos equipo.persona_entro,
    equipo.persona_salio y equipo.rol_cambio (y webhook.test).
  - Verifica la firma con la librería oficial standardwebhooks y el secreto whsec_ que te da
    Maven al registrar la URL (MAVEN_WEBHOOK_SECRET). Rechaza lo que no verifica.
  - Contesta 2xx en menos de 10 s y procesa después. Usa la cabecera webhook-id para no
    procesar dos veces el mismo aviso. Si devuelves 410, Maven deja de mandar.

ERRORES (todas las rutas): { "error": "<código>", "message": "<texto>" }
  - 400, 401, 403, 413: no reintentes igual; registra el message y avisa a un administrador.
  - 429 y 503: espera lo que diga Retry-After y reintenta el MISMO pedido, hasta 5 veces.
  - Error de red o tiempo agotado (30 s): reintenta igual que un 503.

PRUEBAS QUE QUIERO
  - El cuerpo lleva a TODAS las personas (también las inactivas) y los roles.
  - Un campo desconocido no se manda como null.
  - No hay dos envíos a la vez; los cambios seguidos se juntan.
  - 429/503 reintentan respetando Retry-After; 400/401/403/413 no.
  - El webhook rechaza una firma mala y no procesa dos veces el mismo webhook-id.
  - La key y el secreto nunca aparecen en logs.

Empieza con MAVEN_SYNC_ENSAYO=true, haz un envío de prueba y muéstrame la respuesta completa
antes de dejar el envío automático encendido.
````
