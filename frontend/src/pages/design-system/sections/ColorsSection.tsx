const brandColors = [
  { name: "primary", tw: "bg-primary", lightValue: "211 100% 50%", darkValue: "211 100% 50%", desc: "Color principal de acción. Botones primarios, links activos, elementos interactivos destacados." },
  { name: "primary-foreground", tw: "bg-primary-foreground", lightValue: "0 0% 100%", darkValue: "0 0% 100%", desc: "Texto sobre fondos primary." },
  { name: "accent", tw: "bg-accent", lightValue: "271 91% 50%", darkValue: "271 91% 50%", desc: "Color de énfasis. Destacar elementos secundarios, hover en menús, badges especiales." },
  { name: "accent-foreground", tw: "bg-accent-foreground", lightValue: "0 0% 100%", darkValue: "0 0% 100%", desc: "Texto sobre fondos accent." },
];

const neutralColors = [
  { name: "background", tw: "bg-background", lightValue: "0 0% 100%", darkValue: "227 24% 7%", desc: "Fondo principal de la aplicación." },
  { name: "foreground", tw: "bg-foreground", lightValue: "240 10% 4%", darkValue: "240 5% 96%", desc: "Color de texto principal sobre background." },
  { name: "card", tw: "bg-card", lightValue: "0 0% 100%", darkValue: "227 30% 12%", desc: "Fondo de tarjetas y contenedores elevados." },
  { name: "card-foreground", tw: "bg-card-foreground", lightValue: "240 10% 4%", darkValue: "240 5% 96%", desc: "Texto dentro de tarjetas." },
  { name: "muted", tw: "bg-muted", lightValue: "240 5% 96%", darkValue: "227 27% 14%", desc: "Fondos atenuados, secciones secundarias." },
  { name: "muted-foreground", tw: "bg-muted-foreground", lightValue: "240 4% 46%", darkValue: "225 15% 63%", desc: "Texto secundario, placeholders, descripciones." },
  { name: "popover", tw: "bg-popover", lightValue: "0 0% 100%", darkValue: "227 30% 12%", desc: "Fondo de popovers y dropdowns." },
  { name: "popover-foreground", tw: "bg-popover-foreground", lightValue: "240 10% 4%", darkValue: "240 5% 96%", desc: "Texto en popovers." },
  { name: "border", tw: "bg-border", lightValue: "240 6% 90%", darkValue: "225 26% 17%", desc: "Bordes por defecto en todos los componentes." },
  { name: "input", tw: "bg-input", lightValue: "240 6% 90%", darkValue: "225 26% 17%", desc: "Bordes de inputs y form controls." },
  { name: "ring", tw: "bg-ring", lightValue: "211 100% 50%", darkValue: "211 100% 50%", desc: "Anillo de focus-visible en elementos interactivos." },
];

const stateColors = [
  { name: "success", tw: "bg-success", lightValue: "145 63% 32%", darkValue: "150 56% 47%", desc: "Confirmaciones, acciones completadas, validaciones positivas." },
  { name: "success-foreground", tw: "bg-success-foreground", lightValue: "0 0% 100%", darkValue: "145 80% 8%", desc: "Texto sobre fondos success." },
  { name: "warning", tw: "bg-warning", lightValue: "40 96% 40%", darkValue: "40 92% 56%", desc: "Advertencias, acciones que requieren atención." },
  { name: "warning-foreground", tw: "bg-warning-foreground", lightValue: "0 0% 100%", darkValue: "40 90% 10%", desc: "Texto sobre fondos warning." },
  { name: "destructive", tw: "bg-destructive", lightValue: "0 84% 60%", darkValue: "0 84% 60%", desc: "Acciones destructivas, errores, eliminaciones." },
  { name: "destructive-foreground", tw: "bg-destructive-foreground", lightValue: "0 0% 100%", darkValue: "0 0% 100%", desc: "Texto sobre fondos destructive." },
];

// Colores de canal: solo marcan canal (icono, chip, burbuja de Telegram). Nunca significan estado.
const canalColors = [
  { name: "whatsapp", tw: "bg-whatsapp", lightValue: "142 70% 49%", darkValue: "142 70% 49%", desc: "Verde WhatsApp (#25D366). Icono y chip del canal, badge de la bandeja." },
  { name: "telegram", tw: "bg-telegram", lightValue: "199 73% 54%", darkValue: "199 73% 54%", desc: "Celeste Telegram (#34AADF). Burbuja saliente y chip de la bandeja de Telegram." },
];

const instagramColors = [
  { name: "instagram-pink", tw: "bg-instagram-pink", lightValue: "340 82% 59%", darkValue: "340 82% 59%" },
  { name: "instagram-purple", tw: "bg-instagram-purple", lightValue: "271 91% 50%", darkValue: "271 91% 50%" },
  { name: "instagram-orange", tw: "bg-instagram-orange", lightValue: "25 95% 53%", darkValue: "25 95% 53%" },
];

const opacities = [
  { value: "/90", usage: "Hover en botones sólidos", example: "hover:bg-primary/90" },
  { value: "/80", usage: "Hover en botones secondary", example: "hover:bg-secondary/80" },
  { value: "/50", usage: "Estado disabled, elementos inactivos", example: "disabled:opacity-50" },
  { value: "/15", usage: "Soft backgrounds para badges y tags", example: "bg-primary/15 text-primary" },
  { value: "/10", usage: "Fondos sutiles, separadores visuales", example: "bg-accent/10" },
];

const ColorGroup = ({ title, colors, showDesc = true }: { title: string; colors: Array<{ name: string; tw: string; lightValue: string; darkValue: string; desc?: string }>; showDesc?: boolean }) => (
  <div>
    <h3 className="text-xl font-medium mb-4 text-muted-foreground">{title}</h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {colors.map((c) => (
        <div key={c.name} className="space-y-2">
          <div className={`h-20 rounded-lg border border-border ${c.tw}`} />
          <p className="text-sm font-medium">{c.name}</p>
          <div className="text-xs text-muted-foreground font-mono space-y-0.5">
            <p><span className="text-muted-foreground/60">L:</span> {c.lightValue}</p>
            <p><span className="text-muted-foreground/60">D:</span> {c.darkValue}</p>
          </div>
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
        Seis roles y nada más tiene color propio: el acento de marca (primary, accent y su degradé) para acción y foco;
        success, warning y destructive solo para estado; whatsapp y telegram solo para marcar canal. Todo son variables
        CSS en HSL con tema claro y oscuro; los swatches reflejan el tema activo. Nunca clases crudas de Tailwind
        (emerald-500, amber-300) en una pantalla: las paletas decorativas (avatares, categorías) viven en lib/.
      </p>
    </div>

    <ColorGroup title="Brand" colors={brandColors} />
    <ColorGroup title="Neutrales" colors={neutralColors} />
    <ColorGroup title="Estados" colors={stateColors} />
    <ColorGroup title="Canales" colors={canalColors} />
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
