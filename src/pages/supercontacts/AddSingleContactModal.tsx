import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Instagram } from "lucide-react";
import { useCreateSuperContact } from "./useSuperContacts";
import { getCountryOptions } from "@/lib/country-utils";
import { getCitiesByCountryCode } from "@/lib/city-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const countryOptions = getCountryOptions();

const AddSingleContactModal = ({ open, onOpenChange }: Props) => {
  const [handle, setHandle] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const createMutation = useCreateSuperContact();

  const cities = getCitiesByCountryCode(country);

  const cleanHandle = (val: string) => {
    const match = val.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
    if (match) return match[1];
    return val.replace(/^@/, "").trim();
  };

  const handleSubmit = async () => {
    const cleaned = cleanHandle(handle);
    if (!cleaned) return;
    const finalCity = city === "__other__" ? customCity.trim() : city;
    await createMutation.mutateAsync({
      instagram_handle: cleaned,
      full_name: fullName.trim() || null,
      country: country || null,
      city: finalCity || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    onOpenChange(false);
    setHandle("");
    setFullName("");
    setCountry("");
    setCity("");
    setCustomCity("");
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
              <Select value={country} onValueChange={(v) => { setCountry(v); setCity(""); setCustomCity(""); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
                <SelectContent>
                  {countryOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              {cities.length > 0 ? (
                <>
                  <Select value={city} onValueChange={setCity}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar ciudad" /></SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="__other__">Otra…</SelectItem>
                    </SelectContent>
                  </Select>
                  {city === "__other__" && (
                    <Input
                      value={customCity}
                      onChange={(e) => setCustomCity(e.target.value)}
                      placeholder="Escribe la ciudad"
                      className="mt-1.5"
                    />
                  )}
                </>
              ) : (
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300..." />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
            </div>
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
