import { useState } from "react";
import InvoiceA4Preview from "./InvoiceA4Preview";
import { useQuery } from "@tanstack/react-query";
import DataTableShell from "@/components/ui/data-table-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CreateTemplateModal from "./CreateTemplateModal";

interface Template {
  id: string;
  name: string;
  type: string;
  company_name: string | null;
  company_address: string | null;
  company_email: string | null;
  logo_url: string | null;
  created_by: string | null;
  created_at: string;
  creator_name?: string;
}

export default function TemplatesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [viewTemplate, setViewTemplate] = useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["invoice-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch creator names
      const userIds = [...new Set((data ?? []).map(t => t.created_by).filter(Boolean))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name || "—"]));
      }

      return (data ?? []).map(t => ({
        ...t,
        creator_name: t.created_by ? profileMap[t.created_by] || "—" : "—",
      })) as Template[];
    },
  });

  const openEdit = (t: Template) => {
    setEditTemplate(t);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditTemplate(null);
    setModalOpen(true);
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <span>Facturación</span>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">Templates</span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Templates</h1>
            <p className="text-sm text-muted-foreground">Gestiona templates para invoices y notas de pago</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Crear Template
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Cargando...</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">No hay templates</p>
            <p className="text-sm mt-1">Crea tu primer template para personalizar tus documentos</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha creación</TableHead>
                <TableHead>Creador</TableHead>
                <TableHead className="text-right w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === "invoice" ? "default" : "secondary"}>
                      {t.type === "invoice" ? "Invoice" : "Nota de pago"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(t.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.creator_name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewTemplate(t)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CreateTemplateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        template={editTemplate}
        key={editTemplate?.id || "new"}
      />

      {/* View modal */}
      {viewTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setViewTemplate(null)}>
          <div className="bg-muted rounded-lg p-6 max-w-2xl w-full mx-4 space-y-4 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{viewTemplate.name}</h3>
            <div className="flex justify-center">
              <InvoiceA4Preview
                invoice={{}}
                template={{
                  company_name: viewTemplate.company_name,
                  company_address: viewTemplate.company_address,
                  company_email: viewTemplate.company_email,
                  logo_url: viewTemplate.logo_url,
                }}
              />
            </div>
            <Button variant="outline" className="w-full" onClick={() => setViewTemplate(null)}>Cerrar</Button>
          </div>
        </div>
      )}
    </main>
  );
}
