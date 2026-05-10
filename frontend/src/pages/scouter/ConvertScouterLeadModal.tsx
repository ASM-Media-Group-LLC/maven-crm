import { ArrowRight, Lightbulb } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
import type { ScouterLead } from "@/hooks/useScouterLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ScouterLead;
  onConverted?: () => void;
}

// El equipo de scouter NO contacta — su trabajo es descubrir. Por eso
// la conversión va al funnel de Lead Gen (no directo a Closers): el
// LG team es quien curate, agrega data faltante y decide cuándo pasa
// a closers. Mantiene un solo funnel de calidad para todo el sistema.

// Mapeo del ai_score (0-10 del scouter) al quality enum de leadgen.
// Conservador: necesita 9+ para A+, 7+ para A — refleja que un score
// alto del scouter ≠ creator firmable, solo significa "vale la pena
// que LG la mire de cerca".
function mapAiScoreToQuality(score: number | null): string {
  if (score == null) return "B";
  if (score >= 9) return "A+";
  if (score >= 7) return "A";
  if (score >= 5) return "B+";
  return "B";
}

const ConvertScouterLeadModal = ({ open, onOpenChange, lead, onConverted }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCancel = () => {
    toast({ title: "Conversión cancelada" });
    onOpenChange(false);
  };

  const convert = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Trae la company del scouter para usarla como company del
      // leadgen_entries. Si no hay match (scouter_companies vs
      // LEADGEN_COMPANIES son catálogos distintos), guardamos el name
      // como text libre — la columna lo acepta.
      let companyName: string | null = null;
      if (lead.company_id) {
        const { data: scCompany } = await supabase
          .from("scouter_companies")
          .select("name")
          .eq("id", lead.company_id)
          .maybeSingle();
        companyName = (scCompany as { name?: string } | null)?.name ?? null;
      }

      const sourceLink =
        lead.instagram_url ||
        `https://www.instagram.com/${lead.instagram_handle.replace(/^@/, "")}`;

      // INSERT en leadgen_entries — el LG team lo verá en su tabla
      // y podrá completar/curate antes de convertirlo a closers_contacts
      // como cualquier otro lead.
      const { data: lg, error: insertError } = await supabase
        .from("leadgen_entries")
        .insert({
          model_handle: lead.instagram_handle,
          platform: lead.platform || "instagram",
          quality: mapAiScoreToQuality(lead.ai_score),
          company: companyName || "Scouter",
          source_link: sourceLink,
          onlyfans_url: lead.onlyfans_url,
          phone_e164: lead.phone,
          phone_raw: lead.phone,
          city: lead.city,
          notes: lead.notes,
          lg_user_id: user.id,
          entry_date: new Date().toISOString().slice(0, 10),
          record_type: "nuevo",
        } as never)
        .select("id")
        .single();
      if (insertError) throw insertError;

      // Marcar el scouter_lead como convertido (pero NO en pipeline
      // closers todavía — pasa a manos del LG team).
      const { error: updateError } = await supabase
        .from("scouter_leads")
        .update({
          converted_at: new Date().toISOString(),
          converted_to_lead_id: (lg as { id: string }).id,
        } as never)
        .eq("id", lead.id);
      if (updateError) throw updateError;

      // Avatar fetch async — el lead nuevo en leadgen también dispara
      // el job para que models.avatar_url se popule si todavía no estaba.
      void enqueueAvatarFetch(lead.instagram_handle);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scouter-leads"] });
      queryClient.invalidateQueries({ queryKey: ["scouter-stats"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
      toast({
        title: "Lead pasado a Lead Gen",
        description: "El equipo de Lead Gen lo va a curate y contactar.",
      });
      onConverted?.();
      onOpenChange(false);
    },
    onError: (e) => {
      toast({
        title: "Error al pasar a Lead Gen",
        description: (e as Error).message,
        variant: "destructive",
      });
    },
  });

  const items = [
    { label: "Handle", value: `@${lead.instagram_handle}` },
    { label: "Nombre", value: lead.name || "—" },
    { label: "Plataforma", value: lead.platform || "instagram" },
    { label: "País / Ciudad", value: [lead.country, lead.city].filter(Boolean).join(" · ") || "—" },
    { label: "Teléfono", value: lead.phone || "—" },
    { label: "AI Score → Quality", value: `${lead.ai_score?.toFixed(1) ?? "—"} → ${mapAiScoreToQuality(lead.ai_score)}` },
    { label: "OnlyFans", value: lead.onlyfans_url ? "✓ Incluido" : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <DialogTitle>Pasar Lead a Lead Gen</DialogTitle>
          </div>
          <DialogDescription>
            El scouter descubre — Lead Gen contacta. Este lead se pasa al funnel del equipo LG con su quality estimada por IA. Ellos lo curate y, cuando esté listo, lo convierten a Pipeline Closers como cualquier otro lead.
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">Datos que se transferirán</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  <span className="font-medium">{item.label}:</span>{" "}
                  <span className="text-muted-foreground">{item.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Aparece en /lead-gen como entrada nueva. El LG team puede agregar phone, OF URL, notas, y mover a "contactado". Cuando lo conviertan, va al pipeline de Closers normal.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={convert.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            {convert.isPending ? "Pasando…" : "Pasar a Lead Gen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertScouterLeadModal;
