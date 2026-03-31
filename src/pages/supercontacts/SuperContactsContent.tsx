import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, Users, UserPlus, MessageCircle, UserCheck, Instagram } from "lucide-react";
import { useSuperContacts } from "./useSuperContacts";
import ImportModal from "./ImportModal";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  nuevo: { label: "Nuevo", variant: "secondary" },
  contactado: { label: "Contactado", variant: "default" },
  interesado: { label: "Interesado", variant: "default" },
  no_interesado: { label: "No interesado", variant: "destructive" },
  convertido: { label: "Convertido", variant: "outline" },
};

const SuperContactsContent = () => {
  const { data: contacts = [], isLoading } = useSuperContacts();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);

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
    return list;
  }, [contacts, search, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { total: contacts.length, nuevo: 0, contactado: 0, interesado: 0, convertido: 0 };
    contacts.forEach((c) => { map[c.status] = (map[c.status] || 0) + 1; });
    return map;
  }, [contacts]);

  const kpis = [
    { label: "Total", value: counts.total, icon: Users, color: "text-primary" },
    { label: "Nuevos", value: counts.nuevo, icon: UserPlus, color: "text-blue-400" },
    { label: "Contactados", value: counts.contactado, icon: MessageCircle, color: "text-amber-400" },
    { label: "Convertidos", value: counts.convertido, icon: UserCheck, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="group hover:scale-[1.03] transition-transform">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold">{k.value}</p>
              </div>
              <div className={`rounded-lg bg-muted p-2 ${k.color}`}>
                <k.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
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
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4 mr-2" /> Importar
        </Button>
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
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No hay contactos. Importa tu primera lista.</TableCell></TableRow>
              ) : (
                filtered.map((c) => {
                  const st = statusConfig[c.status] || statusConfig.nuevo;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/supercontacts/${c.id}`)}>
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
                      <TableCell>{c.country || "—"}</TableCell>
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
    </div>
  );
};

export default SuperContactsContent;
