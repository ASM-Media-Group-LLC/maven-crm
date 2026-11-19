# Migraciones del edificio `maven-agencias`

> ⚠️ **Solo para el edificio `maven-agencias` (Supabase `ezeigddgkaemxpshghmu`).**
> **Nunca** en Kash (`lsagslbkliprespbyhts`): Kash no se toca bajo ninguna situación.
> Por eso viven aquí y no en `supabase/migrations/` (esa carpeta es la de Kash).
> La primera migración tiene un candado: si encuentra el tenant de Kash, se niega a correr.

Se aplican a mano, en orden de nombre, con el MCP de Supabase (`apply_migration`
con `project_id = ezeigddgkaemxpshghmu`) y solo con el OK de Alvaro. Banco:
`infra/edificio/tests/arbol.ts` (corre en el guard de cada PR):

```sh
deno run -A --node-modules-dir=none --no-lock infra/edificio/tests/arbol.ts
```

## Vagón 3 · el árbol

| Archivo | Qué trae |
|---|---|
| `20261119210000_arbol.sql` | Clientes, admins del cliente, agencia en foco, ayudantes, reglas de sillas, políticas ampliadas, niveles de la plataforma |
| `20261119211000_arbol_funciones.sql` | Pedidos de sillas, historial, avisos, enlaces, saldo de Argos, socios, briefs, Kash para mirar y las funciones de los paneles |

### El árbol

```
Plataforma (plataforma_admins: dueno = rusin24@gmail.com · admin = Grace, sin precios ni cobros)
└── Cliente (organizaciones: marca_blanca | normal; preparacion → activa → pausada/archivada)
    ├── Admins del cliente (organizacion_admins; cuentas a nivel cliente, nunca miembros de una agencia)
    └── Agencias (tenants de siempre, con organizacion_id + sillas)
        └── Personas (tenant_members; UNA cuenta por agencia, como hasta hoy)
```

Agencia suelta = tenant sin `organizacion_id` (como la «Agencia de prueba»): sin tope de sillas.

### Cómo el admin del cliente ve sus agencias «como dueño»

Sin reescribir las ~700 políticas:

1. **Agencia en foco.** `entrar_a_agencia(t)` guarda en `agencia_en_foco` qué agencia
   está mirando. `current_tenant_id()` devuelve primero la membresía (igual que antes) y,
   si no es miembro de ninguna, esa agencia — mientras siga siendo admin de su cliente
   (o de la plataforma). Así las ~100 políticas y ~50 funciones que filtran por
   `current_tenant_id()` le abren esa agencia y solo esa. `salir_de_agencia()` lo saca.
2. **«Dueño» con nombre de agencia.** `es_dueno_de_agencia(t)` (tenant_owners, admin del
   cliente de esa agencia, o plataforma) y `soy_dueno_aqui()` (= la agencia de la sesión).
   **`es_dueno(uid)` no se toca**: no sabe de agencias y 24 políticas lo usan sin filtro
   de agencia; abrirlo a los admins del cliente cruzaría clientes.
3. **Ampliadas sin cambiar lo que respondían**: `es_dueno_de_la_agencia_de` (Documentos),
   `equipo_agencia_que_administro` (agencias conectadas, pedidos de sillas) y
   `puede_vigilar_a` (cámaras y pantallas de Argos; se reescribe desde su definición viva).
4. **Políticas con agencia que piden dueño de quien llama** (`es_dueno`/`es_admin_o_dueno`
   de `auth.uid()` + `current_tenant_id()`) suman `OR soy_dueno_aqui()`, reescritas desde
   `pg_policies` (hoy en el edificio: `argos_alertas_sel_supervisor`,
   `argos_contexto_sel_supervisor`, `argos_contexto_ins_admin`, `argos_contexto_upd_admin`).
5. `tenants_self_visible` pasa a `id in (select tenants_visibles())`.
6. Lecturas que cruzan agencias (el tablero, la gente de una agencia) van por funciones
   `security definer` que revisan `puedo_administrar_organizacion` / `es_dueno_de_agencia`.

Todo lo reescrito se guarda en `arbol_respaldo` y la vuelta atrás (`--|`) lo restaura.

### Sillas (se BLOQUEA al pasar)

- Paquete del cliente = `plan.personas` (columna `organizaciones.personas`).
- Suma de `tenants.sillas` de agencias no archivadas ≤ paquete (`tenants_arbol`; error `paquete_lleno`).
- Una agencia no baja de las personas que ya tiene (`sillas_en_uso`).
- Personas de la agencia ≤ sus sillas (`tenant_members_sillas` en cada alta; `agencia_llena`).
  No ocupan silla las creadoras ni las cuentas en la papelera. Agencia archivada: no entra nadie.
