import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const ModalsSection = () => {
  const [open, setOpen] = useState(false);

  return (
    <section id="modals" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold mb-2">2.5 Modales</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Componente <code className="font-mono text-primary">Dialog</code> (Radix). 
          Overlay con <code className="font-mono text-primary">bg-black/80</code>, 
          contenido con <code className="font-mono text-primary">z-50</code>.
          Se cierra con botón, click en overlay o Escape.
        </p>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Ejemplo funcional</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Abrir modal</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar perfil</DialogTitle>
              <DialogDescription>
                Realiza cambios en tu perfil. Haz click en guardar cuando termines.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Nombre</Label>
                <Input id="name" defaultValue="Usuario" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">Email</Label>
                <Input id="email" defaultValue="user@ejemplo.com" className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setOpen(false)}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Estructura</h3>
        <div className="bg-muted rounded-lg p-4 font-mono text-sm text-muted-foreground space-y-1">
          <p>&lt;Dialog&gt;</p>
          <p className="pl-4">&lt;DialogTrigger&gt; — Botón que abre el modal</p>
          <p className="pl-4">&lt;DialogContent&gt;</p>
          <p className="pl-8">&lt;DialogHeader&gt;</p>
          <p className="pl-12">&lt;DialogTitle&gt; — Obligatorio (accesibilidad)</p>
          <p className="pl-12">&lt;DialogDescription&gt; — Opcional</p>
          <p className="pl-8">&lt;/DialogHeader&gt;</p>
          <p className="pl-8">... contenido ...</p>
          <p className="pl-8">&lt;DialogFooter&gt; — Acciones</p>
          <p className="pl-4">&lt;/DialogContent&gt;</p>
          <p>&lt;/Dialog&gt;</p>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Siempre incluir <code className="font-mono text-foreground">DialogTitle</code> (requerido por accesibilidad)</li>
          <li>Footer: Cancel a la izquierda, acción primaria a la derecha</li>
          <li>No anidar modales dentro de modales</li>
          <li>Para confirmaciones destructivas, usar <code className="font-mono text-foreground">AlertDialog</code> en su lugar</li>
          <li>Ancho máximo por defecto: <code className="font-mono text-foreground">sm:max-w-[425px]</code></li>
        </ul>
      </div>
    </section>
  );
};
