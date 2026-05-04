import { TrendingUp, Building2, Users, RefreshCw, Puzzle } from "lucide-react";

const EscalabilidadSection = () => {
  return (
    <div className="space-y-12">
      {/* Multi-tenant */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Arquitectura Multi-Tenant</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Maven implementa un modelo multi-tenant basado en el campo <code className="text-xs bg-muted px-1.5 py-0.5 rounded">company_id</code> presente en las tablas principales del sistema. Este campo permite segmentar los datos por organizacion, garantizando que cada agencia opera sobre un conjunto de datos aislado.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Las politicas de Row Level Security (RLS) en Supabase utilizan este campo para filtrar automaticamente los registros segun la compania del usuario autenticado. Esto asegura aislamiento de datos sin necesidad de logica adicional en el frontend.
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4 mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tablas con soporte multi-tenant</h4>
            <div className="flex flex-wrap gap-2">
              {["task_projects", "tasks", "deals", "profiles", "creators", "events"].map((t) => (
                <span key={t} className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-mono">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Multiples creadoras */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Soporte para Multiples Creadores</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            El sistema no impone limites en la cantidad de creadores registrados. La tabla <code className="text-xs bg-muted px-1.5 py-0.5 rounded">creators</code> utiliza UUIDs como identificadores primarios, lo que elimina restricciones de escalado en la capa de datos.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cada creador mantiene relaciones con multiples tablas satelite (business, guidelines, notes, documents, history, monetization, payments, training) que se escalan horizontalmente sin afectar el rendimiento de consultas gracias a indices en <code className="text-xs bg-muted px-1.5 py-0.5 rounded">creator_id</code>.
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estrategias de rendimiento</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>— Paginacion en listados para evitar carga completa de registros</li>
              <li>— Cache inteligente con TanStack Query (staleTime, cacheTime configurables)</li>
              <li>— Consultas optimizadas con seleccion de columnas especificas</li>
              <li>— Indices en campos de busqueda y filtrado frecuente</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Multiples equipos */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Soporte para Multiples Equipos</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            La asignacion de equipos se gestiona a traves de multiples campos en las tablas de creadores y asignaciones. Cada creador puede tener asignados un manager, un specialist y un closer de forma independiente.
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Modelo de asignacion</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 font-medium">Campo</th>
                    <th className="text-left p-2 font-medium">Tabla</th>
                    <th className="text-left p-2 font-medium">Proposito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="p-2 font-mono">assigned_manager_profile_id</td><td className="p-2 text-muted-foreground">creators / creator_business</td><td className="p-2 text-muted-foreground">Manager responsable</td></tr>
                  <tr><td className="p-2 font-mono">assigned_specialist_profile_id</td><td className="p-2 text-muted-foreground">creators / creator_business</td><td className="p-2 text-muted-foreground">Specialist asignado</td></tr>
                  <tr><td className="p-2 font-mono">closer_responsible_profile_id</td><td className="p-2 text-muted-foreground">creators / creator_business</td><td className="p-2 text-muted-foreground">Closer responsable</td></tr>
                  <tr><td className="p-2 font-mono">assigned_to</td><td className="p-2 text-muted-foreground">tasks / deals / tickets</td><td className="p-2 text-muted-foreground">Responsable operativo</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            La tabla <code className="text-xs bg-muted px-1.5 py-0.5 rounded">user_roles</code> define los permisos de cada usuario (admin, manager, employee), lo que permite controlar el acceso a modulos y funcionalidades segun el rol asignado.
          </p>
        </div>
      </section>

      {/* Prevencion de reprocesos */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Prevencion de Reprocesos</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Estados inmutables", desc: "Cada entidad tiene un flujo de estados definido. Las transiciones son controladas y registradas, evitando regresiones accidentales." },
              { title: "Historial y trazabilidad", desc: "La tabla creator_history y event_attendance_log registran cada cambio con usuario, timestamp y valores anterior/nuevo." },
              { title: "Timestamps automaticos", desc: "Todos los registros incluyen created_at y updated_at gestionados automaticamente, proporcionando auditoria temporal completa." },
              { title: "Validaciones en origen", desc: "Los formularios implementan validacion de campos obligatorios y formatos antes de enviar datos al backend, previniendo registros incompletos." },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
                <h4 className="text-sm font-medium">{item.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Crecimiento modular */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Estrategia de Crecimiento Modular</h2>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Maven esta disenada con una arquitectura modular que permite agregar nuevos modulos sin afectar los existentes. Cada modulo opera como una unidad independiente con sus propias rutas, componentes y hooks, conectandose al ecosistema a traves de interfaces compartidas.
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Patron de extension</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>— Crear nueva carpeta en <code className="bg-muted px-1 py-0.5 rounded">src/pages/[modulo]</code></li>
              <li>— Implementar componente wrapper con layout estandar (Sidebar + Topbar)</li>
              <li>— Agregar ruta protegida en <code className="bg-muted px-1 py-0.5 rounded">App.tsx</code></li>
              <li>— Registrar en el sidebar bajo el grupo correspondiente</li>
              <li>— Crear tablas en Supabase con RLS y company_id si aplica</li>
              <li>— Implementar hooks personalizados con TanStack Query para gestion de datos</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Este patron garantiza consistencia visual y funcional entre modulos, reduce el tiempo de desarrollo de nuevas funcionalidades y facilita el mantenimiento a largo plazo del sistema.
          </p>
        </div>
      </section>
    </div>
  );
};

export default EscalabilidadSection;
