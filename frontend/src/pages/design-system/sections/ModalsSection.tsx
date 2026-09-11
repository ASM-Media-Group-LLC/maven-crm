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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const ModalsSection = () => {
  const [open, setOpen] = useState(false);

  return (
    <section id="modals" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold mb-2">2.5 Modales</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Sistema unificado <code className="font-mono text-primary">Dialog</code> /{" "}
          <code className="font-mono text-primary">AlertDialog</code> (Radix) con efecto glass. La base se modifica en
          <code className="font-mono text-primary"> components/ui/dialog.tsx</code> y propaga a 250+ usos del CRM —
          nunca crear modales con divs manuales.
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

      {/* AlertDialog para confirmaciones destructivas */}
      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">AlertDialog (confirmaciones)</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Para acciones irreversibles (delete, reset, archive). No cierra con click fuera ni Escape — el user debe
          elegir explícitamente Cancelar o Continuar. Mismo lenguaje glass que Dialog.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Eliminar registro</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El registro será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction>Continuar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Estilo base */}
      <div>
        <h3 className="text-xl font-medium mb-2 text-muted-foreground">Estilo base (DialogContent / AlertDialogContent)</h3>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">
            Las dos primitivas comparten el mismo lenguaje visual — definido una vez y aplicado globalmente:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground pt-2">
            <li>Glass: <code className="font-mono text-foreground">bg-card/90 backdrop-blur-xl</code></li>
            <li>Tinte: <code className="font-mono text-foreground">bg-gradient-to-br from-primary/15 via-transparent to-transparent</code></li>
            <li>Bordes: <code className="font-mono text-foreground">rounded-3xl border-white/10 ring-1 ring-white/10</code></li>
            <li>Overlay: <code className="font-mono text-foreground">bg-black/60 backdrop-blur-sm</code></li>
            <li>Sombra: <code className="font-mono text-foreground">shadow-2xl</code></li>
            <li>Animaciones: <code className="font-mono text-foreground">data-[state=open]:animate-in fade-in-0 zoom-in-95 slide-in-from-top-[48%]</code></li>
          </ul>
        </div>
      </div>

      {/* X de cerrar */}
      <div>
        <h3 className="text-xl font-medium mb-2 text-muted-foreground">X de cerrar y DialogHeader</h3>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">
            La X de cerrar es un overlay absolute en <code className="font-mono text-foreground">top-3 right-3</code> con
            <code className="font-mono text-foreground"> bg-background/60 backdrop-blur-sm rounded-full</code>. Para evitar que pise
            contenido del header, <strong className="text-foreground">DialogHeader</strong> tiene
            <code className="font-mono text-foreground"> pr-10</code> por default.
          </p>
          <p className="text-muted-foreground pt-1">
            Si el header tiene contenido alineado a la derecha (chips, botones), usar
            <code className="font-mono text-foreground"> pr-14</code> o más para cushion extra. AlertDialog NO tiene X — se cierra
            solo via Cancel/Action explícito.
          </p>
        </div>
      </div>

      {/* Estructura */}
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
          <p className="pl-8">... contenido (usar &lt;ListRow&gt; para listas) ...</p>
          <p className="pl-8">&lt;DialogFooter&gt; — Acciones</p>
          <p className="pl-4">&lt;/DialogContent&gt;</p>
          <p>&lt;/Dialog&gt;</p>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Siempre incluir <code className="font-mono text-foreground">DialogTitle</code> (requerido por a11y)</li>
          <li>Footer: Cancel a la izquierda, acción primaria a la derecha</li>
          <li>No anidar Dialogs dentro de Dialogs (sí está OK Dialog → AlertDialog para confirmar dentro de un Dialog)</li>
          <li>Para confirmaciones destructivas usar <code className="font-mono text-foreground">AlertDialog</code> — no Dialog con custom buttons</li>
          <li>Listas internas: usar <code className="font-mono text-foreground">&lt;ListRow&gt;</code> / <code className="font-mono text-foreground">&lt;ListRowButton&gt;</code> (ver sección 2.4 Cards)</li>
          <li>Ancho default: <code className="font-mono text-foreground">max-w-lg</code> (32rem). Para popups con tabla, usar <code className="font-mono text-foreground">max-w-2xl</code></li>
          <li>Si modificas el look de modales globalmente, edita <code className="font-mono text-foreground">components/ui/dialog.tsx</code> — propaga automático a todo el CRM</li>
        </ul>
      </div>
    </section>
  );
};
