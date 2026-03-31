import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Image as ImageIcon } from "lucide-react";

interface TemplateData {
  id?: string;
  name: string;
  type: string;
  company_name?: string;
  company_address?: string;
  company_email?: string;
  logo_url?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateData | null;
}

export default function CreateTemplateModal({ open, onOpenChange, template }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!template?.id;

  
  const [type, setType] = useState(template?.type || "invoice");
  const [companyName, setCompanyName] = useState(template?.company_name || "");
  const [companyAddress, setCompanyAddress] = useState(template?.company_address || "");
  const [companyEmail, setCompanyEmail] = useState(template?.company_email || "");
  const [companyZip, setCompanyZip] = useState((template as any)?.company_zip || "");
  const [logoUrl, setLogoUrl] = useState(template?.logo_url || "");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const resetForm = () => {
    setType("invoice"); setCompanyName(""); setCompanyAddress(""); setCompanyZip(""); setCompanyEmail(""); setLogoUrl("");
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Solo se permiten imágenes", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("template-logos").upload(path, file);
    if (error) {
      toast({ title: "Error al subir logo", variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("template-logos").getPublicUrl(path);
    setLogoUrl(urlData.publicUrl);
    setUploading(false);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const typeLabel = type === "invoice" ? "Invoice" : "Nota de pago";
      const payload: any = {
        name: `${companyName || "Template"} - ${typeLabel}`, type,
        company_name: type === "invoice" ? companyName || null : null,
        company_address: type === "invoice" ? companyAddress || null : null,
        company_zip: type === "invoice" ? companyZip || null : null,
        company_email: type === "invoice" ? companyEmail || null : null,
        logo_url: type === "invoice" ? logoUrl || null : null,
      };
      if (isEdit) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from("invoice_templates").update(payload).eq("id", template!.id!);
        if (error) throw error;
      } else {
        payload.created_by = user.user?.id;
        const { error } = await supabase.from("invoice_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-templates"] });
      toast({ title: isEdit ? "Template actualizado" : "Template creado" });
      resetForm();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Template" : "Crear Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo de template</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="nota_pago">Nota de pago</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "invoice" && (
            <>
              <div>
                <Label>Nombre de la compañía</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ej: KASH AGENCY" />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="Ej: 333 SE 2nd Ave, Miami, FL" />
              </div>
              <div>
                <Label>Código postal</Label>
                <Input value={companyZip} onChange={e => setCompanyZip(e.target.value)} placeholder="Ej: 33131" />
              </div>
              <div>
                <Label>Correo electrónico</Label>
                <Input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} placeholder="Ej: billing@company.com" />
              </div>
              <div>
                <Label>Logo de la compañía</Label>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file"; input.accept = "image/*";
                    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); };
                    input.click();
                  }}
                >
                  {logoUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={logoUrl} alt="Logo" className="h-16 object-contain" />
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={e => { e.stopPropagation(); setLogoUrl(""); }}
                      >
                        <X className="h-3 w-3 inline mr-1" />Eliminar
                      </button>
                    </div>
                  ) : uploading ? (
                    <p className="text-sm text-muted-foreground">Subiendo...</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8" />
                      <p className="text-sm">Arrastra o haz clic para subir logo</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!companyName || mutation.isPending}>
            {isEdit ? "Guardar" : "Crear Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
