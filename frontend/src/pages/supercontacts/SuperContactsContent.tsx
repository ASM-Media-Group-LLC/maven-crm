import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, UserPlus, MessageCircle, UserCheck, Instagram } from "lucide-react";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { useSuperContacts } from "./useSuperContacts";
import { getCountryDisplay } from "@/lib/country-utils";
import ImportModal from "./ImportModal";
import AddSingleContactModal from "./AddSingleContactModal";

interface SuperContactsContentProps {
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
  addSingleOpen: boolean;
  setAddSingleOpen: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  nuevo: { label: "Nuevo", variant: "secondary" },
  contactado: { label: "Contactado", variant: "default" },
  interesado: { label: "Interesado", variant: "default" },
  no_interesado: { label: "No interesado", variant: "destructive" },
  convertido: { label: "Convertido", variant: "outline" },
};

const SuperContactsContent = ({ importOpen, setImportOpen, addSingleOpen, setAddSingleOpen }: SuperContactsContentProps) => {
  const { data: contacts = [], isLoading } = useSuperContacts();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  // Derive unique cities for filter
  const cities = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => { if (c.city) set.add(c.city); });
    return Array.from(set).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.instagram_handle.toLowerCase().includes(q) ||
          (c.full_name && c.full_name.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (cityFilter !== "all") {
      list = list.filter((c) => c.city === cityFilter);
    }
    return list;
  }, [contacts, search, statusFilter, cityFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { total: contacts.length, nuevo: 0, contactado: 0, interesado: 0, convertido: 0 };
    contacts.forEach((c) => { map[c.status] = (map[c.status] || 0) + 1; });
    return map;
  }, [contacts]);

  type KpiKey = "total" | "nuevo" | "contactado" | "convertido";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const kpis = [
    { key: "total" as KpiKey, label: "Total", value: counts.total, icon: Users, color: "bg-primary" },
    { key: "nuevo" as KpiKey, label: "Nuevos", value: counts.nuevo, icon: UserPlus, color: "bg-primary" },
    { key: "contactado" as KpiKey, label: "Contactados", value: counts.contactado, icon: MessageCircle, color: "bg-warning" },
    { key: "convertido" as KpiKey, label: "Convertidos", value: counts.convertido, icon: UserCheck, color: "bg-success" },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs — clickeables, abren modal */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <StatChip
            key={k.label}
            label={k.label}
            value={k.value}
            icon={<k.icon className="h-3.5 w-3.5" />}
            color={k.color}
            onClick={() => setKpiPopup(k.key)}
          />
        ))}
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por handle o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="nuevo">Nuevo</SelectItem>
            <SelectItem value="contactado">Contactado</SelectItem>
            <SelectItem value="interesado">Interesado</SelectItem>
            <SelectItem value="no_interesado">No interesado</SelectItem>
            <SelectItem value="convertido">Convertido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ciudad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las ciudades</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Handle</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Seguidores</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay contactos. Agrega tu primer contacto.</TableCell></TableRow>
              ) : (
                filtered.map((c) => {
                  const st = statusConfig[c.status] || statusConfig.nuevo;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/wishlist/${c.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {c.profile_photo_url ? (
                            <img src={c.profile_photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <Instagram className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium">@{c.instagram_handle}</span>
                        </div>
                      </TableCell>
                      <TableCell>{c.full_name || "—"}</TableCell>
                      <TableCell>{c.followers_count?.toLocaleString() || "—"}</TableCell>
                      <TableCell>{getCountryDisplay(c.country)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.city || "—"}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ImportModal open={importOpen} onOpenChange={setImportOpen} />
      <AddSingleContactModal open={addSingleOpen} onOpenChange={setAddSingleOpen} />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Contactos — ${counts.total}`;
            case "nuevo": return `Nuevos — ${counts.nuevo}`;
            case "contactado": return `Contactados — ${counts.contactado}`;
            case "convertido": return `Convertidos — ${counts.convertido}`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "total": return "Wishlist completa";
            case "nuevo": return "Sin interacción aún";
            case "contactado": return "Con seguimiento iniciado";
            case "convertido": return "Pasaron a creadoras";
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = contacts;
          if (kpiPopup === "nuevo") list = contacts.filter(c => c.status === "nuevo");
          else if (kpiPopup === "contactado") list = contacts.filter(c => c.status === "contactado");
          else if (kpiPopup === "convertido") list = contacts.filter(c => c.status === "convertido");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "convertido" ? "success" :
            status === "no_interesado" ? "destructive" :
            status === "contactado" || status === "interesado" ? "default" :
            "warning";
          return list.slice(0, 100).map((c): KpiRow => ({
            primary: c.full_name || `@${c.instagram_handle}`,
            secondary: c.city ? `${c.city}${c.followers_count ? ` · ${c.followers_count.toLocaleString()} followers` : ""}` : c.followers_count ? `${c.followers_count.toLocaleString()} followers` : undefined,
            right: statusConfig[c.status]?.label ?? c.status,
            rightTone: tone(c.status),
          }));
        })()}
      />
    </div>
  );
};

export default SuperContactsContent;
