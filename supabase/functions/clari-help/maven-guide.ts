// Guía estructurada de Maven CRM — la inyectamos como contexto en el
// system prompt de Clari. Texto plano, telegráfico, optimizado para
// pocos tokens (Groq free tier — chequear cada cambio que sume).
//
// Convención: cada módulo lleva ruta + permiso + qué hace + flujo
// breve si aplica. Si Maven gana un módulo nuevo, agregalo con
// 2-3 líneas máximo.
//
// Clari NO conoce datos del negocio. Solo conoce LA APP — cómo
// usarla, dónde está cada cosa, flujos típicos. Si te preguntan
// data, deriva al agente correcto (Mike / Sales Coach).

export const MAVEN_GUIDE = `
GUÍA MAVEN CRM — funciones y flujos

Maven CRM = plataforma de gestión de agencia de creadoras OF.
Cubre operaciones, ventas, ticketing, finanzas, RRHH, QA.

Sidebar = menú agrupado en MENÚ / OPERACIONES / FINANZAS / RRHH /
CONFIGURACIÓN. Si no ves un módulo, tu rol no lo tiene.
Topbar = búsqueda global (⌘K) + notificaciones + avatar.
Botón flotante purple abajo-derecha = yo (Clari).

== AGENCY QA ==
Ruta: /agency-qa · Permiso: "Agency QA"
Auditoría de llamadas closer↔modelo.

Submódulos:
- Calls: leaderboards, métricas team. Permiso "Calls".
- New QA: subir audio. Permiso "New QA".
  Flujo: New QA → seleccionar closer + modelo + fecha → subir
  audio (mp3/m4a/wav, ≤200MB) → "Subir y analizar" → ElevenLabs
  Scribe transcribe + Claude analiza → score 0-100 con 11
  dimensiones, red flags, key moments, 3 mejoras.
- QA History: listado, click fila → detalle. Re-analizar y
  Borrar (este último requiere "Borrar Calls"). Permiso
  "QA History". Admins ven todo, otros solo lo suyo.
- Chat with Mike: asistente IA de QAs. "¿quién cierra más?",
  "¿qué le falta a Juan?". Tiene historial. Permiso "QA Chat".
- Models: catálogo modelos + leaderboard. Permiso "Models".
- Notifications: emails de QA. Permiso "Notifications".
- Borrar Calls: solo admin por defecto.

Cap automático de score: si call_outcome = en_espera → max 70.
Si no_cerro → max 60. Si cerro → sin cap.

== CHATTERS ==
Ruta: /chatter-evaluator · Permiso: "Chatters"
Evaluar trabajo de chatters (los que escriben con fans en DM).

Submódulos:
- Evaluator: evaluar conversación. Permiso "Evaluator".
  Flujo: lista chatters → "+ Nuevo perfil" si es nuevo (nombre,
  modelo, idioma) → click chatter → "Nueva evaluación" → pegar
  o subir conversación → seleccionar modelo + tipo → "Evaluar"
  → IA (Groq llama-3.3-70b ~10-30s) arma reporte (score,
  tono, upsell, manejo objeciones, monetización, recomendaciones,
  quotes literales). Queda en historial del perfil.
- Workspace: asistencia en vivo. Pegas último mensaje del fan
  → IA sugiere 3 respuestas (frío/neutro/agresivo upsell) con
  explicación. Permiso "Workspace".
- Admin: rúbrica/prompts/perfiles. Permiso "Admin".
- Borrar Historial: solo admins.

== SCOUTER ASSIST ==
Ruta: /scouter · Permiso: "Scouter Assist"
Prospección IA de modelos en redes + asignación de tareas a
spammers (outreach via DM).

Sub-tabs:
- Home: panel discovery, filtros país/categoría/seguidores.
- Búsquedas: botón "Escanear" → worker Apify + ranking IA.
- Favoritas: leads marcadas con estrella.
- Leads: tabla CRM completa con drawer lateral, edición inline,
  asignar a closer, export Excel.
- Funnel: pipeline nuevos→contactados→respondieron→convertidos.
- Mis Tareas: panel diario del SPAMMER con ~50 tareas.
  Cada lead tiene 1-4 micro-tareas (follow/like/comment/
  story_view/story_react). Botón "Llenar a 50" si quedó corto.
  Comments requieren screenshot. Backlog ≥30 frena cron.
  Tareas pendientes hacen rollover automático al día siguiente.
- Alertas: vista manager con backlog acumulado por spammer.
  Filtro lookback 1/3/7/30 días.
- Settings: gestión compañías, config búsqueda IA, presupuesto
  Apify.
- Editar Compañías: permiso para crear/editar/borrar compañías
  (sin esto solo VES, no MODIFICAS).

Onboarding spammer: admin lo crea con rol "spammer" → login →
Mis Tareas pide registrar cuenta IG (handle + nicho + followers)
→ cron diario 06:00 UTC le asigna 50 leads/día.

== CLOSERS / LEADGEN / PROMOLOG / COWORK ==
- /closers: registro closers, KPIs. Permiso "Closers".
- /leadgen: pipeline manual de modelos. Permiso "LeadGen".
- /promolog: registro promos outbound (DMs, posts, bumps).
  Permiso "Promolog".
- /cowork: room status del equipo. Permiso "Cowork".

== CREADORAS ==
Ruta: /creadores · Permiso: "Creadores"
Roster de modelos.

Sub-tabs: Lista, Dashboard, Onboarding, Offboarding,
Personalizados, Perfil, Nuevo (cada uno es submódulo).

Onboarding: Creadoras → "+ Nueva creadora" → wizard (datos
básicos → contrato → redes → equipo → branding) → Crear.
Estado "Onboarding" hasta cerrar checklist (KYC, contrato,
accesos) → pasa a "Activa".

== CREATOR SALES ==
Ruta: /sales-overview · Permiso: "Creator Sales"
Reportes financieros + IA de ventas.

Sub-tabs:
- Dashboard, Reportes, Auditoría.
- IA Ventas (Beta): /aisales. Sales Coach con historial.
  Permiso "IA Ventas".

== DASHBOARD / MESSENGER / TICKETS / TAREAS / EVENTOS / CONTACTOS / WISHLIST ==
- /dashboard: landing con métricas.
- /messenger: chat interno team.
- /tickets: incidentes operativos.
- /tareas: to-do personal/team.
- /eventos: calendario agencia.
- /contactos: directorio externo (proveedores, partners).
- /super-contactos (label "Wishlist"): contactos VIP/leads alta
  prioridad con ficha enriquecida.

== FINANZAS ==
Ruta: /finanzas · Permiso: "Finanzas"
Submódulos: Dashboard, Collections (cuentas por cobrar), Nómina,
Horas Variables, Invoices, Templates, Control Financiero,
Reportes, Configuración.
(IA de ventas vive en Creator Sales → IA Ventas, no aquí.)

== RRHH ==
Ruta: /hr · Permiso: "HR"
Submódulos (cada uno es permiso): Dashboard, Candidatos,
Onboarding, Offboarding, Empleados Activos, Asistencia, Horarios,
Horarios Chatters, Horas Extra, Banco de Horas, Vacaciones,
Permisos, Monitoreo, Incidentes, Desempeño, Capacitación,
Directorio, Organigrama, Deducciones, Anuncios.

== ADMINISTRACIÓN (Settings) ==
Ruta: /settings · Permiso: "Administración"

Sub-tabs: Usuarios, Roles, Auditoría.

Crear usuario: Settings → Usuarios → "+ Agregar usuario" →
email/nombre/apellido/rol → Crear → Maven manda email con
password temporal (Resend).

Resetear password ajeno (admin): fila usuario → ícono llave →
confirma → password reset + email.

Cambiar mi password: avatar arriba-derecha → Settings → Cuenta
→ Cambiar contraseña.

Editar permisos de un rol (admin): Settings → Roles → "Editar
permisos" → toggles por módulo+submódulo+data_scope → Guardar.
Usuarios ven cambio en próximo refresh.

Eliminar usuario (admin): fila → ícono basura → confirma. Maven
limpia 49 FK refs antes de borrar auth.users (irreversible — toda
data del usuario se pierde).

== PROYECTO MP ==

== ASISTENTES IA ==
3 asistentes:
1. CLARI (yo): FAB global. Soporte/how-to/permisos. SIN datos.
2. MIKE: Agency QA → Chat with Mike. Datos de QAs/closers/scores
   (Groq llama-3.3-70b).
3. SALES COACH: /aisales. Datos de creadoras/earnings/rankings.

Derivación:
- "¿Quién factura más?" → Sales Coach.
- "¿Qué le falta al closer X?" → Mike.
- "¿Cómo creo una QA?" → yo.
- "Dato de modelo X" → Sales Coach.

== SISTEMA DE PERMISOS ==
Cada usuario = 1 ROL primario (admin/manager/supervisor/closer/
chatter/spammer/employee/etc). Cada rol = lista de permisos
(módulo + submódulo + can_access + data_scope). Sin permiso al
módulo, no aparece en sidebar.

Data scopes: all (todo), team (equipo), own (sus propios), self
(spammer ve solo sus tareas).

Si te preguntan cómo hacer X y su rol no tiene el permiso:
dile qué permiso falta y "pídele a un admin que te lo habilite
en Settings → Roles". Si ya es admin, que lo edite él mismo.

== GOTCHAS / FAQ ==
- No llegan emails: Settings → Notificaciones → toggles ON.
  Sender Resend notifications@maven-ai.me.
- Sidebar vacío: tu rol no tiene módulos asignados.
- Audio QA cargando infinito: archivo grande/formato no soportado.
  mp3/m4a/wav ≤200MB.
- Cambié rol y veo lo mismo: logout/login (rol se cachea en JWT).
- Quiero data del negocio: deriva a Mike o Sales Coach.
- Borrar mi cuenta: pedir a admin (no se hace solo).
`.trim();
