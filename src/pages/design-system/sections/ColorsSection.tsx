const brandColors = [
  { name: "primary", variable: "--primary", value: "211 100% 50%", desc: "Color principal de acción. Botones primarios, links activos, elementos interactivos destacados." },
  { name: "primary-foreground", variable: "--primary-foreground", value: "0 0% 100%", desc: "Texto sobre fondos primary." },
  { name: "accent", variable: "--accent", value: "271 91% 50%", desc: "Color de énfasis. Destacar elementos secundarios, hover en menús, badges especiales." },
  { name: "accent-foreground", variable: "--accent-foreground", value: "0 0% 100%", desc: "Texto sobre fondos accent." },
];

const neutralColors = [
  { name: "background", variable: "--background", value: "240 8% 10%", desc: "Fondo principal de la aplicación." },
  { name: "foreground", variable: "--foreground", value: "240 5% 96%", desc: "Color de texto principal sobre background." },
  { name: "card", variable: "--card", value: "240 6% 13%", desc: "Fondo de tarjetas y contenedores elevados." },
  { name: "card-foreground", variable: "--card-foreground", value: "240 5% 96%", desc: "Texto dentro de tarjetas." },
  { name: "muted", variable: "--muted", value: "240 6% 15%", desc: "Fondos atenuados, secciones secundarias." },
  { name: "muted-foreground", variable: "--muted-foreground", value: "240 5% 65%", desc: "Texto secundario, placeholders, descripciones." },
  { name: "popover", variable: "--popover", value: "240 6% 13%", desc: "Fondo de popovers y dropdowns." },
  { name: "popover-foreground", variable: "--popover-foreground", value: "240 5% 96%", desc: "Texto en popovers." },
  { name: "border", variable: "--border", value: "240 6% 18%", desc: "Bordes por defecto en todos los componentes." },
  { name: "input", variable: "--input", value: "240 6% 18%", desc: "Bordes de inputs y form controls." },
  { name: "ring", variable: "--ring", value: "211 100% 50%", desc: "Anillo de focus-visible en elementos interactivos." },
];

const stateColors = [
  { name: "success", variable: "--success", value: "145 63% 32%", desc: "Confirmaciones, acciones completadas, validaciones positivas." },
  { name: "success-foreground", variable: "--success-foreground", value: "0 0% 100%", desc: "Texto sobre fondos success." },
  { name: "warning", variable: "--warning", value: "40 96% 40%", desc: "Advertencias, acciones que requieren atención." },
  { name: "warning-foreground", variable: "--warning-foreground", value: "0 0% 100%", desc: "Texto sobre fondos warning." },
  { name: "destructive", variable: "--destructive", value: "0 84% 60%", desc: "Acciones destructivas, errores, eliminaciones." },
  { name: "destructive-foreground", variable: "--destructive-foreground", value: "0 0% 100%", desc: "Texto sobre fondos destructive." },
];

const instagramColors = [
  { name: "instagram-pink", variable: "--instagram-pink", value: "340 82% 59%" },
  { name: "instagram-purple", variable: "--instagram-purple", value: "271 91% 50%" },
  { name: "instagram-orange", variable: "--instagram-orange", value: "25 95% 53%" },
];

const opacities = [
  { value: "/90", usage: "Hover en botones sólidos", example: "hover:bg-primary/90" },
  { value: "/80", usage: "Hover en botones secondary", example: "hover:bg-secondary/80" },
  { value: "/50", usage: "Estado disabled, elementos inactivos", example: "disabled:opacity-50" },
  { value: "/15", usage: "Soft backgrounds para badges y tags", example: "bg-primary/15 text-primary" },
  { value: "/10", usage: "Fondos sutiles, separadores visuales", example: "bg-accent/10" },
];

const ColorGroup = ({ title, colors, showDesc = true }: { title: string; colors: Array<{ name: string; variable: string; value: string; desc?: string }>; showDesc?: boolean }) => (
  <div>
    <h3 className="text-xl font-medium mb-4 text-muted-foreground">{title}</h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {colors.map((c) => (
        <div key={c.name} className="space-y-2">
          <div
            className="h-20 rounded-lg border border-border"
            style={{ backgroundColor: `hsl(${c.value})` }}
          />
          <p className="text-sm font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{c.value}</p>
          {showDesc && c.desc && (
            <p className="text-xs text-muted-foreground">{c.desc}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);

export const ColorsSection = () => (
  <section id="colors" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.1 Colores</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Todos los colores del sistema están definidos como variables CSS en formato HSL.
        Usar siempre los tokens semánticos — nunca valores hex o rgb directos en componentes.
        Actualmente el sistema usa un único tema oscuro como base.
      </p>
    </div>

    <ColorGroup title="Brand" colors={brandColors} />
    <ColorGroup title="Neutrales" colors={neutralColors} />
    <ColorGroup title="Estados" colors={stateColors} />
    <ColorGroup title="Instagram" colors={instagramColors} showDesc={false} />

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Opacidades estándar</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Usar exclusivamente estas opacidades. Prohibido inventar valores intermedios.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 font-medium">Opacidad</th>
              <th className="pb-2 pr-4 font-medium">Uso</th>
              <th className="pb-2 font-medium font-mono">Ejemplo</th>
            </tr>
          </thead>
          <tbody>
            {opacities.map((o) => (
              <tr key={o.value} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-primary">{o.value}</td>
                <td className="py-2 pr-4 text-muted-foreground">{o.usage}</td>
                <td className="py-2 font-mono text-xs text-muted-foreground">{o.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
);
