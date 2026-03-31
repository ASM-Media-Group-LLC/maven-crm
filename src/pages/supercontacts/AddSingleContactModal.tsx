import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Instagram } from "lucide-react";
import { useCreateSuperContact } from "./useSuperContacts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddSingleContactModal = ({ open, onOpenChange }: Props) => {
  const [handle, setHandle] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const createMutation = useCreateSuperContact();

  const cleanHandle = (val: string) => {
    const match = val.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
    if (match) return match[1];
    return val.replace(/^@/, "").trim();
  };

  const handleSubmit = async () => {
    const cleaned = cleanHandle(handle);
    if (!cleaned) return;
    await createMutation.mutateAsync({
      instagram_handle: cleaned,
      full_name: fullName.trim() || null,
      country: country.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    onOpenChange(false);
    setHandle("");
    setFullName("");
    setCountry("");
    setPhone("");
    setEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" /> Agregar Contacto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Handle de Instagram *</Label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@creadora o https://instagram.com/creadora"
            />
            <p className="text-xs text-muted-foreground">Acepta handle, @handle o URL completa</p>
          </div>

          <div className="space-y-1.5">
            <Label>Nombre completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre de la persona" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>País</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Colombia" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300..." />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!handle.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Guardando..." : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddSingleContactModal;
