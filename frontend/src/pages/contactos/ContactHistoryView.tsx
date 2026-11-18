import { formatUI } from "@/lib/formatoHora";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ArrowLeft, Loader2, UserPlus, MessageCircle, StickyNote, Sparkles, ArrowRightLeft,
  Megaphone, Calendar, Building2, Phone, TrendingDown, Circle,
} from "lucide-react";

// Pantalla de HISTORIAL de un contacto: timeline de TODO lo que pasó con él en Maven
// (alta como contacto, pipeline del closer, contactos hechos, notas, conversión a creadora,
// baja de la agencia, canales de venta, eventos, monetización…). Se alimenta del RPC
// get_contact_history (agregación server-side). Es un overlay full-screen sobre el popup:
// "Volver" cierra y el popup sigue abierto debajo.
//
// El título y el detalle de cada evento los arma el RPC en el servidor, en
// español: son dato, no se traducen acá. Lo que sí es de esta pantalla (encabezado,
// vacío, error) pasa por t().

interface HistoryEvent {
  event_at: string | null;
  kind: string;
  title: string;
  detail: string | null;
}

// Ícono + color por tipo de evento.
const KIND_META: Record<string, { icon: typeof Circle; cls: string }> = {
  alta:         { icon: UserPlus,       cls: "text-success bg-success/10" },
  lead:         { icon: ArrowRightLeft, cls: "text-blue-500 bg-blue-500/10" },
  pipeline:     { icon: ArrowRightLeft, cls: "text-blue-500 bg-blue-500/10" },
  contacto_wa:  { icon: MessageCircle,  cls: "text-success bg-success/10" },
  contactos:    { icon: Phone,          cls: "text-sky-500 bg-sky-500/10" },
  nota:         { icon: StickyNote,     cls: "text-warning bg-warning/10" },
  conversion:   { icon: Sparkles,       cls: "text-violet-500 bg-violet-500/10" },
  baja:         { icon: TrendingDown,   cls: "text-destructive bg-destructive/10" },
  agencia:      { icon: Building2,      cls: "text-indigo-500 bg-indigo-500/10" },
  monetizacion: { icon: Megaphone,      cls: "text-pink-500 bg-pink-500/10" },
  evento:       { icon: Calendar,       cls: "text-orange-500 bg-orange-500/10" },
  cambio:       { icon: Circle,         cls: "text-muted-foreground bg-muted" },
};

interface Props {
  contactId: string;
  contactName: string;
  open: boolean;
  onClose: () => void;
}

export default function ContactHistoryView({ contactId, contactName, open, onClose }: Props) {
  const f = useFormato();
  const { t } = useLanguage();
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["contact-history", contactId],
    enabled: open && !!contactId,
    queryFn: async (): Promise<HistoryEvent[]> => {
      const { data, error } = await (supabase as any).rpc("get_contact_history", { p_contact_id: contactId });
      if (error) {
        if (error.code === "42501") return [];
        throw error;
      }
      return (data ?? []) as HistoryEvent[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl h-[88vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-tight">{t("contactos.historyOf", { name: contactName })}</h2>
            <p className="text-xs text-muted-foreground">{t("contactos.historySubtitle")}</p>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-5 py-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <p className="py-16 text-center text-sm text-destructive">{t("contactos.historyLoadError")}</p>
            ) : events.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("contactos.historyEmpty")}</p>
            ) : (
              <ol className="relative space-y-0">
                {/* línea vertical */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden />
                {events.map((e, i) => {
                  const meta = KIND_META[e.kind] ?? KIND_META.cambio;
                  const Icon = meta.icon;
                  return (
                    <li key={i} className="relative flex gap-3 pb-5">
                      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.cls}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{e.title}</p>
                          {e.event_at && (
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {formatUI(parseISO(e.event_at), "dd MMM yy, HH:mm", { locale: f.fechas })}
                            </span>
                          )}
                        </div>
                        {e.detail && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{e.detail}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