- El paquete no baja de lo repartido (`paquete_menor`).
- Pedidos: agencia → cliente (`pedir_sillas(n)`; decide el admin del cliente, salen del
  paquete) y cliente → Maven (`pedir_sillas(n, nota, org)`; decide la plataforma, crece el paquete).

### Precios y cobros: solo el dueño de la plataforma

- `plataforma_admins.nivel`: `dueno` (rusin24) o `admin` (Grace).
- `organizaciones.plan` y `.cobro` no se leen por la API (permisos por columna):
  `plan_de_organizacion(org)` los da completos al dueño de la plataforma y al admin de
  ESE cliente; al equipo de Maven sin `precio_usd`, `setup_usd`, `argos_usd_mes` ni cobro.
  Igual en `resumen_organizacion` y `organizaciones_del_dueno`.
- Cambiar precio (todo el plan menos `personas`) o cobro, y poner créditos de Argos: solo dueño.
- ⚠️ La pantalla tiene que pedir columnas explícitas de `organizaciones` (un `select=*` da 403).

### Funciones (RPC)

Plataforma: `crear_organizacion`, `agregar_admin_organizacion`, `quitar_admin_organizacion`,
`activar_organizacion` (pide líder y paquete), `organizaciones_del_dueno` («Tus organizaciones»
+ Kash para mirar).
Admin del cliente: `crear_agencia` (cliente `normal` = una sola), `dar_sillas_a_agencia`,
`cambiar_dueno_agencia`, `archivar_agencia`, `reactivar_agencia`, `pausar_agencia`,
`entrar_a_agencia`, `salir_de_agencia`, `mandar_aviso`, `pedir_sillas`, `decidir_pedido`,
`resumen_organizacion` (tablero de sillas), `lideres_de_organizacion` («Líder de {Marca}»),
`plan_de_organizacion`, `personas_de_agencia`.
Cualquiera: `marca_de_mi_organizacion` («X · powered by Maven»).
Solo servidor: `crear_enlace_de_acceso` / `usar_enlace_de_acceso` (7 días, un uso, se guarda
el hash; nada sale con el cliente en preparación), `argos_puede_juzgar`, `argos_cobrar`,
`argos_acreditar_planes` (cron del día 1). `argos_acreditar` además para el dueño desde la app.

### Kash en el panel del dueño (solo mirar)

`organizaciones_externas` (nombre, logo, app_url, resumen, actualizado_at) la refresca una
edge/cron con la **función de solo lectura de Kash** (otro carril). Aquí no hay nada que
escriba en Kash. Solo la ve la plataforma.

### Alta del dueño y de Grace

La migración pone a `rusin24@gmail.com` como `dueno` si su cuenta ya existe en el Auth del
edificio (si no, no hace nada: se vuelve a correr esa línea después de crearla). Grace, con su
cuenta del edificio:

```sql
insert into public.plataforma_admins (user_id, nivel)
select id, 'admin' from auth.users where lower(email) = '<correo de Grace en el edificio>'
on conflict (user_id) do update set nivel = 'admin';
```

### Lo que falta adaptar (políticas que el admin del cliente todavía NO pasa)

Medido en el edificio el 19/11 (710 políticas; 103 filtran por `current_tenant_id()` y ya le sirven en foco):

1. **`es_dueno` sin filtro de agencia (24 políticas)** — hoy además cruzan agencias entre
   dueños: `argos_clips`, `argos_situaciones`, `argos_voz`, `costos_*` (5), `drive_acceso_extra`,
   `drive_aportes`, `drive_carpeta_creadora`, `drive_upload_links`, `equipo_alertas`,
   `monitor_capturas` (upd), `monitor_clips`, `nas_espacio`, `nas_espacio_alertas`,
   `salud_incidentes`, `tardanzas_registro`, `storage.objects` (`argos_clips_obj_sel`,
   `monitor_capturas_read_supervisor`, que ya pasan por `puede_vigilar_carpeta`). Arreglo:
   columna `tenant_id` donde falte + `soy_dueno_aqui() and tenant_id = current_tenant_id()`,
   o `es_dueno_de_la_agencia_de(user_id)` donde la fila es de una persona. Las de costos/NAS/
   salud son de la plataforma: pasarlas a `es_admin_de_plataforma()`.
2. **`es_admin_o_dueno` / `es_rh` / `user_roles` sin agencia**: `es_admin_o_dueno(uid)` es
   true para el admin de CUALQUIER agencia, así que `monitor_capturas_sel_supervisor` y
   `puede_vigilar_a` cruzan agencias entre admins (hueco previo al árbol; el banco lo deja
   anotado como línea base). Arreglo: versión con agencia (`… and ur.tenant_id = current_tenant_id()`).
