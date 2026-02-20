import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTickets, type TicketWithCreator } from "./useTickets";
import TicketsFilters from "./TicketsFilters";
import TicketsList from "./TicketsList";
import TicketsGrid from "./TicketsGrid";
import CreateTicketModal from "./CreateTicketModal";
import ViewTicketModal from "./ViewTicketModal";
import EditTicketModal from "./EditTicketModal";
import DeleteTicketDialog from "./DeleteTicketDialog";

const TicketsContent = () => {
  const { ticketsQuery } = useTickets();
  const [modalOpen, setModalOpen] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");

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
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Customer Service</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de soporte y escalaciones
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Ticket
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-4">
      <Tabs defaultValue="list">
        <TabsList className="mb-4">
          <TabsTrigger value="list">Lista de Tickets</TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
        </TabsList>

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

        <TabsContent value="calendar">
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <p>Calendario de tickets — próximamente</p>
          </div>
        </TabsContent>
      </Tabs>

      <CreateTicketModal open={modalOpen} onOpenChange={setModalOpen} />
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
