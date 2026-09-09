import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface ModuleDoc {
  nombre: string;
  objetivo: string;
  submodulos: string[];
  funcionalidades: string[];
  estados: string[];
  flujos: string[];
  automatizaciones: string[];
  kpis: string[];
  roles: string[];
  logica: string;
}

const modulesData: ModuleDoc[] = [
  {
    nombre: "Dashboard",
    objetivo: "Centro de mando unificado que consolida las metricas clave de la agencia, proporcionando visibilidad inmediata del estado operativo y financiero.",
    submodulos: ["KPI Cards", "Grafico de rendimiento semanal", "Pipeline de deals activos", "Top creators por ingresos", "Actividad reciente"],
    funcionalidades: ["Visualizacion de metricas globales en tiempo real", "Graficos de tendencia semanal/mensual", "Resumen de pipeline de closers", "Ranking de creadores por rendimiento", "Feed de actividad reciente del equipo"],
    estados: ["No aplica — modulo de solo lectura"],
    flujos: ["Carga inicial: consulta agregada a multiples tablas (creators, deals, of_gross_earnings)", "Actualizacion: revalidacion automatica via TanStack Query"],
    automatizaciones: ["Revalidacion de cache cada 5 minutos", "Calculo automatico de variaciones porcentuales periodo a periodo"],
    kpis: ["Total de ingresos brutos", "Numero de creadores activos", "Deals en pipeline", "Variacion de ingresos vs periodo anterior"],
    roles: ["Admin: acceso completo", "Manager: acceso completo", "Specialist: lectura", "Agent: lectura", "Closer: lectura"],
    logica: "El dashboard agrega datos de multiples fuentes sin modificar registros. Todas las consultas son de lectura y los calculos de KPIs se realizan en el cliente. La seleccion de periodo afecta todos los widgets simultaneamente.",
  },
  {
    nombre: "Contactos",
    objetivo: "Registrar y gestionar contactos comerciales de la agencia con un flujo estructurado de calificacion y seguimiento.",
    submodulos: ["Lista de contactos", "Formulario de nuevo contacto", "Detalle de contacto", "Filtros y busqueda"],
    funcionalidades: ["Registro de contactos con datos de perfil, redes sociales y notas", "Asignacion de estado y categoria fisica", "Filtrado por estado, pais y compania", "Edicion y eliminacion de registros", "Vista grid y tabla"],
    estados: ["Nuevo", "Contactado", "En Proceso", "Cerrado"],
    flujos: ["Captura: registro manual o conversion desde LeadGen", "Calificacion: asignacion de estado segun avance comercial", "Seguimiento: notas y actualizaciones periodicas", "Cierre: marcado como cerrado (exitoso o descartado)"],
    automatizaciones: ["Timestamp automatico de created_at y updated_at", "Validacion de campos obligatorios (nombre, Instagram)"],
    kpis: ["Total de contactos", "Contactos por estado", "Tasa de conversion (nuevo a cerrado)", "Contactos nuevos por periodo"],
    roles: ["Admin: CRUD completo", "Manager: CRUD completo", "Agent: CRUD completo", "Specialist: sin acceso", "Closer: sin acceso"],
    logica: "Cada contacto se almacena en la tabla contactos con un UUID unico. El estado determina la etapa del funnel comercial. Los contactos pueden originarse de una conversion manual desde LeadGen.",
  },
  {
    nombre: "Tareas",
    objetivo: "Gestionar tareas operativas organizadas por proyectos con asignacion, deadlines, conteo regresivo y posibilidad de compartir externamente.",
    submodulos: ["Lista de proyectos", "Vista de tareas por proyecto", "Formulario de creacion", "Compartir via token"],
    funcionalidades: ["Creacion de proyectos con descripcion y estado", "Asignacion de tareas a usuarios del equipo", "Definicion de deadline con duracion en horas/minutos", "Conteo regresivo visual en tiempo real", "Compartir tarea individual mediante link con token unico", "Registro de razon de atraso para tareas vencidas"],
    estados: ["active", "completed", "overdue"],
    flujos: ["Creacion: proyecto -> tarea asignada con deadline", "Ejecucion: countdown activo -> completada o vencida", "Vencimiento: solicitud de razon de atraso -> registro en overdue_reason", "Compartir: generacion de token -> link publico de solo lectura"],
    automatizaciones: ["Calculo automatico de countdown basado en due_at", "Cambio automatico a overdue cuando expira el deadline", "Generacion de share_token unico al compartir"],
    kpis: ["Tareas completadas vs pendientes", "Tareas vencidas por proyecto", "Tiempo promedio de completacion", "Tasa de cumplimiento por usuario"],
    roles: ["Admin: CRUD completo en todos los proyectos", "Manager: CRUD completo", "Specialist: solo tareas asignadas", "Agent: solo tareas asignadas", "Closer: solo tareas asignadas"],
    logica: "Las tareas pertenecen a un proyecto (task_projects) y se asignan a un usuario (assigned_to). El sistema calcula el tiempo restante en el cliente. Cuando una tarea vence sin completarse, se requiere una razon de atraso antes de poder cerrarla. El share_token permite acceso publico de solo lectura a una tarea especifica.",
  },
  {
    nombre: "Creadores",
    objetivo: "Gestionar la ficha integral de cada creador de contenido, incluyendo informacion personal, operativa, financiera, documental y de soporte.",
    submodulos: ["Lista de creadores", "Perfil del creador (tabs: Info, Redes, Lineamientos, Monetizacion, Notas, Documentos, Historial, Tickets)", "Formulario de nuevo creador", "Cambio de estado"],
    funcionalidades: ["Registro completo con datos personales, artisticos y de contacto", "Gestion de redes sociales y plataformas", "Definicion de lineamientos por categoria (precios, reglas, procedimientos)", "Registro de monetizacion mensual", "Notas internas con adjuntos", "Subida y gestion de documentos", "Historial de cambios con trazabilidad", "Vinculacion con tickets de soporte", "Asignacion de manager, specialist y closer responsable"],
    estados: ["activo", "pausado", "inactivo"],
    flujos: ["Alta: registro de datos basicos -> asignacion de equipo -> configuracion de lineamientos", "Operacion: seguimiento diario (Promolog) -> monetizacion -> notas", "Pausa: cambio de estado con registro en historial", "Baja: inactivacion con preservacion de datos historicos"],
    automatizaciones: ["Registro automatico en creator_history al cambiar estado", "Timestamps automaticos en todas las sub-tablas", "Calculo de edad a partir de birth_date"],
    kpis: ["Total de creadores activos", "Creadores por estado", "Ingresos promedio por creador", "Documentos pendientes", "Tickets abiertos por creador"],
    roles: ["Admin: CRUD completo", "Manager: CRUD completo", "Specialist: lectura y edicion de creadores asignados", "Agent: sin acceso", "Closer: sin acceso"],
    logica: "El creador es la entidad central del sistema. Su ficha se compone de la tabla creators mas multiples tablas relacionadas (creator_business, creator_guidelines, creator_notes, creator_documents, creator_history, creator_monetization, creator_payments, creator_training). La asignacion de equipo se realiza tanto en creators como en creator_business. Los lineamientos se organizan por categorias configurables.",
  },
  {
    nombre: "Eventos",
    objetivo: "Planificar, ejecutar y dar seguimiento a eventos de la agencia con gestion de invitados, checklist operativo y links compartibles.",
    submodulos: ["Lista de eventos", "Calendario", "Detalle de evento (tabs: Metricas, Invitados, Checklist, Links, Historial)", "Formulario de creacion/edicion", "Link compartible externo"],
    funcionalidades: ["Creacion de eventos con fecha, horario, ubicacion y tipo", "Gestion de lista de invitados con estados de asistencia", "Checklist de tareas previas al evento", "Links compartibles internos y externos con expiracion", "Registro de asistencia con log de cambios", "Cierre de evento con metricas finales"],
    estados: ["upcoming", "in-progress", "completed", "cancelled"],
    flujos: ["Planificacion: creacion -> configuracion de checklist -> invitacion de asistentes", "Ejecucion: registro de asistencia en tiempo real -> actualizacion de estados", "Cierre: marcado como completado -> metricas finales", "Compartir: generacion de token externo -> link publico con expiracion"],
    automatizaciones: ["Generacion automatica de tokens internos y externos", "Log automatico de cambios de asistencia (event_attendance_log)", "Expiracion automatica de links externos"],
    kpis: ["Total de eventos por estado", "Tasa de asistencia (confirmados vs asistentes reales)", "Checklist completado por evento", "Capacidad utilizada vs maxima"],
    roles: ["Admin: CRUD completo", "Manager: CRUD completo", "Specialist: lectura", "Agent: sin acceso", "Closer: sin acceso"],
    logica: "Los eventos se almacenan en la tabla events con relaciones a event_guests (invitados), event_checklist_items (tareas) y event_attendance_log (historial). Los invitados pueden ser creadores existentes o externos. El sistema genera tokens unicos para compartir eventos tanto internamente como con participantes externos.",
  },
  {
    nombre: "Creator Sales",
    objetivo: "Proporcionar analisis detallado del rendimiento financiero de los creadores con dashboards, comparativas, tendencias y analisis asistido por inteligencia artificial.",
    submodulos: ["Sales Overview (KPIs, rankings, alertas)", "Sales Dashboard (graficos detallados por creador)", "Sales Report / Performance (tabla de ingresos brutos)", "AI Sales (analisis automatizado con LLM)", "AI Config (configuracion del modelo)"],
    funcionalidades: ["Visualizacion de ingresos brutos por creador y periodo", "Comparativas entre creadores y entre periodos", "Rankings: Top 10, Subiendo, Bajando, Alto Potencial, En Riesgo", "Graficos de tendencia, heatmaps y desglose por canal", "Analisis automatizado con IA sobre patrones de rendimiento", "Filtros por creador, periodo y grupo", "Exportacion de datos"],
    estados: ["No aplica — modulo de solo lectura y analisis"],
    flujos: ["Carga de datos: importacion de OF Gross Earnings por periodo", "Analisis: seleccion de creador/periodo -> visualizacion de metricas", "Comparativa: seleccion de dos o mas creadores -> analisis lado a lado", "AI Sales: envio de contexto de datos -> respuesta generada por LLM"],
    automatizaciones: ["Calculo automatico de variaciones porcentuales", "Clasificacion automatica en categorias (subiendo, bajando, en riesgo)", "Proyecciones basadas en tendencia historica"],
    kpis: ["Total earnings gross por periodo", "Earnings por canal (subs, messages, tips)", "Variacion periodo a periodo", "Active fans y new fans", "Contribution percentage", "OF Ranking"],
    roles: ["Admin: acceso completo", "Manager: acceso completo", "Specialist: sin acceso", "Agent: sin acceso", "Closer: sin acceso"],
    logica: "Los datos provienen principalmente de la tabla of_gross_earnings, que almacena metricas diarias por creador importadas desde la plataforma de contenido. El sistema vincula cada registro con un creator_id para correlacionar datos financieros con la ficha del creador. AI Sales utiliza Edge Functions de Supabase para comunicarse con modelos de lenguaje.",
  },
  {
    nombre: "Promolog",
    objetivo: "Registrar y dar seguimiento a las actividades de promocion realizadas por los creadores en sus redes sociales.",
    submodulos: ["Lista de entradas", "Filtros por creador y red social", "Vista grid y tabla"],
    funcionalidades: ["Registro de actividad promocional por creador, fecha y red social", "Clasificacion por tipo de contacto y accion tomada", "Registro de evidencia (URL) y ticket asociado", "Indicador de presencia de link de compra", "Filtrado por creador, red social y periodo"],
    estados: ["No aplica — cada entrada es un registro factual"],
    flujos: ["Registro: specialist selecciona creador -> completa formulario de actividad", "Revision: manager revisa entradas y marca como revisadas", "Seguimiento: analisis de frecuencia y cobertura de promocion"],
    automatizaciones: ["Timestamps automaticos", "Vinculacion automatica con creador via creator_id"],
    kpis: ["Entradas por creador por periodo", "Cobertura de redes sociales", "Frecuencia de promocion", "Porcentaje con link de compra"],
    roles: ["Admin: CRUD completo", "Manager: lectura y revision", "Specialist: creacion y edicion", "Agent: sin acceso", "Closer: sin acceso"],
    logica: "Cada entrada en promolog_entries representa una actividad de promocion individual vinculada a un creador. El campo network indica la red social, contact_type el tipo de interaccion, y action_taken la accion especifica realizada. El campo reviewed_by permite rastrear quien reviso la entrada.",
  },
  {
    nombre: "LeadGen",
    objetivo: "Capturar, calificar y gestionar prospectos para la incorporacion de nuevos creadores a la agencia.",
    submodulos: ["Lista de leads", "Formulario de nuevo lead", "Modal de calificacion", "Conversion a contacto"],
    funcionalidades: ["Registro de prospectos con URL de perfil, plataforma, categoria y compania", "Asignacion de estado de calificacion", "Notas de seguimiento por lead", "Evidencias adjuntas (URLs)", "Conversion directa a contacto", "Filtrado por estado, plataforma y categoria"],
    estados: ["nuevo", "contactado", "calificado", "descartado"],
    flujos: ["Captura: agent registra prospecto con datos basicos", "Calificacion: evaluacion de potencial -> asignacion de calidad", "Seguimiento: notas y actualizaciones periodicas", "Conversion: lead calificado -> se crea como contacto en el modulo Contactos", "Descarte: lead no viable -> marcado como descartado con razon"],
    automatizaciones: ["Timestamps automaticos", "Creacion automatica de contacto al convertir un lead"],
    kpis: ["Total de leads por estado", "Tasa de conversion (lead a contacto)", "Leads por plataforma", "Leads por categoria", "Tiempo promedio de calificacion"],
    roles: ["Admin: CRUD completo", "Manager: CRUD completo", "Agent: CRUD completo", "Specialist: sin acceso", "Closer: sin acceso"],
    logica: "Los leads se almacenan en la tabla leads con notas asociadas en lead_notes. La conversion a contacto crea un nuevo registro en la tabla contactos trasladando datos relevantes del lead. El estado del lead avanza secuencialmente: nuevo -> contactado -> calificado -> convertido o descartado.",
  },
  {
    nombre: "Closers (Deals)",
    objetivo: "Gestionar el pipeline de acuerdos comerciales con seguimiento por etapas, desde el primer contacto hasta el cierre o perdida del deal.",
    submodulos: ["Pipeline de deals", "Formulario de nuevo deal", "KPI cards"],
    funcionalidades: ["Registro de deals con handle del prospecto, fuente y notas", "Avance por etapas del pipeline", "Asignacion a closer responsable", "Filtrado por etapa y asignacion", "Vista grid y tabla"],
    estados: ["Nuevo", "Contactado", "Llamada Agendada", "En Llamada", "No Show", "Cerrado", "Perdido"],
    flujos: ["Apertura: closer registra nuevo deal con datos del prospecto", "Avance: deal progresa por etapas segun interaccion comercial", "Cierre: deal marcado como Cerrado (exitoso) o Perdido", "Reasignacion: deal puede ser reasignado a otro closer"],
    automatizaciones: ["Timestamps automaticos de created_at y updated_at", "Vinculacion con company_id para segmentacion"],
    kpis: ["Total de deals por etapa", "Tasa de cierre (cerrados / total)", "Deals por closer", "Tiempo promedio por etapa", "Tasa de no-show"],
    roles: ["Admin: CRUD completo", "Manager: lectura", "Closer: CRUD completo", "Specialist: sin acceso", "Agent: sin acceso"],
    logica: "Los deals se almacenan en la tabla deals con un stage que representa la etapa actual del pipeline. Cada deal tiene un assigned_to que indica el closer responsable. El flujo es lineal pero permite saltos (por ejemplo, de Contactado directamente a En Llamada). Los deals cerrados o perdidos son estados finales.",
  },
  {
    nombre: "Tickets",
    objetivo: "Sistema de soporte interno para registrar, asignar y resolver incidencias vinculadas a creadores de la agencia.",
    submodulos: ["Lista de tickets", "Formulario de creacion", "Detalle con comentarios", "Filtros por estado, tipo y prioridad"],
    funcionalidades: ["Creacion de tickets vinculados a un creador", "Clasificacion por tipo (technical, billing, content, other)", "Asignacion de prioridad (low, medium, high, urgent)", "Sistema de comentarios internos por ticket", "Filtrado avanzado por multiples criterios", "Vista lista y grid"],
    estados: ["open", "in-progress", "resolved", "closed"],
    flujos: ["Apertura: usuario crea ticket vinculado a creador", "Asignacion: ticket se asigna a responsable", "Resolucion: responsable trabaja el ticket -> agrega comentarios -> resuelve", "Cierre: ticket resuelto se marca como closed"],
    automatizaciones: ["Timestamps automaticos", "Vinculacion automatica con creador via creator_id"],
    kpis: ["Tickets por estado", "Tickets por prioridad", "Tiempo promedio de resolucion", "Tickets por creador", "Tickets por tipo"],
    roles: ["Admin: CRUD completo", "Manager: CRUD completo", "Specialist: CRUD completo", "Agent: lectura", "Closer: lectura"],
    logica: "Los tickets se almacenan en la tabla tickets con comentarios en ticket_comments. Cada ticket esta vinculado a un creador (creator_id) y puede tener un responsable asignado (assigned_to). El flujo de estados es secuencial: open -> in-progress -> resolved -> closed. Los comentarios proporcionan trazabilidad del proceso de resolucion.",
  },
];

