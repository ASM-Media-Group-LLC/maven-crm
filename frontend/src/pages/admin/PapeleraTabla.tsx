import { formatUI } from "@/lib/formatoHora";
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
import { ConFormato } from "./ConFormato";

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
        <p>{t("admin.trash.empty")}</p>
        <p className="text-xs mt-1">
          {t("admin.trash.emptyHint", { days: diasDePapelera })}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        <ConFormato texto={t("admin.trash.intro", { days: diasDePapelera })} />
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.person")}</TableHead>
            <TableHead>{t("admin.trash.colDeleted")}</TableHead>
            <TableHead>{t("admin.trash.colBy")}</TableHead>
            <TableHead>{t("admin.trash.colTimeLeft")}</TableHead>
            <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                    <p className="font-medium truncate">{c.full_name || t("admin.noName")}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatUI(new Date(c.deleted_at), "d MMM yyyy, HH:mm", { locale: f.fechas })}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.deleted_by_name || "—"}
              </TableCell>
              <TableCell>
                <Badge variant={tonoDelPlazo(c.dias_restantes)}>
                  {c.dias_restantes === 0
                    ? t("admin.trash.today")
                    : c.dias_restantes === 1
                      ? t("admin.oneDay")
                      : t("admin.nDays", { n: c.dias_restantes })}
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
                    {t("admin.trash.restore")}
                  </Button>
                  {puedePurgar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title={t("admin.trash.purge")}
                      aria-label={t("admin.trash.purgeName", { name: c.full_name || t("admin.thisPerson") })}
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
              {t("admin.trash.purgeTitle", { name: aPurgar?.full_name || t("admin.thisPerson") })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{t("admin.trash.purgeNoUndo", { days: diasDePapelera })}</p>
                <p>{t("admin.trash.purgeWhat")}</p>
                <p>{t("admin.trash.purgeMessages")}</p>
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
              {t("admin.trash.purge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
