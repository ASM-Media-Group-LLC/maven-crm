# Maven como Lumina — especificación (19/11/2026)

Fuente: Lumina (app.lumina-ai.me), código sin commitear en
`/Users/alvaropro/lumina/.claude/worktrees/frosty-pasteur-e2156c/app/src`, base `tkrzxyunpelesqenidak`,
edge `lumina-team` (v41) y `lumina-client`. Mapa completo pantalla por pantalla hecho el 19/11.

## Decisiones de Alvaro (Q&A del 19/11)
- **Kash es la cuenta principal: NO se toca bajo ninguna situación** (base `lsagslbkliprespbyhts`).
- Clientes nuevos viven en el **edificio aparte** `maven-agencias` (`ezeigddgkaemxpshghmu`).
- Árbol: Dueño (Alvaro) + admin de plataforma (Grace) → **Cliente** (organización) → **Agencias** → personas.
  Cliente directo = organización con una sola agencia; su admin no ve el nivel de agencias.
- El **admin del cliente crea sus agencias**, reparte las sillas de su paquete (SIN sillas de regalo),
  cambia dueño, archiva, manda avisos, ve historial, y **ve todo de sus agencias como dueño**
  (Cowork en vivo, Argos, cámaras, llamadas). **Ve su plan y sus pagos.**
- **Una cuenta por agencia** (nadie comparte cuenta entre agencias). El admin del cliente es una cuenta a nivel cliente.
- Precio = portada: Equipo USD 299 (hasta 20), Empresa USD 599 (hasta 50), Enterprise a la medida, setup desde USD 3.000.
- **Marca**: logo + nombre del cliente («X · powered by Maven»), mismo app.maven-ai.me.
- **Correos los manda Maven** (noreply@envios.maven-ai.me, Resend Pro), no del dominio del cliente.
- **Módulos**: todo prendido para todos.
- **Argos con créditos**: Equipo trae USD 20/mes, Empresa USD 50/mes; recarga de USD 25 vale USD 50 (margen 2x);
  pago con **tarjeta (Stripe)**; sin saldo → Argos se pausa y avisa al admin con botón de recargar; lo demás sigue.
- Kash aparece en el panel del dueño como **tarjeta solo para mirar**; «Entrar» lleva al Maven de Kash de siempre.
- Cuentas separadas de Lumina. Primero **«Cliente Demo»** con invitación a **corp@asmtech.me**; después Blu
  (Jacqueline con jackie@blu.luxe; su cuenta de Kash no se toca).
- Estilo visual de Maven (vidrio/morado de la consola), no el negro-dorado de Lumina.

## Más decisiones (19/11, tanda 4)
- **Dueño de toda la plataforma Maven = rusin24@gmail.com** (cuenta NUEVA, en el edificio; la usa en el navegador).
  Su cuenta actual de Kash (con correo de Maven) sigue igual en la app, como dueño de Kash. Kash puede volverse
  después un cliente más, pero hoy no se mueve.
- **Dos tipos de cliente, simple:** con marca blanca y agencias (como Blu) y normal (directo a sus empleados).
- Cliente nuevo nace **«En preparación»** con lista de pendientes; nadie recibe correos hasta «Activar».
- Si un cliente pasa las personas de su plan: **se bloquea** (no agrega a nadie hasta subir de plan o que el dueño apruebe sillas).
- El admin del cliente ve de sus agencias **exactamente lo que Alvaro ve hoy en Kash** (Argos, Cowork, todo) +
  columnas por agencia: En vivo (Cowork), Nota de Argos, Saldo de Argos, Necesita de ti.
- **Socios y Briefs se copian** de Lumina.
- Diseño técnico: agencia = `tenant` (todo el RLS por tenant que ya existe sirve tal cual); cliente = tabla nueva
  `organizaciones` padre de tenants; el admin del cliente lee sus tenants por un helper; el dueño = `plataforma_admins`.