const ModuleBlock = ({ mod }: { mod: ModuleDoc }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <h3 className="text-sm font-semibold">{mod.nombre}</h3>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border p-5 space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1">Objetivo</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{mod.objetivo}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Submodulos</h4>
              <ul className="space-y-1">
                {mod.submodulos.map((s) => <li key={s} className="text-xs text-muted-foreground">— {s}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Estados</h4>
              <div className="flex flex-wrap gap-1.5">
                {mod.estados.map((e) => (
                  <span key={e} className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs">{e}</span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Funcionalidades Principales</h4>
            <ul className="space-y-1">
              {mod.funcionalidades.map((f) => <li key={f} className="text-xs text-muted-foreground">— {f}</li>)}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Flujos Internos</h4>
            <ul className="space-y-1">
              {mod.flujos.map((f) => <li key={f} className="text-xs text-muted-foreground">— {f}</li>)}
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Automatizaciones</h4>
              <ul className="space-y-1">
                {mod.automatizaciones.map((a) => <li key={a} className="text-xs text-muted-foreground">— {a}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">KPIs Asociados</h4>
              <ul className="space-y-1">
                {mod.kpis.map((k) => <li key={k} className="text-xs text-muted-foreground">— {k}</li>)}
              </ul>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Roles</h4>
            <ul className="space-y-1">
              {mod.roles.map((r) => <li key={r} className="text-xs text-muted-foreground">— {r}</li>)}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Logica de Negocio</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{mod.logica}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ModulosSection = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Documentacion por Modulo</h2>
      <p className="text-sm text-muted-foreground">
        Cada modulo se documenta con su objetivo, funcionalidades, estados, flujos, automatizaciones, KPIs, roles y logica de negocio. Expanda cada seccion para ver el detalle completo.
      </p>
      <div className="space-y-3">
        {modulesData.map((mod) => (
          <ModuleBlock key={mod.nombre} mod={mod} />
        ))}
      </div>
    </div>
  );
};

export default ModulosSection;
