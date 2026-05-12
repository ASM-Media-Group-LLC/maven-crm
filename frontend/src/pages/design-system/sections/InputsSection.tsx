import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";

export const InputsSection = () => {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [singleDate, setSingleDate] = useState<string>("");

  return (
  <section id="inputs" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.2 Inputs</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Controles de formulario. Todos comparten los mismos tokens de borde (<code className="font-mono text-primary">border-input</code>),
        focus (<code className="font-mono text-primary">ring-ring</code>) y disabled (<code className="font-mono text-primary">opacity-50</code>).
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Text Input</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <div className="space-y-2">
          <Label>Default</Label>
          <Input placeholder="Escribe algo..." />
        </div>
        <div className="space-y-2">
          <Label>Disabled</Label>
          <Input placeholder="No disponible" disabled />
        </div>
        <div className="space-y-2">
          <Label className="text-destructive">Con error</Label>
          <Input placeholder="Email inválido" className="border-destructive focus-visible:ring-destructive" />
          <p className="text-xs text-destructive">Este campo es requerido</p>
        </div>
        <div className="space-y-2">
          <Label>Con valor</Label>
          <Input defaultValue="usuario@ejemplo.com" />
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Select</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <div className="space-y-2">
          <Label>Default</Label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar opción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Opción A</SelectItem>
              <SelectItem value="b">Opción B</SelectItem>
              <SelectItem value="c">Opción C</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Disabled</Label>
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="No disponible" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Opción A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Textarea</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <div className="space-y-2">
          <Label>Default</Label>
          <Textarea placeholder="Escribe un comentario..." />
        </div>
        <div className="space-y-2">
          <Label>Disabled</Label>
          <Textarea placeholder="No disponible" disabled />
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Booleanos</h3>
      <div className="flex flex-wrap gap-8">
        <div className="flex items-center gap-2">
          <Checkbox id="check-demo" />
          <Label htmlFor="check-demo">Checkbox</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="check-checked" defaultChecked />
          <Label htmlFor="check-checked">Checked</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="check-disabled" disabled />
          <Label htmlFor="check-disabled" className="text-muted-foreground">Disabled</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="switch-demo" />
          <Label htmlFor="switch-demo">Switch</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="switch-checked" defaultChecked />
          <Label htmlFor="switch-checked">Active</Label>
        </div>
      </div>
    </div>

    {/* Tab Bars */}
    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Tab Bars & Filtros</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Patrón de navegación local y filtros inline. Las Tab Bars usan <code className="font-mono text-primary">variant="secondary"</code> (activo)
        y <code className="font-mono text-primary">variant="ghost"</code> (inactivo).
      </p>

      <div className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Tab Bar inline</Label>
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <Button variant="secondary" size="sm">Activo</Button>
            <Button variant="ghost" size="sm">Inactivo</Button>
            <Button variant="ghost" size="sm">Inactivo</Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Select Filter (placeholder descriptivo)</Label>
          <div className="flex gap-3">
            <Select>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="a">Categoría A</SelectItem>
                <SelectItem value="b">Categoría B</SelectItem>
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Tab Bar:</strong> <code className="font-mono text-foreground">inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1</code></p>
          <p><strong className="text-foreground">Select Filters:</strong> placeholder = nombre del campo, nunca "Todos". La opción "Todos" solo aparece dentro del dropdown.</p>
          <p><strong className="text-foreground">Value:</strong> cuando no hay filtro activo, <code className="font-mono text-foreground">value={undefined}</code> para que el placeholder sea visible.</p>
        </div>
      </div>
    </div>

    {/* Date Input */}
    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Date Input</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Selector de fecha individual con trigger unificado y calendario interactivo. Incluye un header custom con
        selectores estilizados de mes (grid 4×3) y año (lista scrolleable) usando popovers Shadcn, flechas de navegación
        mes a mes, entrada manual <code className="font-mono text-primary">dd/mm/aaaa</code> y footer con Cancelar/Aplicar.
        Totalmente consistente con el design system — sin dropdowns nativos del navegador.
        Ideal para fechas de nacimiento, fechas de inicio, vencimientos, etc.
      </p>
      <div className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Default</Label>
          <DateInput
            value={singleDate}
            onChange={setSingleDate}
          />
        </div>
        <div className="space-y-2">
          <Label>Con valor</Label>
          <DateInput
            value="1995-06-15"
            onChange={() => {}}
            placeholder="Fecha de nacimiento"
          />
        </div>
        <div className="space-y-2">
          <Label>Disabled</Label>
          <DateInput
            value=""
            onChange={() => {}}
            disabled
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Props:</strong></p>
          <p><code className="font-mono text-foreground">value</code>: <code className="font-mono">string</code> (formato <code className="font-mono">yyyy-MM-dd</code>)</p>
          <p><code className="font-mono text-foreground">onChange</code>: <code className="font-mono">(value: string) =&gt; void</code></p>
          <p><code className="font-mono text-foreground">placeholder?</code>: <code className="font-mono">string</code> (default: "Seleccionar fecha")</p>
          <p><code className="font-mono text-foreground">disabled?</code>: <code className="font-mono">boolean</code></p>
          <p><code className="font-mono text-foreground">fromYear?</code>: <code className="font-mono">number</code> (default: 1940)</p>
          <p><code className="font-mono text-foreground">toYear?</code>: <code className="font-mono">number</code> (default: año actual + 5)</p>
          <p className="mt-2"><strong className="text-foreground">Navegación:</strong> Header custom con flechas ◂/▸, popover de meses (grid 4×3) y popover de años (ScrollArea). Sin <code className="font-mono text-foreground">&lt;select&gt;</code> nativos.</p>
          <p className="mt-2"><strong className="text-foreground">Cuándo usar:</strong> Fechas individuales (nacimiento, inicio, vencimiento). Para rangos usar <code className="font-mono text-foreground">DateRangePicker</code>.</p>
        </div>
      </div>
    </div>

    {/* Date Range Picker */}
    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Date Range Picker</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Componente para selección de rangos de fecha con presets rápidos, dos calendarios y entrada manual.
      </p>
      <div className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Default</Label>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Props:</strong></p>
          <p><code className="font-mono text-foreground">from</code>: <code className="font-mono">Date | undefined</code></p>
          <p><code className="font-mono text-foreground">to</code>: <code className="font-mono">Date | undefined</code></p>
          <p><code className="font-mono text-foreground">onApply</code>: <code className="font-mono">(from, to) =&gt; void</code></p>
          <p><code className="font-mono text-foreground">placeholder?</code>: <code className="font-mono">string</code> (default: "Seleccionar fechas")</p>
          <p className="mt-2"><strong className="text-foreground">Cuándo usar:</strong> Filtros por periodo, reportes, búsquedas con rango temporal. Para fecha individual usar <code className="font-mono text-foreground">DateInput</code>.</p>
          <p className="mt-1"><strong className="text-foreground">Tokens:</strong> bg-popover, border-border, primary (selección), muted (today), pointer-events-auto</p>
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Siempre acompañar inputs con <code className="font-mono text-foreground">Label</code></li>
        <li>Estado de error: <code className="font-mono text-foreground">border-destructive + ring-destructive</code> + mensaje debajo</li>
        <li>Usar <code className="font-mono text-foreground">Checkbox</code> para múltiples opciones, <code className="font-mono text-foreground">Switch</code> para on/off</li>
        <li>Placeholder nunca sustituye al label</li>
        <li>Select Filters: placeholder = nombre descriptivo del campo, no "Todos"</li>
        <li>Tab Bars: <code className="font-mono text-foreground">secondary</code> para activo, <code className="font-mono text-foreground">ghost</code> para inactivo</li>
        <li>Date Range Picker: usar presets cuando la selección es predecible, inputs manuales para rangos específicos</li>
      </ul>
    </div>
  </section>
  );
};