3. **Roles sin filtro de agencia (196 políticas)** que piden `has_role`/`is_in_role_group`/
   `has_permission`/`has_*_scope`: Chatters, Closers, Creadoras, Promolog, RR. HH., nómina,
   Hubstaff, WhatsApp, tickets, `cowork_tiempo_segmentos`, `cowork_breaks`, `cowork_llamados`,
   `cowork_avisos`, `monitor_config`, `monitor_eventos`, `notifications`, etc. El admin del
   cliente no tiene filas en `user_roles`, así que hoy no pasa (no ve de más: ve de menos).
   Darle «admin» ahí sin antes poner `tenant_id` en esas tablas cruzaría agencias. Para lo que
   pide el producto (Cowork en vivo, Argos, cámaras, llamadas) lo mínimo es: `cowork_tiempo_segmentos`,
   `cowork_breaks`, `cowork_llamados`, `monitor_capturas`, `monitor_eventos`, `monitor_clips`,
   `argos_situaciones`, `argos_clips` y las grabaciones de llamadas.
4. Edge functions que deciden «admin» por `user_roles` (`esAdmin`, `admin-user-actions`,
   `cowork-session`, `livekit-token`…): sumar `es_dueno_de_agencia(current_tenant_id())`.
5. `admin-user-actions` tiene que mostrar los errores `agencia_llena` / `agencia_archivada` /
   `cuenta_de_cliente` en vez de un error genérico.

## Vagón 7 · cobros con Stripe, bloqueo por pago y la puerta

| Archivo | Qué trae |
|---|---|
| `20261120090000_cobros.sql` | Estado `bloqueada`, `precios_plataforma`, `stripe_eventos` (cada evento una vez), tope de la puerta, funciones del cobro y del bloqueo, créditos de Argos desde Stripe y los relojes |

Va DESPUÉS de las dos del árbol. Se aplica igual (MCP `apply_migration` con
`project_id = ezeigddgkaemxpshghmu`, con el OK de Alvaro). El banco del árbol la carga encima y la prueba.

- **El cobro vive en `organizaciones.cobro`** (solo lo leen el dueño y el admin de ese cliente):
  `estado_pago` = `pendiente_checkout` (se registró y no puso tarjeta: no entra) · `esperando_tarjeta`
  (alta del dueño con link: entra) · `prueba` · `al_dia` · `pago_fallido` · `cancelada` · `por_fuera`;
  más `stripe_customer_id`, `stripe_subscription_id`, `gracia_hasta`, `prueba_hasta` y las opciones del
  dueño (`dias_gratis`, `sin_tarjeta`, `sin_setup`, `precio_a_medida`).
- **Pago fallido → 7 días de gracia → `bloqueada`** (nadie entra; nada se borra). La regla está dos
  veces, igual: `cobros_debe_bloquear()` (base) y `debeBloquear()` (edge). El reloj `cobros-bloquear`
  (cada hora) aplica; `cobros_mi_acceso()` ya responde «bloqueada» aunque el reloj no haya pasado.
  Al pagar (invoice.paid) vuelve a `activa`. Un cliente pausado o archivado por Maven no lo toca Stripe.
- `cobros_mi_acceso()`: lo que pregunta la app al entrar (pantalla «Tu empresa está bloqueada por pago
  pendiente» con «Pagar ahora» para su admin). Motivos: `pago`, `falta_tarjeta`, `pausada`,
  `agencia_pausada`, `archivada`. La plataforma nunca queda bloqueada.
- Argos: la factura pagada acredita el plan del mes (`argos_acreditar_plan_de`, una vez por mes; se
  acumula); la recarga (25 → 50) entra por `argos_acreditar` y no se repite (`argos_mov_recarga_ref_idx`).
  Quien paga por fuera recibe su crédito el día 1 (`argos_acreditar_planes_sin_stripe`).
- `directorio_es_del_edificio(correo)` + `puerta_contar`: la puerta de app.maven-ai.me (solo sí/no, con tope).
- `organizaciones_externas.fuente = 'kash'`: la fila que refresca `refrescar-externas` con la función
  de solo lectura de Kash (`kash-resumen`).

## La puerta prendida · quién soy (19/11)

| Archivo | Qué trae |
|---|---|
| `20261120120000_quien_soy.sql` | `quien_soy_en_la_plataforma()` (dueño / admin de plataforma / admin de un cliente / nada) y `equipo_de_maven()` (lista del Equipo de Maven, solo la plataforma); vuelve a correr el alta de rusin24 como dueño |

Va después de las tres anteriores. Desde ahora se aplican con el workflow
**«Edificio · árbol, cobros y quién soy»** (`.github/workflows/edificio-arbol.yml`):
ensayo en un Postgres vacío (molde + al día + estas, una por una) y, con «aplicar»,
solo las que el edificio todavía no tiene, cada una en su transacción y anotada en
`supabase_migrations.schema_migrations`. El candado (`guarda-kash.sh solo_edificio`)
corre antes de cada paso.
