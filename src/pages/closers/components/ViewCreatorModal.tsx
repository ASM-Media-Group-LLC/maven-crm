import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CloserCreator } from "../useCloserCreators";
import ContactHistoryPanel from "./ContactHistoryPanel";
import { Separator } from "@/components/ui/separator";

interface Props {
  creator: CloserCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</p>
  </div>
);

const ViewCreatorModal = ({ creator, open, onOpenChange }: Props) => {
  if (!creator) return null;

  const revenue = Number(creator.estimated_monetization || 0) * Number(creator.agency_commission || 0) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {creator.instagram_handle}
            <Badge variant="secondary">{creator.stage}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Instagram" value={creator.instagram_handle} />
          <Field label="Categoría" value={creator.category} />
          <Field label="Fecha de paso" value={creator.passed_date} />
          <Field label="Cuenta origen" value={creator.source_account} />
          <Field label="Teléfono" value={creator.phone} />
          <Field label="OnlyFans" value={creator.onlyfans_url} />
          <Field label="Monetización estimada" value={`$${Number(creator.estimated_monetization || 0).toLocaleString()}`} />
          <Field label="Comisión agencia" value={`${creator.agency_commission}%`} />
          <Field label="Revenue estimado" value={`$${revenue.toLocaleString()}`} />
          <Field label="Monetización mensual" value={creator.monthly_monetization ? `$${Number(creator.monthly_monetization).toLocaleString()}` : null} />
          {creator.rejection_reason && <Field label="Motivo rechazo" value={creator.rejection_reason} />}
        </div>

        {creator.notes && (
          <div>
            <p className="text-xs text-muted-foreground">Notas</p>
            <p className="text-sm">{creator.notes}</p>
          </div>
        )}

        <Separator />
        <ContactHistoryPanel creatorId={creator.id} />
      </DialogContent>
    </Dialog>
  );
};

export default ViewCreatorModal;
