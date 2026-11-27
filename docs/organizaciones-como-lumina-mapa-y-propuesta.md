# Organizaciones en Maven, igual que en Lumina: mapa y propuesta (24/11/2026)

## ✅ Decisiones de Alvaro (24/11, tren de preguntas). Mandan sobre lo de abajo

1. **Dueño de toda la plataforma Maven: rusin24@gmail.com**, igual que en Lumina. Las cuentas actuales de Kash siguen siendo dueñas solo de Kash.
2. **Kash queda aparte y sin tocar.** Los clientes nuevos van en el edificio. Kash aparece en el panel del dueño como tarjeta solo para mirar.
3. **Debajo del admin no hay roles fijos.** El admin crea todas las posiciones (RRHH, supervisores, chatters…), con el nombre y los permisos que quiera.
   - Eso ya lo hace el sistema de Posiciones de Maven, con sus alcances: todos / subordinados / solo él.
   - Los únicos niveles fijos son:
     - Dueño de la plataforma y Equipo de Maven.
     - Admin del cliente.
     - Dueño y admin de la agencia.
   - La gente que trabaja es "Agente" más su posición.
   - "A quién ve un supervisor" lo decide el alcance de su posición, no un rol aparte.
4. **Las posiciones las crea el admin del cliente, una vez, para todas sus agencias.** Cada agencia puede agregar las suyas.
5. **Sillas:** ocupan silla todos menos el dueño de la plataforma y las cuentas de prueba. **Si el paquete se llena, se bloquea.**
6. **"Activo" en un día** = cualquiera de estas cosas:
   - marcó entrada del turno;
   - estuvo en Cowork;
   - tenía la app abierta (señal de vida);
   - inició sesión.
7. **Dashboard del dueño = vista por ORGANIZACIÓN, simple.** Alvaro quiere ver cómo van los clientes que se están poniendo: **quién lo está usando y quién no**. No hay que concentrarse en el detalle por persona; dentro de cada cliente, Maven ya deja hacer lo que quieran.
   - Por cada cliente: personas, activas ahora / hoy / 7 días / 30 días, cuántos no entran, última vez que se usó, nota de Argos del día, horas trabajadas, tardanzas y saldo de Argos.
   - "Ver quiénes" queda solo como detalle opcional.
8. **Reparto del trabajo:**
   - **Claude:** árbol de clientes, panel del admin, posiciones por cliente y Dashboard.
   - **Codex:** cobros (Stripe) y créditos de Argos.
9. **Arranque:** paso 1, el edificio con datos reales para el dueño. Nada toca Kash, y nada pasa a producción sin el OK de Alvaro.

### Onboarding de clientes (24/11). Lo urgente: dar accesos, montaje, prueba gratis y cobrar

Regla madre: **"Yo soy el dueño y señor de todo esto."** Todo es opcional y flexible **por cliente**. Lo decide el dueño y lo puede cambiar en cualquier momento. Los valores por defecto son solo un punto de partida.

- **Alta de clientes:** la hace el dueño desde su panel con "Nuevo cliente". El cliente nace en preparación, y nadie recibe correos hasta "Activar". Sin registro público por ahora.
- **En la ficha de cada cliente** (sale en el asistente y se edita después):

| Campo | Qué es | Por defecto |
|---|---|---|
| Días de montaje | Tiempo para dejar la cuenta lista. No corre la prueba ni el cobro | 0 |
| Días de prueba gratis | 0, 7, 14, 30… lo que el dueño ponga | 14 |
| Setup | Monto (0 si no aplica) y cuándo se cobra: antes de empezar, o con la primera factura | Sin setup |
| Forma de cobro | Suscripción con tarjeta (Stripe cobra solo cada mes) o factura mensual con link para pagar (tarjeta o transferencia) | — |
| Plan y sillas | Equipo / Empresa / a la medida, con precio y sillas editables por cliente | — |
| Qué pasa si no paga | Días de gracia (7 por defecto), y luego pausa automática o solo aviso al dueño | 7 días de gracia |

- **Botones del dueño, siempre a mano:**
  - Activar, Pausar y Reactivar.
  - Alargar la prueba.
  - Regalar o quitar sillas.
  - Cambiar plan o precio.
  - Marcar como pagado a mano.
  - Pasar a demo / marcar como cliente.
  - Ver como.
