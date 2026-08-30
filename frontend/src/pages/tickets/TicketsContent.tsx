import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTickets, type TicketWithCreator } from "./useTickets";
import TicketsFilters from "./TicketsFilters";
import TicketsList from "./TicketsList";
import TicketsGrid from "./TicketsGrid";
import NewTicketLauncher from "./NewTicketLauncher";
import TicketFormsManager from "./TicketFormsManager";
import TicketFormEditor from "./TicketFormEditor";
import ViewTicketModal from "./ViewTicketModal";
import EditTicketModal from "./EditTicketModal";
import DeleteTicketDialog from "./DeleteTicketDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/ui/page-header";

const TicketsContent = () => {
  const { canAccess } = usePermissions();
  // Gates: el fallback de canAccess concede a quien tenga el módulo Tickets, así que
  // hoy nadie pierde acceso; solo permite restringir por rol desde el modal de permisos.
  const canCreate = canAccess("Tickets", "Crear Ticket");
  const canSeeList = canAccess("Tickets", "Lista de Tickets");
  // Constructor de plantillas: mismo permiso que lee la RLS de ticket_forms.
  const canManageForms = canAccess("Tickets", "Gestionar Plantillas");
  const { ticketsQuery } = useTickets();
  const [view, setView] = useState<"list" | "grid">("list");
  const [tab, setTab] = useState(canCreate ? "new" : "list");
  // Boton principal del header. Para quien administra plantillas, la accion
  // valiosa es CREAR una plantilla nueva (el equivalente a "Formulario en
  // blanco" de Google Forms), no elegir entre las existentes. Para el resto es
  // levantar un ticket, y ahi abre el selector de plantilla.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<TicketWithCreator | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const tickets = ticketsQuery.data || [];

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const num = t.id.slice(0, 6).toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.description || "").toLowerCase().includes(q) &&
          !num.includes(q)
        )
          return false;
      }
      if (priority && t.priority !== priority) return false;
      if (ticketType && t.ticket_type !== ticketType) return false;
      if (status && t.status !== status) return false;
      if (company && t.company !== company) return false;
      if (assignedTo && t.assigned_to !== assignedTo) return false;
      if (dateFrom && t.created_at && t.created_at < dateFrom) return false;
      if (dateTo && t.created_at && t.created_at > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [tickets, search, priority, ticketType, status, company, assignedTo, dateFrom, dateTo]);

  const handleView = (ticket: TicketWithCreator) => {
    setSelectedTicket(ticket);
    setViewOpen(true);
  };

  const handleEdit = (ticket: TicketWithCreator) => {
    setSelectedTicket(ticket);
    setEditOpen(true);
  };

  const handleDelete = (ticket: TicketWithCreator) => {
    setSelectedTicket(ticket);
    setDeleteOpen(true);
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <PageHeader
          title="Customer Service"
          subtitle="Gestión de soporte y escalaciones"
          actions={
            canManageForms ? (
              <Button onClick={() => setBuilderOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nueva plantilla
              </Button>
            ) : (
              canCreate && (
                <Button onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nuevo Ticket
                </Button>
              )
            )
          }
        />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          {canCreate && <TabsTrigger value="new">Nuevo Ticket</TabsTrigger>}
          {canSeeList && <TabsTrigger value="list">Lista de Tickets</TabsTrigger>}
          {canManageForms && <TabsTrigger value="forms">Plantillas</TabsTrigger>}
        </TabsList>

        {canCreate && (
        <TabsContent value="new" className="space-y-4">
          <div>
            <h2 className="text-sm font-medium">¿Qué tipo de ticket quieres levantar?</h2>
            <p className="text-xs text-muted-foreground">
              Elige una plantilla y completa el formulario. El código se asigna solo.
            </p>
          </div>

          <NewTicketLauncher canCreate={canCreate} canManageForms={canManageForms} />
        </TabsContent>
        )}

        {canSeeList && (
        <TabsContent value="list" className="space-y-4">
          <TicketsFilters
            search={search} onSearchChange={setSearch}
            priority={priority} onPriorityChange={setPriority}
            ticketType={ticketType} onTicketTypeChange={setTicketType}
            status={status} onStatusChange={setStatus}
            company={company} onCompanyChange={setCompany}
            assignedTo={assignedTo} onAssignedToChange={setAssignedTo}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            view={view} onViewChange={setView}
            hasActiveFilters={!!(search || priority || ticketType || status || company || assignedTo || dateFrom || dateTo)}
            onClear={() => { setSearch(""); setPriority(""); setTicketType(""); setStatus(""); setCompany(""); setAssignedTo(""); setDateFrom(""); setDateTo(""); }}
          />

          <p className="text-xs text-muted-foreground">{filtered.length} tickets</p>

          {ticketsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Cargando tickets...</p>
          ) : view === "list" ? (
            <TicketsList tickets={filtered} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
          ) : (
            <TicketsGrid tickets={filtered} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
          )}
        </TabsContent>
        )}

        {canManageForms && (
        <TabsContent value="forms">
          <TicketFormsManager />
        </TabsContent>
        )}
      </Tabs>

      {canManageForms && (
        <TicketFormEditor form={null} open={builderOpen} onOpenChange={setBuilderOpen} />
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nuevo ticket</DialogTitle>
            <DialogDescription>
              Elegi una plantilla y completa el formulario. El codigo se asigna solo.
            </DialogDescription>
          </DialogHeader>
          <NewTicketLauncher canCreate={canCreate} canManageForms={canManageForms} />
        </DialogContent>
      </Dialog>

      {selectedTicket && (
        <>
          <ViewTicketModal
            open={viewOpen}
            onOpenChange={setViewOpen}
            ticket={selectedTicket}
            onEdit={() => { setViewOpen(false); setEditOpen(true); }}
            onDelete={() => { setViewOpen(false); setDeleteOpen(true); }}
          />
          <EditTicketModal
            open={editOpen}
            onOpenChange={setEditOpen}
            ticket={selectedTicket}
          />
          <DeleteTicketDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            ticket={selectedTicket}
          />
        </>
      )}
      </div>
    </main>
  );
};

export default TicketsContent;
