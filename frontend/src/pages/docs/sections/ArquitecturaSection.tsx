import { Network, ArrowRight, Shield, Server } from "lucide-react";

const ArquitecturaSection = () => {
  const moduleGroups = [
    {
      category: "Gestion",
      modules: ["Dashboard", "Contactos", "Tareas"],
    },
    {
      category: "Talento",
      modules: ["Creadores", "Eventos"],
    },
    {
      category: "Ventas",
      modules: ["Creator Sales", "Closers", "LeadGen"],
    },
    {
      category: "Operaciones",
      modules: ["Promolog", "Tickets"],
    },
    {
      category: "Recursos",
      modules: ["Design System", "Documentacion"],
    },
  ];

  const dependencies = [
    { modulo: "Dashboard", depende: "Creators, Deals, OF Gross Earnings", tipo: "Lectura agregada" },
    { modulo: "Contactos", depende: "Ninguno", tipo: "Independiente" },
    { modulo: "Tareas", depende: "Profiles, Task Projects", tipo: "Asignacion por usuario" },
    { modulo: "Creadores", depende: "Creator Business, Guidelines, Notes, Documents, History, Monetization", tipo: "Composicion" },
    { modulo: "Eventos", depende: "Creators (invitados), Event Guests, Checklist Items", tipo: "Relacion referencial" },
    { modulo: "Creator Sales", depende: "OF Gross Earnings, Creators", tipo: "Lectura analitica" },
    { modulo: "Promolog", depende: "Creators", tipo: "Referencia directa" },
    { modulo: "LeadGen", depende: "Leads, Lead Notes, Contactos (conversion)", tipo: "Flujo secuencial" },
    { modulo: "Closers", depende: "Deals, Profiles", tipo: "Pipeline" },
    { modulo: "Tickets", depende: "Creators, Ticket Comments", tipo: "Soporte vinculado" },
  ];

  const permisos = [
    { modulo: "Dashboard", admin: "Completo", manager: "Completo", specialist: "Lectura", agent: "Lectura", closer: "Lectura" },
    { modulo: "Contactos", admin: "Completo", manager: "Completo", specialist: "No", agent: "Completo", closer: "No" },
    { modulo: "Tareas", admin: "Completo", manager: "Completo", specialist: "Asignadas", agent: "Asignadas", closer: "Asignadas" },
    { modulo: "Creadores", admin: "Completo", manager: "Completo", specialist: "Asignados", agent: "No", closer: "No" },
    { modulo: "Eventos", admin: "Completo", manager: "Completo", specialist: "Lectura", agent: "No", closer: "No" },
    { modulo: "Creator Sales", admin: "Completo", manager: "Completo", specialist: "No", agent: "No", closer: "No" },
    { modulo: "Promolog", admin: "Completo", manager: "Lectura", specialist: "Completo", agent: "No", closer: "No" },
    { modulo: "LeadGen", admin: "Completo", manager: "Completo", specialist: "No", agent: "Completo", closer: "No" },
    { modulo: "Closers", admin: "Completo", manager: "Lectura", specialist: "No", agent: "No", closer: "Completo" },
    { modulo: "Tickets", admin: "Completo", manager: "Completo", specialist: "Completo", agent: "Lectura", closer: "Lectura" },
  ];

  return (
    <div className="space-y-12">
      {/* Mapa de modulos */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Mapa de Modulos</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {moduleGroups.map((group) => (
            <div key={group.category} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.category}</h3>
              <div className="space-y-1.5">
                {group.modules.map((mod) => (
                  <div key={mod} className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium">{mod}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Flujo de datos */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Flujo de Datos</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            {["Lead", "Contacto", "Creador", "Operacion", "Monetizacion", "Reportes"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-3">
                <div className="rounded-md border border-border bg-muted/50 px-4 py-2">{step}</div>
                {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">Lead a Contacto:</span> Un prospecto calificado en LeadGen se convierte en contacto registrado en el modulo Contactos.</p>
            <p><span className="font-medium text-foreground">Contacto a Creador:</span> Cuando un contacto firma acuerdo, se crea su ficha completa en Creadores con toda la informacion operativa.</p>
            <p><span className="font-medium text-foreground">Operacion a Monetizacion:</span> La actividad diaria (Promolog, Eventos, Tickets) alimenta el seguimiento de rendimiento y monetizacion.</p>
            <p><span className="font-medium text-foreground">Monetizacion a Reportes:</span> Los datos de ingresos (OF Gross Earnings) se consolidan en Creator Sales para analisis y toma de decisiones.</p>
          </div>
        </div>
      </section>

      {/* Dependencias */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Relaciones y Dependencias</h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 font-medium">Modulo</th>
                <th className="text-left p-3 font-medium">Depende de</th>
                <th className="text-left p-3 font-medium">Tipo de relacion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dependencies.map((d) => (
                <tr key={d.modulo}>
                  <td className="p-3 font-medium">{d.modulo}</td>
                  <td className="p-3 text-muted-foreground">{d.depende}</td>
                  <td className="p-3 text-muted-foreground">{d.tipo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Permisos por rol */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Permisos por Rol</h2>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 font-medium">Modulo</th>
                <th className="text-left p-3 font-medium">Admin</th>
                <th className="text-left p-3 font-medium">Manager</th>
                <th className="text-left p-3 font-medium">Specialist</th>
                <th className="text-left p-3 font-medium">Agent</th>
                <th className="text-left p-3 font-medium">Closer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permisos.map((p) => (
                <tr key={p.modulo}>
                  <td className="p-3 font-medium">{p.modulo}</td>
                  <td className="p-3 text-muted-foreground">{p.admin}</td>
                  <td className="p-3 text-muted-foreground">{p.manager}</td>
                  <td className="p-3 text-muted-foreground">{p.specialist}</td>
                  <td className="p-3 text-muted-foreground">{p.agent}</td>
                  <td className="p-3 text-muted-foreground">{p.closer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stack tecnologico */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Stack Tecnologico</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { tech: "React 18", desc: "Framework de interfaz de usuario con componentes reutilizables y renderizado declarativo." },
            { tech: "Supabase", desc: "Backend-as-a-Service con base de datos PostgreSQL, autenticacion, almacenamiento y Edge Functions." },
            { tech: "TanStack Query", desc: "Gestion de estado asincronico con cache inteligente, revalidacion automatica y optimistic updates." },
            { tech: "Tailwind CSS", desc: "Framework de utilidades CSS con sistema de tokens de diseno, soporte dark mode y componentes shadcn/ui." },
          ].map((item) => (
            <div key={item.tech} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h3 className="text-sm font-medium">{item.tech}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ArquitecturaSection;