- **El orden natural es montaje → prueba → cobro.** Cada paso puede ser 0, y el dueño puede saltar cualquiera.
- **Grace (Equipo de Maven):**
  - Puede crear clientes, invitarlos, activarlos, alargar la prueba y mover sillas.
  - **No** ve ni cambia precios, setup ni cobros. Eso es solo del dueño.
- **Cobra TECH VISUALS LLC** (la cuenta de Stripe de Maven), en USD.
- **Cliente pausado:** solo entran sus admins, y ven el aviso con el botón de pagar. Los agentes no entran. No se borra nada.
- **Avisos al dueño:** por correo y en "Necesita de ti" del panel. Sin WhatsApp por ahora.
  - Se avisa cuando: empezó la prueba, la prueba se vence, pagó, no pagó, o llegó al tope de sillas.
- **Primera entrada del admin del cliente:** una lista de arranque que se va tachando sola.
  - Subir logo.
  - Crear posiciones.
  - Crear agencias.
  - Invitar a su gente.
  - Descargar la app.
- **El cliente ve todo en "Mi empresa → Plan":**
  - su plan y los días de prueba que le quedan;
  - la próxima factura y su historial de pagos;
  - el botón de pagar o cambiar tarjeta.
  - Lo ven y pagan **todos los admins del cliente**. Los dueños de agencia no.
- **Paga solo el cliente:** una cuenta de cobro por cliente. Sus agencias no pagan a Maven.
- **Para Codex (cobros):** estos campos son la fuente de verdad del cobro. Stripe (suscripción o checkout de factura) lee de aquí. Nada de precios fijos en el código.

Continúa la especificación del 19/11 (`docs/maven-como-lumina-spec.md`), que sigue vigente. Este documento agrega:
1. Un mapa preciso de cómo está hecho Lumina por dentro, sacado de su código y su base.
2. Dónde está Maven hoy.
3. Lo que faltaba en el plan del 19/11, sobre todo el **Dashboard de toda la plataforma**.
4. Las preguntas pendientes.

---

## 1. Mapa de Lumina

El código vivo de Lumina está en `~/lumina/.claude/worktrees/frosty-pasteur-e2156c` (`app/` y `supabase/functions/`). Su base es `tkrzxyunpelesqenidak`.
Ojo: el repositorio casi no tiene el esquema de la base. Las tablas se leyeron de la base en vivo, solo lectura.

### 1.1 Árbol

```
Dueño de la plataforma (owner)  +  Equipo de Lumina (admins sin empresa)
 └── Organización = el CLIENTE      tabla organizations
      └── Empresas / agencias        tabla companies (kind agency | catalog | creators)
           └── Personas              profiles + user_roles (+ user_companies si están en dos)
```

**Tabla `organizations`**

| Columna | Qué guarda |
|---|---|
| `status` | `cliente` o `prospecto` |
| `hidden` | `true` si es demo |
| `prep` + `activated_at` | En preparación / activada |
| `client_type` | `clientes` = tipo A, con subcuentas; `directo` = tipo B |
| `plan` (jsonb) | `{key, name, seats, price_usd, regular_usd}`. Ejemplo de KA$H: Team, 50 asientos, $299 |
| `billing` | Datos de cobro |
| `seat_alert` | Cuándo se avisó que pasó el paquete |
| `agency_free_seats` | Sillas gratis por agencia (10 por defecto) |
| `catalog_company_id` | Si está puesto, el cliente tiene subcuentas |
| `intake.sup_all` | Excepción del supervisor (ver 1.2) |
| `branding` | Nombre de la academia, color, logo |

**Tabla `companies`**: `org_id`, `owner_user_id` (el "rey" de la agencia), `seats_extra` (sillas que le dio el cliente), `paused`, `archived_at`, y datos de contacto del dueño.

Hay un **interruptor de subcuentas** por cliente:
- Al prenderlo se crea "Catálogo <cliente>".
- Solo se apaga si el cliente tiene una subcuenta o menos.
- Las subcuentas no pueden abrir más subcuentas.

### 1.2 Roles

