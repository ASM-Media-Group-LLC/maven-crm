import { useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import {
  GRILLA_PERSONALIZADA, PAR_POR_DEFECTO, rgbDe,
} from "@/lib/correo/coloresEtiqueta";
import { useActualizarEtiqueta, type EtiquetaDeCorreo } from "@/hooks/useEtiquetasCorreo";
import PastillaEtiqueta from "./PastillaEtiqueta";

/** «Agregar color personalizado», como en Gmail: la pastilla de la etiqueta
 *  arriba, dibujada con lo que se va eligiendo, y dos grillas iguales —fondo y
 *  texto— al lado. Nada se guarda hasta «Aplicar». */
export default function ColorPersonalizadoDialog({
  etiqueta, ruta, onCerrar,
}: {
  etiqueta: EtiquetaDeCorreo;
  ruta: string;
  onCerrar: () => void;
}) {
  const { t } = useLanguage();
  const actualizar = useActualizarEtiqueta();
  const inicial = etiqueta.color ?? PAR_POR_DEFECTO;
  const [fondo, setFondo] = useState(inicial.fondo);
  const [texto, setTexto] = useState(inicial.texto);

  const aplicar = () => {
    actualizar.mutate({ id: etiqueta.id, cambios: { color: { fondo, texto } } });
    onCerrar();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mail.labels.custom.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-y border-border/60 py-2 text-sm">
          <PastillaEtiqueta nombre={ruta} color={{ fondo, texto }} />
          <span className="text-muted-foreground">{t("mail.labels.custom.preview")}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Grilla titulo={t("mail.labels.custom.background")} elegido={fondo} onElegir={setFondo} />
          <Grilla titulo={t("mail.labels.custom.text")} elegido={texto} onElegir={setTexto} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>{t("mail.labels.cancel")}</Button>
          <Button onClick={aplicar}>{t("mail.labels.custom.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Grilla({
  titulo, elegido, onElegir,
}: {
  titulo: string;
  elegido: string;
  onElegir: (hex: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{titulo}</p>
      {/* Grises y vivos van sueltos, como en Gmail; los seis renglones de
          tonos, pegados en un solo bloque. */}
      <div role="radiogroup" aria-label={titulo} className="flex flex-col gap-2">
        {[[GRILLA_PERSONALIZADA[0]], [GRILLA_PERSONALIZADA[1]], GRILLA_PERSONALIZADA.slice(2)].map((bloque, b) => (
          <div key={b} className="flex flex-col">
            {bloque.map((fila, i) => (
              <div key={i} className="grid grid-cols-8">
                {fila.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    role="radio"
                    aria-checked={hex === elegido}
                    aria-label={rgbDe(hex)}
                    title={rgbDe(hex)}
                    onClick={() => onElegir(hex)}
                    className="relative flex h-6 items-center justify-center border border-black/10 transition-transform hover:z-10 hover:scale-110"
                    style={{ backgroundColor: hex }}
                  >
                    {hex === elegido && (
                      <Check
                        className="h-3.5 w-3.5"
                        // El visto tiene que leerse sobre el blanco y sobre el negro.
                        style={{ color: esClaro(hex) ? "#000000" : "#ffffff" }}
                      />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Luminancia aproximada, solo para decidir el color del visto. */
function esClaro(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}
