// MisCuentasIGModal — entry point para LGs desde LeadGen.
//
// Reusa SpammerAccountsTab (que ya está completo y vive en Panel de
// Control) embebido en un Dialog grande, con `viewMode="mine"` para
// forzar que SOLO se vean las cuentas del usuario actual — incluso si
// es admin/manager. En Panel de Control sigue mostrándose todo el
// equipo (viewMode default = "all").
//
// Por qué un Dialog en vez de routing: para no sacar al LG del contexto
// de LeadGen. Hacen el quick-check de cómo están sus cuentas, suben un
// screenshot si IG la marcó restricted, ven el feedback del AI, y vuelven
// a su lista de leads sin perder filtros/scroll.
//
// El componente reusado (SpammerAccountsTab) tiene su propio padding y
// scrolling internos — acá solo le damos el contenedor con un max-h y
// dejamos que él maneje su layout.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import SpammerAccountsTab from "../panel-de-control/SpammerAccountsTab";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MisCuentasIGModal = ({ open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("leadgen.myIgAccounts")}</DialogTitle>
          <DialogDescription>
            {t("leadgen.igAccounts.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SpammerAccountsTab viewMode="mine" />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MisCuentasIGModal;