| Rol | Cómo se reconoce | Qué ve y hace |
|---|---|---|
| **Owner** (rusin24@gmail.com) | `user_roles.role = owner` | Todo, incluidos precios y cobros |
| **Equipo de Lumina** (Grace) | `admin` sin empresa, sin organización y sin fila en `lumina_admin_orgs` | Toda la plataforma menos el dinero. Aprueba sillas y crea buzones |
| **Admin del cliente** | `admin` + fila en `lumina_admin_orgs` (un cliente puede tener varios) | Su organización: crea agencias, reparte sillas, invita. Ve el plan pero no el precio |
| **Dueño de agencia** | `companies.owner_user_id` | Su agencia: admins, correos, solicitudes, ajustes |
| **Admin de agencia** | `admin` con `company_id` | Supervisores y empleados de su agencia |
| **Supervisor** | `manager` | Solo la gente que tiene asignada (`profiles.supervisor_id`). Con `sup_all` ve toda la agencia |
| **Estudiante** | `chatter` | Su propio panel |

Cómo se aplican los permisos:
- **En la base**, con funciones SQL: `is_platform_staff()`, `lumina_my_admin_org_ids()`, `lumina_caller_companies()`, `lumina_visible_company_ids()` y `can_view_user`.
  - El dueño de la agencia ve a todos; el admin de agencia, a supervisores y estudiantes; el supervisor, solo a estudiantes.
- **Precios ocultos por columna**: el plan se lee con el RPC `lumina_org_plans()`.
- **Un disparador** impide que alguien que no sea el owner cambie `plan`, `billing`, `hidden`, `prep` o `client_type`.

**"Ver como"** (`components/VerComo.tsx`):
- Permite ver por rol, por empresa o por persona.
- Funciona **solo en el navegador** y en **solo lectura**: `lib/readOnly.ts` bloquea toda escritura. La seguridad real la ponen las reglas de la base.

### 1.3 Sillas (asientos)

- **Qué cuenta como silla:** toda persona con acceso. No cuentan los owners, las cuentas de prueba, los descartados ni las agencias pausadas.
  - Si alguien está en dos agencias, ocupa una silla en cada una.
  - Se calcula con el RPC `lumina_org_seat_stats(org)`.
- **Tope de cada agencia** = sillas gratis + `seats_extra`.
  - Agencia llena → error `agency_full`; no deja invitar más.
  - La suma de lo repartido no puede pasar del paquete (error `no_seats_left`).
- **Pedidos de sillas**: van de la agencia al cliente y del cliente a Lumina (tabla `lumina_seat_requests`).
- **Si el cliente pasa su paquete, Lumina no lo bloquea.**
  - Le avisa al owner (máximo una vez al día).
  - En la siguiente factura se cobra el paquete que sigue: Starter 20 → Team 50 → Pro → Elite → Enterprise.
- **Cobro**: factura mensual (`lumina_invoices`, del 1 de cada mes) y pago con Stripe Checkout por factura. No hay suscripción.

### 1.4 Vida de un cliente

1. **"Nuevo cliente"** (`components/NewClientWizard.tsx` → función `lumina-client` `client-create`) tiene 4 pasos:
   1. Tipo de cliente (A o B).
   2. Líder (nombre, correo, idioma).
   3. Paquete.
   4. Marca.
2. El cliente nace **en preparación**:
   - Se crean las cuentas, pero ningún correo sale hasta "Activar".
   - Lista de pendientes: líder asignado, marca, paquete, cursos, activado, el líder entró, primera factura.
3. **Invitaciones**: enlace "Crear mi contraseña" de un solo uso, válido 7 días, que se puede renovar. Cada correo enviado queda en un registro.
4. **"Mostrar a un cliente"** = modo presentación:
   - Esconde precios, Costos, API y Equipo.
   - Todo queda en solo lectura.
5. **Demos** = organizaciones ocultas. "Incluir demos" las suma al Dashboard.

### 1.5 Dashboard "Toda la plataforma" (`pages/Dashboard.tsx`)

**Fuente:** un solo RPC, `lumina_dashboard(desde, hasta, zona, org, empresa, incluir_demos)`.
El RPC se ajusta solo a quien lo pide:
- Para el owner y el equipo, muestra toda la plataforma.
- Para el admin de un cliente, su organización.
- Para el dueño de una agencia, su agencia.

