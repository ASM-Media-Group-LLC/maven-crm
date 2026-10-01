import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import InvoiceA4Preview from "./InvoiceA4Preview";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DataTableShell from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Eye, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CreateTemplateModal from "./CreateTemplateModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";

interface Template {
  id: string;
  name: string;
  type: string;
  company_name: string | null;
  company_address: string | null;
  company_zip: string | null;
  company_email: string | null;
  logo_url: string | null;
  created_by: string | null;
  created_at: string;
  creator_name?: string;
}

export default function TemplatesPage() {
  const f = useFormato();
  const { t } = useLanguage();
  const [deleteTemplate, setDeleteTemplate] = useState<Template | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [viewTemplate, setViewTemplate] = useState<Template | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!deleteTemplate) return;
    const { error } = await supabase.from("invoice_templates").delete().eq("id", deleteTemplate.id);
    if (error) {
      toast({ title: t("common.errorDeleting"), variant: "destructive" });
    } else {
      toast({ title: t("finanzas.tpl.toast.deleted") });
      queryClient.invalidateQueries({ queryKey: ["invoice-templates"] });
    }
    setDeleteTemplate(null);
  };

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
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <span>{t("finanzas.common.billing")}</span>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">Templates</span>
        </nav>
        <PageHeader
          title="Templates"
          subtitle={t("finanzas.tpl.subtitle")}
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> {t("finanzas.tpl.create")}
            </Button>
          }
        />
      </header>

      <div className="flex-1 min-h-0 flex flex-col px-6 py-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("finanzas.common.loadingDots")}</p>
        ) : templates.length === 0 ? (
          <EmptyState seed="invoice-templates" title={t("finanzas.tpl.empty")} description={t("finanzas.tpl.emptyDesc")} />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-20rem)]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card border-b">
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.name")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.type")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.tpl.createdAt")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.tpl.createdBy")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((tpl) => (
                    <TableRow key={tpl.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm font-medium">{`${tpl.company_name || tpl.name} - ${tpl.type === "invoice" ? "Invoice" : t("finanzas.tpl.paymentNote")}`}</TableCell>
                      <TableCell>
                        <Badge variant={tpl.type === "invoice" ? "default" : "secondary"}>
                          {tpl.type === "invoice" ? "Invoice" : t("finanzas.tpl.paymentNote")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(tpl.created_at).toLocaleDateString(f.intl("es-ES"), { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tpl.creator_name}</TableCell>
                      <TableCell className="sticky right-0 bg-card group-hover:bg-muted">
                        <div className="flex items-center gap-1">
                          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewTemplate(tpl)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(tpl)}><Pencil className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.edit")}</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTemplate(tpl)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <CreateTemplateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        template={editTemplate}
        key={editTemplate?.id || "new"}
      />

      <Dialog open={!!viewTemplate} onOpenChange={() => setViewTemplate(null)}>
        <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden">
          {viewTemplate && (
            <InvoiceA4Preview
              invoice={{}}
              template={{
                company_name: viewTemplate.company_name,
                company_address: viewTemplate.company_address,
                company_zip: viewTemplate.company_zip,
                company_email: viewTemplate.company_email,
                logo_url: viewTemplate.logo_url,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTemplate} onOpenChange={() => setDeleteTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("finanzas.tpl.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              <ConFormato texto={t("finanzas.tpl.delete.desc", { name: deleteTemplate?.company_name || deleteTemplate?.name || "" })} claseNegrita="font-semibold" />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
