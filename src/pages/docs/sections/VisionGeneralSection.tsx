import { Target, Users, ArrowRight, Layers } from "lucide-react";

const VisionGeneralSection = () => {
  return (
    <div className="space-y-12">
      {/* Proposito */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Proposito de la Plataforma</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Maven es una plataforma de gestion operativa disenada para agencias que administran creadores de contenido digital. Centraliza la operacion diaria, las ventas, la gestion de talento y el rendimiento financiero en un unico ecosistema integrado.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            La plataforma reemplaza la fragmentacion de herramientas dispersas (hojas de calculo, CRMs genericos, chats internos) con modulos especializados que cubren el ciclo completo: desde la captacion de prospectos hasta el analisis de ingresos por creador.
          </p>
        </div>
      </section>

      {/* Problema que resuelve */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Problema que Resuelve</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Fragmentacion de herramientas", desc: "Operaciones distribuidas en multiples plataformas sin integracion, generando duplicidad de datos y errores humanos." },
            { title: "Falta de visibilidad", desc: "Ausencia de dashboards unificados para monitorear KPIs de ventas, rendimiento de creadores y estado de operaciones en tiempo real." },
            { title: "Ineficiencias operativas", desc: "Procesos manuales repetitivos, falta de automatizaciones y ausencia de flujos estandarizados para tareas criticas." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-card p-5 space-y-2">
              <h3 className="text-sm font-medium">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tipos de usuarios */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Tipos de Usuarios</h2>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 font-medium">Rol</th>
                <th className="text-left p-3 font-medium">Descripcion</th>
                <th className="text-left p-3 font-medium">Acceso principal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { rol: "Admin", desc: "Control total del sistema, configuracion y reportes ejecutivos", acceso: "Todos los modulos" },
                { rol: "Manager / Supervisor", desc: "Gestion de equipos, asignacion de creadores, supervision operativa", acceso: "Dashboard, Creadores, Eventos, Sales, Tareas" },
                { rol: "Specialist / Chatter", desc: "Operacion directa con creadores, seguimiento de contenido y promociones", acceso: "Creadores, Promolog, Tickets" },
                { rol: "Agent (LeadGen)", desc: "Captacion y calificacion de prospectos para incorporacion de nuevos creadores", acceso: "LeadGen, Contactos" },
                { rol: "Closer", desc: "Cierre de acuerdos comerciales, gestion de pipeline de deals", acceso: "Closers, Dashboard" },
              ].map((row) => (
                <tr key={row.rol}>
                  <td className="p-3 font-medium">{row.rol}</td>
                  <td className="p-3 text-muted-foreground">{row.desc}</td>
                  <td className="p-3 text-muted-foreground">{row.acceso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Flujo general */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Flujo General del Sistema</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            {["Lead (Prospecto)", "Contacto", "Creador", "Onboarding", "Operacion Activa", "Monetizacion", "Reportes y Analisis"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3">
                <div className="rounded-md border border-border bg-muted/50 px-4 py-2">{step}</div>
                {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            El flujo principal representa el ciclo de vida completo de un creador dentro de la agencia, desde su captacion como prospecto hasta el analisis de su rendimiento financiero. Cada etapa esta soportada por uno o mas modulos del sistema.
          </p>
        </div>
      </section>

      {/* Modulos principales */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Modulos Principales</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { mod: "Dashboard", desc: "Centro de mando con KPIs globales y metricas de rendimiento consolidadas." },
            { mod: "Contactos", desc: "Registro y seguimiento de contactos comerciales con flujo de calificacion." },
            { mod: "Tareas", desc: "Gestion de tareas por proyecto con asignacion, deadlines y comparticion externa." },
            { mod: "Creadores", desc: "Ficha integral del creador con informacion operativa, financiera y documental." },
            { mod: "Eventos", desc: "Planificacion, ejecucion y seguimiento de eventos con listas de invitados." },
            { mod: "Creator Sales", desc: "Dashboard de ventas, reportes de ingresos, comparativas y analisis con IA." },
            { mod: "Promolog", desc: "Registro de promociones realizadas por creadores en redes sociales." },
            { mod: "LeadGen", desc: "Captura y calificacion de prospectos con flujo de conversion." },
            { mod: "Closers", desc: "Pipeline de deals con seguimiento de etapas de cierre comercial." },
            { mod: "Tickets", desc: "Sistema de soporte interno vinculado a creadores con prioridades y estados." },
          ].map((item) => (
            <div key={item.mod} className="rounded-lg border border-border bg-card p-4 space-y-1">
              <h3 className="text-sm font-medium">{item.mod}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default VisionGeneralSection;