**Qué es "activo":** cualquier señal de alguno de estos.
- Entró (último inicio de sesión).
- Señal de vida del navegador: `ActivityBeacon` manda `lumina_activity_ping` al abrir la app, al cambiar de pantalla y cada 60 segundos.
  - Queda guardado en `lumina_activity_sessions` y `lumina_activity_pings`, con dispositivo, país y ciudad, por 180 días.
- Abrió una clase.
- Hizo un examen.

**Tarjetas:**
- **Activos ahora**: últimos 15 minutos.
- **Hoy**, **7 días** y **30 días**: cuántos entraron.
- **Personas**: el total, y cuántos no han entrado.
- Cada tarjeta tiene **"Ver quiénes ›"**. Abre `DashPeople.tsx` con el RPC `lumina_dashboard_people`: lista de quién entró y quién no, con su organización, agencia, rol y última vez.

**Debajo de las tarjetas:**
- Gráfica de personas activas por día.
- "Quién se conecta".
- Desglose por organización y por agencia.
- Gente trabada.
- Dispositivos.

**Filtros:** Hoy, 7, 30 o 90 días, Rango, organización, agencia, Incluir demos. Se refresca solo cada minuto.

### 1.6 Lo que conviene NO copiar de Lumina

- **Cómo reconoce al equipo de la plataforma.** Hoy es "un admin sin empresa ni organización": un campo mal puesto convierte a un cliente en equipo de Lumina.
  - Maven ya lo hace bien, con la tabla `plataforma_admins` y su nivel (`dueno` o `admin`).
- **Dos definiciones distintas de "activo".** La tarjeta de la organización cuenta solo exámenes; el Dashboard cuenta también entradas. En Maven tiene que haber una sola.
- **Lógica de negocio en una función de ~2.200 líneas** (`lumina-team`). En Maven, mejor en funciones SQL pequeñas, como ya se hace.

---

## 2. Dónde está Maven hoy

Hay **dos bases**:
- **Kash** (`lsagslbkliprespbyhts`): la app de producción.
  - Es de una sola agencia: ASM / Kash, unas 85 personas.
  - Decisión del 19/11: **no se toca**.
- **Edificio** (`maven-agencias`, `ezeigddgkaemxpshghmu`): para clientes nuevos.
  - Ya tiene el esquema base: 459 tablas, incluidas `tenants`, `profiles` y `plataforma_admins`.
  - **El árbol de organizaciones todavía NO está aplicado.** Comprobado el 24/11: no existe la tabla `organizaciones`.

Lo que ya está hecho, en papel o en código:

| Pieza | Estado |
|---|---|
| Especificación "Maven como Lumina" (19/11): decisiones, tipos de cliente, precios, sillas, Ver como | ✅ escrita |
| Migraciones del árbol (`infra/edificio/migraciones/20261119210000_arbol.sql`, `…211000_arbol_funciones.sql`): `organizaciones`, `organizacion_admins`, sillas por agencia, `pedidos_de_sillas`, `enlaces_de_acceso`, historial, avisos, socios, briefs | ✅ escritas · ❌ sin aplicar |
| Panel del dueño `/plataforma` ("Tus organizaciones", tarjeta de Kash solo para mirar), `/mi-empresa`, Ver como de la plataforma, asistente Nuevo cliente | ✅ en `main` pero **apagado** (con datos de ejemplo) |
| PR #264 "Puerta lista para prender": panel real, "Clientes" en el menú, `quien_soy_en_la_plataforma()`, workflows para aplicar el árbol e invitar a rusin24 | ⏳ **abierto desde el 19/11, sin fundir** |
| Función `plataforma`: crear cuentas, mandar correos, marca | ❌ falta |
| Cobro con Stripe (registro, suscribir cliente, créditos de Argos) | ⏳ a medias. **Codex trabaja en eso ahora** (rama `codex/stripe-maven-catalogo-impuestos`) |
| **Dashboard de toda la plataforma** (actividad de la gente entre clientes) | ❌ **no existe ni está en el plan** |

Roles en Maven hoy:
- Están repartidos en unas cinco fuentes: `user_roles`, `role_groups`, `profiles.nivel`, `tenant_owners` y las "posiciones" (el catálogo de permisos que ya funciona en `/ajustes/posiciones`).
- El edificio los traduce a mano a admin, supervisor y empleado.

---

## 3. Propuesta

### 3.1 Árbol y roles de Maven (copia de Lumina)

