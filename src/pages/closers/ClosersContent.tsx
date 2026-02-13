import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useDeals } from "./useDeals";
import ClosersKPICards from "./ClosersKPICards";
import PipelineBoard from "./PipelineBoard";
import NewDealModal from "./NewDealModal";

const ClosersContent = () => {
  const { deals, isLoading, createDeal } = useDeals();
  const [showNewDeal, setShowNewDeal] = useState(false);

  return (
    <main className="flex-1 overflow-auto p-6 min-w-0">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de deals y llamadas
            </p>
          </div>
          <Button onClick={() => setShowNewDeal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Deal
          </Button>
        </div>

        {/* KPIs */}
        <ClosersKPICards deals={deals} />

        {/* Contactos placeholder */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Contactos</h2>
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sección de contactos próximamente
            </p>
          </div>
        </div>

        {/* Pipeline */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Pipeline de Ventas</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <PipelineBoard deals={deals} />
          )}
        </div>
      </div>

      <NewDealModal
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        onSubmit={(data) => {
          createDeal.mutate(data, { onSuccess: () => setShowNewDeal(false) });
        }}
        isLoading={createDeal.isPending}
      />
    </main>
  );
};

export default ClosersContent;
