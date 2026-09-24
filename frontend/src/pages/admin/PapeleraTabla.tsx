import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Trash2, Trash, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CuentaEnPapelera } from "./usePapelera";

interface Props {
  cuentas: CuentaEnPapelera[];
  diasDePapelera: number;
  isLoading: boolean;
  /** Solo los admins pueden destruir antes de que venza el plazo. */
  puedePurgar: boolean;
  onRecuperar: (userId: string) => void;
  onPurgar: (userId: string) => void;
  recuperando: boolean;
  purgando: boolean;
  /** Mensaje si la lista no se pudo cargar: se muestra, no se disfraza de vacío. */
  error?: string | null;
  onReintentar?: () => void;
}

// Los últimos días en rojo: es el aviso de que se va a purgar sola.
export function tonoDelPlazo(dias: number): "secondary" | "outline" | "destructive" {
  if (dias <= 3) return "destructive";
  if (dias <= 7) return "outline";
  return "secondary";
}

export default function PapeleraTabla({
  cuentas, diasDePapelera, isLoading, puedePurgar,
  onRecuperar, onPurgar, recuperando, purgando, error, onReintentar,
}: Props) {
  const [aPurgar, setAPurgar] = useState<CuentaEnPapelera | null>(null);
  const { t } = useLanguage();
  const f = useFormato();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Un fallo de la llamada NO es "no hay cuentas". Se dice, con reintento.
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mb-3 opacity-40" />
        <p>{t("papelera.noCargo")}</p>
        <p className="text-xs mt-1 max-w-md text-center">{error}</p>
        {onReintentar && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onReintentar}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    );
  }

  if (cuentas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Trash className="h-12 w-12 mb-3 opacity-40" />
        <p>No hay cuentas eliminadas</p>
        <p className="text-xs mt-1">
          Lo que se elimina se puede recuperar durante {diasDePapelera} días.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Estas cuentas están suspendidas: no pueden entrar, pero no se borró
        ningún dato. Pasados {diasDePapelera} días se eliminan de forma
        definitiva. Al recuperar una, la casilla de correo <strong>no</strong>{" "}
        vuelve: se dio de baja para liberar el puesto y hay que crearla de nuevo.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Eliminada</TableHead>
            <TableHead>Por</TableHead>
            <TableHead>Se borra en</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cuentas.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    name={c.full_name}
                    src={c.avatar_url}
                    seed={c.avatar_seed}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.full_name || "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {format(new Date(c.deleted_at), "d MMM yyyy, HH:mm", { locale: f.fechas })}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.deleted_by_name || "—"}
              </TableCell>
              <TableCell>
                <Badge variant={tonoDelPlazo(c.dias_restantes)}>
                  {c.dias_restantes === 0
                    ? "hoy"
                    : c.dias_restantes === 1
                      ? "1 día"
                      : `${c.dias_restantes} días`}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recuperando}
                    onClick={() => onRecuperar(c.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Recuperar
                  </Button>
                  {puedePurgar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Borrar definitivamente"
                      aria-label={`Borrar definitivamente a ${c.full_name || "esta persona"}`}
                      disabled={purgando}
                      onClick={() => setAPurgar(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* La purga es la única acción irreversible de esta pantalla, así que el
          diálogo dice EXACTAMENTE qué se lleva. */}
      <AlertDialog open={!!aPurgar} onOpenChange={(o) => !o && setAPurgar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Borrar definitivamente a {aPurgar?.full_name || "esta persona"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esto no se puede deshacer, y no espera los {diasDePapelera} días.</p>
                <p>
                  Se van sus roles, su correo, sus horas de Cowork, las
                  evaluaciones donde fue examinador y los espacios de chat o
                  salas de Meet que haya creado (esos desaparecen para todos).
                  Además, todo lo que creó en el CRM —creadoras, negocios,
                  promos— queda sin autor.
                </p>
                <p>Sus mensajes en Messenger se quedan, pero sin nombre ni foto.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (aPurgar) onPurgar(aPurgar.id);
                setAPurgar(null);
              }}
            >
              Borrar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