```
Dueño de Maven (rusin24@gmail.com)  +  Equipo de Maven (Grace: todo menos precios y cobros)
 └── Cliente (organizacion)   tipo: con agencias (marca blanca, como Blu) | directo
      ├── Admin(s) del cliente
      └── Agencias (tenant)
           ├── Dueño de la agencia
           ├── Admin(s) de la agencia
           ├── Supervisores   (ven a sus agentes; o toda la agencia si el cliente lo prende)
           └── Agentes        (en Lumina "estudiante"; en Maven siempre "agente")
```

- **Rol fijo** (admin, supervisor o agente) = qué parte del árbol ve cada persona. Es el equivalente a lo que en Lumina hacen `can_view_user` y compañía.
- **Posición** (chatter, closer, RRHH…) = qué módulos usa. Va **encima** del rol y la define cada agencia en `/ajustes/posiciones`, que ya existe.
- **Un cliente directo** es una organización con una sola agencia: su admin no ve el nivel de agencias.

### 3.2 Sillas

- Igual que Lumina:
  - El paquete del cliente se reparte en sillas por agencia.
  - La suma de lo repartido no pasa del paquete.
  - Cada agencia tiene su tope.
  - Hay pedidos de sillas de la agencia al cliente y del cliente a Maven.
- **Diferencia acordada el 19/11:** si se llena, **se bloquea** (Lumina solo avisa). No hay sillas de regalo.
- Precios: Equipo USD 299 (hasta 20), Empresa USD 599 (hasta 50), Enterprise a la medida, setup desde USD 3.000.

### 3.3 Dashboard de Maven (nuevo, como el de Lumina)

Una sola función, `maven_dashboard(desde, hasta, zona, cliente, agencia, incluir_demos)`, con el mismo recorte por rol:
- el dueño y el equipo de Maven ven toda la plataforma;
- el admin de un cliente, su cliente;
- el dueño de una agencia, su agencia.

**Qué es "activo" en Maven** (una sola definición). Propuesta: cualquiera de estas señales.
- **Marcó entrada del turno** (`turno_marcas`; marcar entrada es obligatorio desde el 20/11).
- **Estuvo en Cowork** (`cowork_sessions`).
- **Señal de vida de la app**: copia del `ActivityBeacon` de Lumina, cada 60 segundos, con dispositivo y lugar.
- **Inició sesión.**

**Tarjetas:**

| Tarjeta | Qué muestra |
|---|---|
| Activos ahora | Últimos 15 min. En Maven puede ser "en Cowork ahora" |
| Hoy / 7 días / 30 días | Cuántos entraron |
| Personas | El total y cuántos no han entrado |

Cada tarjeta lleva **"Ver quiénes ›"**: lista con cliente, agencia, rol, última vez, entró o no.

**Debajo de las tarjetas:**
- Gráfica de personas activas por día.
- "Quién se conecta".
- Desglose por cliente y por agencia.
- **Extras de Maven** (a confirmar):
  - Nota de Argos del día.
  - Horas trabajadas.
  - Tardanzas.
  - Saldo de Argos.
  - "Necesita de ti".

**Kash:** sigue entrando al panel como tarjeta de solo lectura (`kash-resumen`). Sus números de actividad se pueden sumar al Dashboard con la misma llave de solo lectura.

### 3.4 Orden de construcción (sin tocar Kash; cada paso es un Pull Request)

1. **Prender el edificio para el dueño.**
   - Revisar y fundir el PR #264.
   - Ensayar y aplicar el árbol en el edificio.
   - Invitar a rusin24@gmail.com como dueño.
   - Con eso, "Tus organizaciones" muestra datos reales y la tarjeta de Kash.
2. **Función `plataforma`.**
   - Nuevo cliente, en 4 pasos: tipo → líder → paquete → marca.
   - Pendientes y "Activar".
   - Invitaciones con "Crear mi contraseña".
   - Registro de correos.
3. **Panel del admin del cliente** (`/mi-empresa`).
   - Agencias: invitar empresa, repartir sillas, cambiar dueño, archivar.
   - Personas con su rol: admin, supervisor o agente.
   - Pedidos de sillas.
