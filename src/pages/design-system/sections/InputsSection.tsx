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

export const InputsSection = () => (
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

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Siempre acompañar inputs con <code className="font-mono text-foreground">Label</code></li>
        <li>Estado de error: <code className="font-mono text-foreground">border-destructive + ring-destructive</code> + mensaje debajo</li>
        <li>Usar <code className="font-mono text-foreground">Checkbox</code> para múltiples opciones, <code className="font-mono text-foreground">Switch</code> para on/off</li>
        <li>Placeholder nunca sustituye al label</li>
      </ul>
    </div>
  </section>
);
