import { Button } from "@/components/ui/button";
import { ChevronDown, Settings, User, LogOut, Keyboard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const DropdownsSection = () => (
  <section id="dropdowns" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.3 Dropdowns</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Único componente de dropdown: <code className="font-mono text-primary">DropdownMenu</code> (Radix).
        Fondo opaco (<code className="font-mono text-primary">bg-popover</code>), z-index <code className="font-mono text-primary">z-50</code>.
        Se abre con click, se cierra con click fuera o Escape.
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Ejemplo funcional</h3>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Mi cuenta <ChevronDown className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            <span>Perfil</span>
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Configuración</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Atajos</span>
            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Cerrar sesión</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Siempre usar <code className="font-mono text-foreground">DropdownMenu</code> de shadcn — no crear dropdowns custom</li>
        <li>Trigger: usar <code className="font-mono text-foreground">asChild</code> con un <code className="font-mono text-foreground">Button</code></li>
        <li>Fondo: siempre <code className="font-mono text-foreground">bg-popover</code> — nunca transparente</li>
        <li>Incluir <code className="font-mono text-foreground">DropdownMenuLabel</code> como header cuando hay grupos de acciones</li>
        <li>Separar grupos lógicos con <code className="font-mono text-foreground">DropdownMenuSeparator</code></li>
        <li>Acciones destructivas: <code className="font-mono text-foreground">text-destructive</code> y siempre al final</li>
      </ul>
    </div>
  </section>
);
