import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { PALETA_RAPIDA, mismoPar, type ParDeColores } from "@/lib/correo/coloresEtiqueta";
import {
  useActualizarEtiqueta, type CambiosDeEtiqueta, type EnListaEtiquetas, type EtiquetaDeCorreo,
} from "@/hooks/useEtiquetasCorreo";

/** El círculo con la «a» que usa Gmail para mostrar un color: el fondo es el
 *  de la etiqueta y la letra, su color de texto. Así se ven los DOS colores de
 *  un vistazo. */
export function MuestraDeColor({
  color, elegido, className,
}: {
  color: ParDeColores | null;
  elegido?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium leading-none",
        !color && "border border-border bg-muted text-muted-foreground",
        className,
      )}
      style={color ? { backgroundColor: color.fondo, color: color.texto } : undefined}
    >
      {elegido ? <Check className="h-3 w-3" strokeWidth={3} /> : "a"}
    </span>
  );
}

/** El menú ⋮ de una etiqueta en la columna, opción por opción como el de
 *  Gmail. Lo que cambia algo de la etiqueta se guarda al tocar; lo que abre un
 *  diálogo se lo pide a quien dibuja la columna. */
export default function EtiquetaMenu({
  etiqueta, onColorPersonalizado, onModificar, onEliminar, onSubetiqueta,
}: {
  etiqueta: EtiquetaDeCorreo;
  onColorPersonalizado: () => void;
  onModificar: () => void;
  onEliminar: () => void;
  onSubetiqueta: () => void;
}) {
  const { t } = useLanguage();
  const actualizar = useActualizarEtiqueta();
  const cambiar = (cambios: CambiosDeEtiqueta) =>
    actualizar.mutate({ id: etiqueta.id, cambios }, {
      onError: (e) => toast.error(t("mail.labels.saveError"), { description: (e as Error).message }),
    });

  const opcionesColumna: { valor: EnListaEtiquetas; clave: "mail.labels.menu.show" | "mail.labels.menu.showIfUnread" | "mail.labels.menu.hide" }[] = [
    { valor: "mostrar", clave: "mail.labels.menu.show" },
    { valor: "si_no_leidas", clave: "mail.labels.menu.showIfUnread" },
    { valor: "ocultar", clave: "mail.labels.menu.hide" },
  ];

  return (
    <DropdownMenuContent align="start" side="right" className="w-64">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-3">
          <MuestraDeColor color={etiqueta.color} />
          {t("mail.labels.menu.color")}
        </DropdownMenuSubTrigger>
        {/* En un portal: el SubContent de ui/ se dibuja DENTRO del menú, que
            tiene overflow-hidden, y quedaba recortado e invisible. */}
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-60 p-3">
            <p className="pb-2 text-sm">{t("mail.labels.menu.color")}</p>
            <div className="flex flex-col gap-1.5">
              {PALETA_RAPIDA.map((fila, i) => (
                <div key={i} className="flex gap-1.5">
                  {fila.map((par) => {
                    const elegido = mismoPar(par, etiqueta.color);
                    return (
                      <DropdownMenuItem
                        key={`${par.fondo}${par.texto}`}
                        aria-label={par.fondo}
                        onSelect={() => cambiar({ color: par })}
                        className="rounded-full p-0 focus:bg-transparent focus:ring-2 focus:ring-ring"
                      >
                        <MuestraDeColor color={par} elegido={elegido} className="h-6 w-6 text-xs" />
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ))}
            </div>
            <DropdownMenuItem className="mt-2" onSelect={onColorPersonalizado}>
              {t("mail.labels.menu.customColor")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!etiqueta.color}
              onSelect={() => cambiar({ color: null })}
            >
              {t("mail.labels.menu.removeColor")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        {t("mail.labels.menu.inLabelList")}
      </DropdownMenuLabel>
      {opcionesColumna.map(({ valor, clave }) => (
        <DropdownMenuItem
          key={valor}
          role="menuitemradio"
          aria-checked={etiqueta.enListaEtiquetas === valor}
          onSelect={() => cambiar({ enListaEtiquetas: valor })}
        >
          <Check className={cn("mr-2 h-4 w-4", etiqueta.enListaEtiquetas === valor ? "opacity-100" : "opacity-0")} />
          {t(clave)}
        </DropdownMenuItem>
      ))}

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        {t("mail.labels.menu.inMessageList")}
      </DropdownMenuLabel>
      {[true, false].map((mostrar) => (
        <DropdownMenuItem
          key={String(mostrar)}
          role="menuitemradio"
          aria-checked={etiqueta.enListaMensajes === mostrar}
          onSelect={() => cambiar({ enListaMensajes: mostrar })}
        >
          <Check className={cn("mr-2 h-4 w-4", etiqueta.enListaMensajes === mostrar ? "opacity-100" : "opacity-0")} />
          {t(mostrar ? "mail.labels.menu.show" : "mail.labels.menu.hide")}
        </DropdownMenuItem>
      ))}

      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onModificar}>{t("mail.labels.menu.edit")}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onEliminar}>{t("mail.labels.menu.remove")}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onSubetiqueta}>{t("mail.labels.menu.addSublabel")}</DropdownMenuItem>
    </DropdownMenuContent>
  );
}
