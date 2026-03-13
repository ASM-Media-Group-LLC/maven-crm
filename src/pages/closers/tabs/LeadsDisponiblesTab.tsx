import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, X, UserPlus } from "lucide-react";
import { useLeadsDisponibles, LeadDisponible } from "../hooks/useLeadsDisponibles";

const QUALITIES = ["A+", "A", "B", "C"];

const LeadsDisponiblesTab = () => {
  const {
    leads, isLoading, search, setSearch,
    qualityFilter, setQualityFilter,
    dateFrom, setDateFrom, dateTo, setDateTo,
    reclamarLead,
  } = useLeadsDisponibles();

  const hasFilters = search || qualityFilter || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={qualityFilter} onValueChange={setQualityFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Calidad" />
          </SelectTrigger>
          <SelectContent>
            {QUALITIES.map((q) => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setQualityFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="h-4 w-4 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando leads...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay leads disponibles con los filtros actuales.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Handle</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Calidad</TableHead>
                <TableHead>Cuenta Origen</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">@{lead.model_handle}</TableCell>
                  <TableCell>{lead.platform}</TableCell>
                  <TableCell>
                    <Badge variant={lead.quality === "A+" ? "default" : "secondary"}>
                      {lead.quality || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.company || "—"}</TableCell>
                  <TableCell className="text-xs">{lead.phone_raw || "—"}</TableCell>
                  <TableCell className="text-xs">{lead.entry_date}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => reclamarLead.mutate(lead)}
                      disabled={reclamarLead.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Reclamar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Mostrando {leads.length} leads disponibles (máx. 500 por consulta)</p>
    </div>
  );
};

export default LeadsDisponiblesTab;
