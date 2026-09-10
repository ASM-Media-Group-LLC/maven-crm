// Radios del rediseño (09/2026): tres por ROL más `rounded-full`. La escala por
// tamaño (sm/md/lg/xl/2xl/3xl) sigue existiendo para shadcn, pero en las
// pantallas queda en retirada: el test de contrato la rechaza en pantallas nuevas.
const radios = [
  { name: "control", className: "rounded-control", value: "8px", usage: "Botones, inputs, chips rectangulares, celdas." },
  { name: "panel", className: "rounded-panel", value: "12px", usage: "Paneles, tarjetas de lista, popovers." },
  { name: "card", className: "rounded-card", value: "16px", usage: "Tarjetas grandes, modales, hojas inferiores." },
  { name: "full", className: "rounded-full", value: "9999px", usage: "Chips, avatares, indicadores." },
];

const enRetirada = [
  { vieja: "rounded-sm", px: "8px", ahora: "8px", nueva: "rounded-control" },
  { vieja: "rounded-md", px: "10px", ahora: "8px", nueva: "rounded-control" },
  { vieja: "rounded-lg", px: "12px", ahora: "12px", nueva: "rounded-panel" },
  { vieja: "rounded-xl", px: "12px", ahora: "12px", nueva: "rounded-panel" },
  { vieja: "rounded-2xl", px: "16px", ahora: "16px", nueva: "rounded-card" },
  { vieja: "rounded-3xl", px: "24px", ahora: "16px", nueva: "rounded-card" },
];

export const BordersSection = () => (
  <section id="borders" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.4 Bordes y radios</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Tres radios, elegidos por el rol del elemento y no por su tamaño, más <code className="font-mono text-primary">rounded-full</code>.
        El token base sigue siendo <code className="font-mono text-primary">--radius: 0.75rem</code> (lo usan los
        componentes shadcn). Siete radios distintos conviviendo era una de las razones de que nada pareciera de la misma familia.
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Los tres radios</h3>
      <div className="flex flex-wrap gap-8">
        {radios.map((r) => (
          <div key={r.name} className="flex flex-col items-center gap-2 max-w-[140px]">
            <div className={`w-20 h-20 bg-primary ${r.className}`} />
            <p className="text-sm font-medium">{r.name} <span className="text-muted-foreground font-mono text-xs">{r.value}</span></p>
            <p className="text-xs text-muted-foreground font-mono text-center">{r.className}</p>
            <p className="text-xs text-muted-foreground text-center">{r.usage}</p>
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">En retirada</h3>
      <p className="text-sm text-muted-foreground mb-4">
        La escala por tamaño quedó re-pineada a los tres radios en la configuración de Tailwind (corte 5 de la fase 2): sm y md
        miden 8, lg y xl 12, 2xl y 3xl 16. Así nada se dibuja fuera del sistema aunque una pantalla vieja siga usando el nombre
        viejo; los nombres se reemplazan por rol en cada pantalla que se toca. Equivalencias:
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm max-w-xl">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 font-medium">Clase vieja</th>
              <th className="pb-2 pr-4 font-medium">Medía</th>
              <th className="pb-2 pr-4 font-medium">Mide ahora</th>
              <th className="pb-2 font-medium">Pasa a</th>
            </tr>
          </thead>
          <tbody>
            {enRetirada.map((r) => (
              <tr key={r.vieja} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-xs text-destructive line-through">{r.vieja}</td>
                <td className="py-2 pr-4 text-muted-foreground">{r.px}</td>
                <td className="py-2 pr-4 text-muted-foreground">{r.ahora}</td>
                <td className="py-2 font-mono text-xs text-primary">{r.nueva}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Borde por defecto: <code className="font-mono text-foreground">border border-border</code> (hairline). Es lo que separa filas dentro de un panel; nunca otra tarjeta.</li>
        <li>Borde de inputs: <code className="font-mono text-foreground">border border-input</code></li>
        <li>Sombra solo en el realce: una cosa por pantalla (el protagonista, un modal, la fila activa).</li>
        <li>Los hijos nunca tienen un radio mayor que el padre.</li>
      </ul>
    </div>
  </section>
);