## Qué se copia de Lumina (genérico) y qué no
Se copia: organizaciones, agencias, roles, sillas, invitaciones con «Crear mi contraseña», Ver como (Por rol /
Empresa / Persona, solo lectura con «Volver a ser yo»), Historial, Mandar aviso, Cambiar dueño, Archivar/Reactivar,
Pausar, pedidos de sillas (agencia → cliente → Maven), «Necesita de ti», lista de pendientes del cliente
«En preparación» (nadie recibe correos hasta Activar), «Mostrar a un cliente», Pasar a demo / Marcar como cliente,
Equipo de Maven (admins de plataforma), registro de correos (¿Llegó? + Reenviar).
No se copia (es de cursos): cursos, cajitas/paquetes de cursos, catálogo, exámenes, Confianza, certificados,
Estudio, Tienda. En Maven el «paso 2» de Invitar empresa son las **sillas** en vez de cursos.

## Pantallas de Lumina a calcar (rutas y componentes)
- Dueño `/owner` (`pages/LuminaOwner.tsx`, `OrgCard`): «Tus organizaciones», Clientes / Demos, Nuevo cliente.
- **NewClientWizard** (`components/NewClientWizard.tsx`): Tipo (Tiene clientes / Directo) → Líder (nombre, correo,
  idioma) → Paquete → Marca (nombre + logo ≤ 2 MB). Crea «en preparación», sin correos.
- **ClientChecklist** (`components/ClientChecklist.tsx`): Líder asignado, Marca, Paquete, Activado (invita), Líder entró, Primera factura.
- Panel del cliente revendedor `/admin` → **OrgSeatsBoard** (`components/OrgSeatsBoard.tsx`): sillas en tu paquete /
  repartidas / ocupadas / libres / agencias; Historial · Mandar aviso · Invitar empresa; «Líderes»; «Piden más sillas»;
  tabla «Tus agencias» (Agencia y dueño · Sillas · Activas 7 d · … · ⋯ Sillas / Cambiar dueño / Historial / Archivar),
  fila expandible con Dueño/Admins/Supervisores/Empleados; Archivadas.
  En Maven las columnas de avance de cursos se cambian por las de Maven: En vivo (Cowork), Nota de Argos, Saldo de Argos, Necesita de ti.
- **InviteCompanyDialog**: Empresa (nombre, a qué se dedica, idioma, notas) → [Maven: Sillas] → Dueño (nombre, correo,
  teléfono, WhatsApp, Instagram, idioma, «Lo invito después») → «Empresa lista».
- **OrgSettingsDialog** (solo dueño): Admins del cliente, Paquete, Cobro, Marca.
- **AddEmployeeDialog**: idioma, nombre, correo, rol (Empleado / Supervisor / Admin de la agencia), «Crear cuenta y enviar invitación»;
  errores agencia llena / ya existe.
- **VerComo** (`components/VerComo.tsx`), **SetPassword** (`pages/SetPassword.tsx`, token 7 días de un solo uso),
  **MailLog**, **Equipo** (`pages/Equipo.tsx`), Historial (`lumina_org_log`).
- Asientos: tope de la agencia = sillas que le dio el cliente; la suma no pasa del paquete; no baja de lo usado;
  agencia llena → no se agrega gente; pedidos agencia → cliente (seat-request/decide) y cliente → Maven (org-seat-request/decide).
- Correos de Lumina (asuntos): «{Empresa} ya tiene su portal en {Marca}», «Ya eres admin de {Marca}»,
  «{Empresa} te dio acceso a {Marca}», «{Agencia} pide N sillas más», aviso del cliente, «{Cliente} pasó su paquete».

## Vagones de construcción
1. Edificio vivo (base al día, funciones, auth/entrada) — sin tocar Kash.
2. Misma puerta: app.maven-ai.me pregunta el correo y manda a Kash o al edificio.
3. Árbol cliente → agencias → personas + RLS + sillas.
4. Paneles del dueño (Tus organizaciones, Nuevo cliente, pendientes, Ver como, Equipo de Maven).
5. Panel del admin del cliente (agencias, invitar, sillas, cambiar dueño, archivar, avisos, historial, plan y pagos).
6. Marca del cliente. 7. Argos con créditos + Stripe. 8. Cliente Demo + capturas.
Cada vagón en PR; nada a producción sin el OK de Alvaro.

