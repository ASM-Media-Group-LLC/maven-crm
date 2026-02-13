import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTickets } from "./useTickets";
import TicketsFilters from "./TicketsFilters";
import TicketsList from "./TicketsList";
import CreateTicketModal from "./CreateTicketModal";

const TicketsContent = () => {
  const { ticketsQuery } = useTickets();
  const [modalOpen, setModalOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [ticketType, setTicketType] = useState("all");
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("all");
  const [assignedTo, setAssignedTo] = useState("all");
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
      if (priority !== "all" && t.priority !== priority) return false;
      if (ticketType !== "all" && t.ticket_type !== ticketType) return false;
      if (status !== "all" && t.status !== status) return false;
      if (company !== "all" && t.company !== company) return false;
      if (assignedTo !== "all" && t.assigned_to !== assignedTo) return false;
      if (dateFrom && t.created_at && t.created_at < dateFrom) return false;
      if (dateTo && t.created_at && t.created_at > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [tickets, search, priority, ticketType, status, company, assignedTo, dateFrom, dateTo]);

  return (
    <main className="flex-1 overflow-auto p-6 min-w-0">
      <div className="flex items-center justify-between mb-6">
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
          />

          <p className="text-xs text-muted-foreground">{filtered.length} tickets</p>

          {ticketsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Cargando tickets...</p>
          ) : (
            <TicketsList tickets={filtered} />
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <p>Calendario de tickets — próximamente</p>
          </div>
        </TabsContent>
      </Tabs>

      <CreateTicketModal open={modalOpen} onOpenChange={setModalOpen} />
    </main>
  );
};

export default TicketsContent;