4. **Dashboard de toda la plataforma** (sección 3.3) + señal de vida de la app.
5. **Ver como, "Mostrar a un cliente" y demos** (pasar a demo / marcar como cliente; "Incluir demos").
6. **Cobro y créditos de Argos.** Hoy lo está haciendo Codex: coordinar para no pisarse.
7. **Cliente Demo** (corp@asmtech.me), después Blu.

### 3.5 Qué hay que arreglar antes de meter muchos clientes al mismo edificio

El edificio nació como copia de Kash, así que trae sus huecos:
- 24 reglas de "dueño" y unas 196 reglas por rol **no filtran por agencia**.
  - `es_admin_o_dueno`, `argos_vigilables` y `puede_vigilar_a` ven entre agencias.
- Muchas tablas no tienen `tenant_id`: turnos, monitor, tiempos y pausas de Cowork, RRHH, notificaciones.
- Algunas funciones (`cowork-session`, `livekit-token`, `recordings`) deciden quién es admin sin mirar la agencia.

Con **un solo cliente** en el edificio esto no se nota. **Antes del segundo cliente real hay que cerrarlo.** Propuesta: un PR de aislamiento entre los pasos 3 y 7.

---

## 4. Preguntas para dejarlo bien

1. **Dueño de Maven.** ¿Se confirma que el dueño de toda la plataforma es **rusin24@gmail.com**, como en Lumina? ¿Y que tus cuentas de Kash siguen siendo dueñas solo de Kash?
2. **Kash.** ¿Sigue la decisión del 19/11, Kash aparte y sin tocar, y los clientes nuevos en el edificio? ¿O quieres que Kash pase a ser un cliente más dentro del árbol (más trabajo y más riesgo)?
3. **Último nivel = "Agente" para todos.** ¿Cada agencia sigue definiendo sus posiciones (chatter, closer…) encima de "agente"?
4. **Supervisor.** ¿Ve solo a los agentes que tiene asignados, con un interruptor por cliente para que vea toda la agencia (como `sup_all` en KA$H)?
5. **"Activo" en el Dashboard.** ¿Cuenta marcar entrada del turno, estar en Cowork, tener la app abierta o solo iniciar sesión? ¿Y "Activos ahora" = en Cowork ahora mismo?
6. **Sillas.** ¿Admins y supervisores también ocupan silla, como en Lumina? Si se llena, ¿bloquear (decisión del 19/11) o solo avisar y cobrar el paquete siguiente (como Lumina)?
7. **Extras del Dashboard.** Además de quién entra, ¿quieres ver por cliente la nota de Argos, las horas trabajadas, las tardanzas y el saldo de Argos?
8. **Reparto con Codex.** Codex está con el cobro (Stripe). ¿Claude toma árbol + panel del cliente + Dashboard, y Codex sigue con cobros?

## Cambio de estructura (24/11/2026, tarde) — SIN «clientes de clientes»
Alvaro: en Maven no hay revendedores como en Lumina (Jacqueline/Blu era un caso de Lumina). Queda así:
- **Maven (dueño rusin24 + admins de plataforma) → Organización (= una empresa cliente) → Dueño / Admin / resto.**
  Sin nivel de líder ni subcuentas. Lo crea Alvaro o un admin de Maven.
- **Varias sedes o marcas = varias organizaciones separadas**, cada una con su dueño y su cobro.
- **Niveles:** Dueño y Admin fijos; lo demás (Supervisor, HR, QA, agentes…) lo crea el Admin con **Posiciones**, con el nombre que quiera.
- **Primer acceso:** al crear la organización se invita al **Dueño**; él invita a sus admins y arma lo demás.
- **Plan y pagos:** los ven y pagan el **Dueño y los Admins** (supervisores y gente no ven dinero).
- **Sillas:** cuentan todos menos el Dueño; llena = no se agrega a nadie hasta subir sillas.
- **Una persona dueña de varias organizaciones:** un solo correo y un **selector de organización** arriba.
- Técnico: organización = un solo `tenant` (el «cliente directo» de antes, siempre). El nivel «agencias» queda escondido;
  se conservan las tablas por si un día se prende «tiene subcuentas», sin rehacer nada.
- Sigue igual: onboarding flexible por organización (días de montaje, prueba, setup, cobro, gracia, pausa), Grace sin precios,
  cobro por TECH VISUALS LLC, Dashboard por organización (quién usa y quién no), Kash como tarjeta solo de mirar.

