import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/useLanguage";
import { finDelNombreSinExtension } from "@/lib/drive/nombres";

/** El diálogo de un nombre: carpeta nueva, unidad nueva o «Cambiar nombre»,
 *  como el de Google. Enter guarda (es un formulario) y Esc cierra (el diálogo).
 *  Con `sinExtension`, al abrir queda elegido el nombre sin la extensión —como
 *  Google con un archivo—, así lo que se escribe no se come el «.xlsx». */
export default function DialogoDeNombre({
  titulo, etiqueta, inicial, boton, ocupado, onCerrar, onGuardar, sinExtension = false, renombrando = false, maximo = 255,
}: {
  titulo: string; etiqueta: string; inicial: string; boton: string; ocupado: boolean;
  onCerrar: () => void; onGuardar: (nombre: string) => void;
  sinExtension?: boolean; renombrando?: boolean; maximo?: number;
}) {
  const { t } = useLanguage();
  const [nombre, setNombre] = useState(inicial);
  const limpio = nombre.trim();
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!limpio || ocupado) return;
            // Renombrar sin cambiar nada no guarda: se cierra, como en Google.
            // (Una carpeta nueva con el nombre sugerido SÍ se crea.)
            if (renombrando && limpio === inicial.trim()) return onCerrar();
            onGuardar(limpio);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            aria-label={etiqueta}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={maximo}
            autoFocus
            onFocus={(e) => {
              const el = e.currentTarget;
              if (sinExtension) el.setSelectionRange(0, finDelNombreSinExtension(el.value));
              else el.select();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCerrar}>{t("drive.cancelar")}</Button>
            <Button type="submit" disabled={!limpio || ocupado}>{boton}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