## Tanda 5 (19/11) — Kash dentro del panel del dueño
- Se entrega así en la cuenta principal de Maven (rusin24@gmail.com, navegador). Adentro se ve Kash con su «Álvaro de Kash»
  que entra con su propio login de Maven (app de computador).
- **Lectura de Kash autorizada SOLO lectura**: una función nueva en Kash que solo cuenta/resume (personas, en vivo en Cowork,
  nota de Argos de hoy, gasto/saldo de Argos, necesita de ti). No escribe, no cambia tablas ni gente. Llamada desde el edificio
  con una llave dedicada de solo lectura.
- Tarjeta de Kash: **las dos cosas** — resumen dentro del panel + botón que abre la app de computador (donde está la sesión de Kash).
- **Grace = admin de plataforma** en Maven (todo menos precios y cobros), cuenta aparte en el edificio (grace.gelves@maven-ai.me
  sigue como admin en Kash, no se toca).
- Panel del cliente lleva la tarjeta «Líder de {Marca}» como Lumina: correo madre, entró / última acción, agencias que creó,
  invitaciones mandadas, sillas repartidas, pedidos sin responder, lo último que hizo.

## Tanda 6 (19/11)
- Construir todo ya SIN gastar en Supabase (demo con datos de ejemplo en el computador); el día del cliente solo se enciende.
- El edificio se queda prendido (USD 10/mes). Créditos de Argos que no se usan SE ACUMULAN; una billetera por cliente con gasto anotado por agencia.
- Agencia pausada por el admin del cliente: NADIE entra (no se borra nada).
- Decidido técnico: creadoras y papelera no ocupan silla; Grace puede aprobar pedidos de sillas; el admin del cliente dentro de una agencia escribe como su dueño; crear_agencia siembra roles por la edge; avisos se entregan por correo de Maven + campana.

## Tanda 7 (19/11) — ALCANCE REDUCIDO POR AHORA
- Solo **Dueño → Clientes → Trabajadores** (cliente «normal»). SIN agencias debajo del cliente, SIN reventa/marca blanca de agencias, SIN Stripe.
- Argos: saldo por cliente (USD 20 Equipo / 50 Empresa al mes, se acumula); al acabarse se pausa y avisa; **el dueño recarga con un clic** tras cobrar por fuera.
- El cliente SÍ lleva logo y nombre («X · powered by Maven»).
- Socios y Briefs: después.
- El esquema del árbol (PR #245) ya soporta el tipo «normal»: el cliente directo = organización con UNA agencia (tenant) donde vive su gente; su admin no ve el nivel de agencias.

## Tanda 8 (19/11) — STRIPE SÍ (corrige la tanda 7)
- Stripe se usa (cuenta de Stripe de Lumina, cobros con nombre Maven) para: **plan mensual automático** (299/599),
  **recargas de Argos** con tarjeta (USD 25 → USD 50 de crédito; se acreditan al instante) y **setup USD 3.000**.
- Pago del plan falla → aviso al admin del cliente y al dueño; **7 días de gracia y se bloquea** (nadie entra; nada se borra).
- **Registro solo desde la portada**: elige plan, pone tarjeta, **14 días gratis** y después se cobra solo; aviso al dueño.
- **Alta por el dueño o Grace** desde el panel con opciones especiales: días gratis a mano, sin tarjeta, sin setup, precio a medida.
- Alcance sigue: Dueño → Clientes → Trabajadores, logo+nombre del cliente; sin agencias bajo el cliente; Socios/Briefs después.
- Las llaves de Stripe las pone Alvaro (restricted key + webhook secret); yo no las leo.