## Tanda de preguntas «Nuevo cliente» (25/11/2026)
- **Formulario:** lo básico al crear (empresa, nombre y correo del Dueño, idioma). Plan, sillas, prueba, setup, cobro y logo se llenan después en la ficha del cliente.
- **Invitación:** el cliente nace «En preparación»; el correo al Dueño sale **solo al apretar «Activar»**.
- **Fin de la prueba sin pago:** siguen trabajando los **días de gracia** que se pongan en ese cliente; después la cuenta **se pausa sola** hasta que paguen (Alvaro puede extender o reactivar a mano).
- **Quién crea y activa:** Alvaro y Grace. **Precio, setup y cobro: solo Alvaro.**
- **Cobro por defecto:** link de pago con tarjeta (Stripe, TECH VISUALS LLC); al pagar queda marcado solo. Se puede cambiar por cliente (factura + «Marcar pagado», o suscripción).
- **Setup:** se cobra **antes de activar**; «Activar» queda bloqueado hasta que el setup esté pagado, o Alvaro lo marque pagado o regalado.
- **Cuenta en pausa:** el Dueño y sus Admins ven solo «Cuenta en pausa» con botón de pagar; los demás ven «Habla con tu jefe». No se borra nada.
- **Avisos a Alvaro (correo + panel):** el Dueño entró por primera vez; la prueba vence en 3 días; pago recibido o fallido; cuenta pausada o sillas llenas.
- **Primera entrada del Dueño:** lista de pasos para arrancar (crear Posiciones, invitar Admins, invitar gente, instalar la app) que se palomea sola.
- **Tablero por cliente:** gente activa en 7 días vs sillas; quién nunca entró; en vivo ahora (Cowork); nota de Argos del día y estado de pago (al día / prueba / gracia / pausa).
- **Más sillas:** las dos vías — el Dueño puede **pedir** (Alvaro aprueba y se ajusta el cobro) o **comprar** con tarjeta y se suman al instante.
- **Prueba antes de un cliente real:** «Cliente Demo» con corp@asmtech.me como Dueño y Stripe en modo prueba.
- **Precios que salen listos:** los de la portada (Equipo USD 299 hasta 20, Empresa USD 599 hasta 50, Enterprise a la medida, setup desde USD 3.000); se pueden cambiar por cliente.
- **Marca propia («Empresa · powered by Maven»):** es un **extra de pago**; apagada por defecto, Alvaro la prende en el cliente que la pague. (Cambia lo del 19/11, donde era para todos.)
- **Cliente que se va:** se archiva (nadie entra) y se guarda 90 días reactivable; después se borra solo con aprobación de Alvaro.
- **Tarjeta de Kash en el panel del dueño:** después; primero «Nuevo cliente». Requiere OK explícito porque toca Kash.

## Quinta tanda (25/11/2026, noche)
- **Montaje:** se elige **en cada cliente**: «la arma Maven» (Alvaro o Grace dejan Posiciones y lista de gente listas antes de activar; el Dueño después cambia lo que quiera) o «la arma el cliente» (el Dueño lo hace con su lista de pasos).
- **Ver por dentro:** Alvaro y Grace **sí pueden entrar a la cuenta de un cliente en modo «solo mirar»** (sin cambiar nada); cada entrada queda anotada con fecha y el Dueño del cliente puede ver quién de Maven entró.
- **Silla extra comprada con tarjeta:** **USD 15 por silla al mes**, cambiable por cliente.
- **Días de prueba y de gracia: NO hay números fijos.** Se deciden en cada cliente. Al preparar un cliente, **Maven le hace las preguntas a Alvaro con botones, una por una** (días de prueba, días de gracia, setup, forma de cobro…) y **no deja activar hasta que estén todas contestadas**. (Hoy el código trae 14 y 7 como valores globales en `precios_plataforma`; pasan a ser solo una sugerencia de botón.)
- **Términos y contrato:** el Dueño marca **siempre** «Acepto los términos» la primera vez que entra (se guarda la fecha). Además, en los clientes que Alvaro marque, no se puede activar hasta poner «Contrato firmado». Falta que Alvaro pase el texto de los términos.
- **Botón de Ayuda del cliente:** ofrece **tres caminos: correo, Telegram y WhatsApp**. Falta que Alvaro pase el correo de soporte, el usuario de Telegram y el número de WhatsApp.
