import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { History } from "lucide-react";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { ETIQUETA_AGENCIA, esCampoFicha } from "@/lib/portal/ficha";

interface Props {
  creatorId: string;
  /** Para nombrar a la creadora en lo que cambió ella desde el portal (su perfil
   *  no es de la agencia: no sale en profiles). */
  creatorName?: string;
}

// Las acciones que anota la base (trigger creators_ficha_historial y la edge
// portal-creadoras, 20261006100000) llegan como claves: «ficha:tono_voz»,
// «portal:hobbies», «portal_acceso:invitada». Las de antes son texto en español
// («Cambio de estado») y se muestran tal cual.
const ACCESO: Record<string, TranslationKey> = {
  "portal_acceso:invitada": "portal.historial.invitada",
  "portal_acceso:enlace": "portal.historial.enlace",
  "portal_acceso:correo": "portal.historial.correo",
  "portal_acceso:quitada": "portal.historial.quitada",
};

const HistorialTabContent = ({ creatorId, creatorName }: Props) => {
  const f = useFormato();
  const { t } = useLanguage();
  const { data: entries, isLoading } = useQuery({
    queryKey: ["creator_history", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_history")
        .select("id, action, old_value, new_value, user_id, created_at")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  // Los nombres de quienes cambiaron algo (la gente de la agencia).
  const ids = [...new Set((entries ?? []).map((e) => e.user_id))];
  const { data: nombres } = useQuery({
    queryKey: ["creator_history", creatorId, "nombres", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.full_name ?? ""]));
    },
  });

  const desdePortal = (accion: string) => accion.startsWith("portal:");
  const titulo = (accion: string) => {
    if (ACCESO[accion]) return t(ACCESO[accion]);
    const [origen, campo] = accion.split(":");
    if ((origen === "ficha" || origen === "portal") && campo && esCampoFicha(campo)) {
      return t("portal.acceso.cambio", { campo: t(ETIQUETA_AGENCIA[campo]) });
    }
    return accion;
  };
  const quien = (accion: string, uid: string) =>
    nombres?.get(uid) || (desdePortal(accion) && creatorName) || shortId(uid);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "d MMM yyyy, HH:mm", { locale: f.fechas });
    } catch {
      return dateStr;
    }
  };

  const shortId = (uuid: string) => uuid.split("-")[0] ?? t("common.user");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          {t("creadores.history.title")}
        </CardTitle>
        <CardDescription>{t("creadores.history.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries && entries.length > 0 ? (
          <div className="relative">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="relative flex gap-4 pb-8 last:pb-0">
                {/* Vertical line */}
                {idx < entries.length - 1 && (
                  <div className="absolute left-[5px] top-4 bottom-0 w-px bg-border" />
                )}
                {/* Dot */}
                <div className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full bg-primary" />

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {titulo(entry.action)}
                        {desdePortal(entry.action) && (
                          <Badge variant="outline" className="ml-2 align-middle text-[10px]">{t("portal.historial.desdePortal")}</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("creadores.history.modifiedBy")}{" "}
                        <Badge variant="secondary-soft" className="ml-1 text-[10px] px-1.5 py-0">
                          {quien(entry.action, entry.user_id)}
                        </Badge>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDate(entry.created_at!)}
                    </span>
                  </div>

                  {(entry.old_value || entry.new_value) && (
                    <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                      {entry.old_value && (
                        <p>
                          <span className="text-destructive font-medium">{t("creadores.history.before")}</span>{" "}
                          <span className="text-muted-foreground">{entry.old_value}</span>
                        </p>
                      )}
                      {entry.new_value && (
                        <p>
                          <span className="font-medium" style={{ color: "hsl(var(--success))" }}>{t("creadores.history.after")}</span>{" "}
                          <span className="text-muted-foreground">{entry.new_value}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<History className="h-8 w-8 text-muted-foreground" />}
            title={t("creadores.history.empty")}
            description={t("creadores.history.emptyDesc")}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default HistorialTabContent;
