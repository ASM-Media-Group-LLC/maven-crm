import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCloserCreators, CloserCreator } from "./useCloserCreators";
import ClosersKPICards from "./components/ClosersKPICards";
import MisCreatorsTab from "./tabs/MisCreatorsTab";
import PipelineTab from "./tabs/PipelineTab";
import ConfirmadasTab from "./tabs/ConfirmadasTab";
import CompletadasTab from "./tabs/CompletadasTab";
import NoInteresadasTab from "./tabs/NoInteresadasTab";
import AsignacionTab from "./tabs/AsignacionTab";
import NewCreatorModal from "./components/NewCreatorModal";
import EditCreatorModal from "./components/EditCreatorModal";
import ViewCreatorModal from "./components/ViewCreatorModal";
import DeleteCreatorDialog from "./components/DeleteCreatorDialog";

const ClosersContent = () => {
  const {
    creators, isLoading, createCreator, updateCreator, updateStage,
    deleteCreator, assignCreator, isAdmin,
  } = useCloserCreators();

  const [showNew, setShowNew] = useState(false);
  const [viewCreator, setViewCreator] = useState<CloserCreator | null>(null);
  const [editCreator, setEditCreator] = useState<CloserCreator | null>(null);
  const [deletingCreator, setDeletingCreator] = useState<CloserCreator | null>(null);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">Gestión de creators desde LeadGen</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nueva Creator
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <>
            <ClosersKPICards creators={creators} />
            <Tabs defaultValue="mis-creators">
            <TabsList className="flex-wrap">
              <TabsTrigger value="mis-creators">Mis Creators</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="confirmadas">Confirmadas</TabsTrigger>
              <TabsTrigger value="completadas">Completadas</TabsTrigger>
              <TabsTrigger value="no-interesadas">No Interesadas</TabsTrigger>
              {isAdmin && <TabsTrigger value="asignacion">Asignación</TabsTrigger>}
            </TabsList>

            <TabsContent value="mis-creators">
              <MisCreatorsTab
                creators={creators}
                onView={setViewCreator}
                onEdit={setEditCreator}
                onDelete={setDeletingCreator}
                onStageChange={(id, stage) => updateStage.mutate({ id, stage })}
              />
            </TabsContent>
            <TabsContent value="pipeline">
              <PipelineTab creators={creators} onView={setViewCreator} onEdit={setEditCreator} />
            </TabsContent>
            <TabsContent value="confirmadas">
              <ConfirmadasTab creators={creators} onView={setViewCreator} />
            </TabsContent>
            <TabsContent value="completadas">
              <CompletadasTab creators={creators} onView={setViewCreator} />
            </TabsContent>
            <TabsContent value="no-interesadas">
              <NoInteresadasTab creators={creators} onView={setViewCreator} />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="asignacion">
                <AsignacionTab
                  creators={creators}
                  onAssign={(id, to) => assignCreator.mutate({ id, assigned_to: to })}
                />
              </TabsContent>
            )}
          </Tabs>
          </>
        )}
      </div>

      <NewCreatorModal
        open={showNew}
        onOpenChange={setShowNew}
        onSubmit={(data) => createCreator.mutate(data, { onSuccess: () => setShowNew(false) })}
        isLoading={createCreator.isPending}
      />
      <ViewCreatorModal creator={viewCreator} open={!!viewCreator} onOpenChange={(o) => !o && setViewCreator(null)} />
      <EditCreatorModal
        creator={editCreator}
        open={!!editCreator}
        onOpenChange={(o) => !o && setEditCreator(null)}
        onSubmit={(id, data) => updateCreator.mutate({ id, ...data }, { onSuccess: () => setEditCreator(null) })}
        isLoading={updateCreator.isPending}
      />
      <DeleteCreatorDialog
        creator={deletingCreator}
        open={!!deletingCreator}
        onOpenChange={(o) => !o && setDeletingCreator(null)}
        onConfirm={(id) => deleteCreator.mutate(id, { onSuccess: () => setDeletingCreator(null) })}
      />
    </main>
  );
};

export default ClosersContent;
