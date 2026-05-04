import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Instagram, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { useCreateSuperContact } from "./useSuperContacts";
import { getCountryOptions } from "@/lib/country-utils";
import { getCitiesByCountryCode } from "@/lib/city-data";
import { normalizeHandle } from "@/lib/handle-utils";
import { checkWishlistDuplicate, DuplicateResult } from "./useWishlistDuplicateCheck";
import { toast } from "@/hooks/use-toast";

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
  const [checking, setChecking] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null);
  const createMutation = useCreateSuperContact();

  const cities = getCitiesByCountryCode(country);

  const cleanHandle = (val: string) => {
    const match = val.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
    if (match) return match[1];
    return val.replace(/^@/, "").trim();
  };

  const handleCheck = async () => {
    const cleaned = cleanHandle(handle);
    if (!cleaned) return;
    setChecking(true);
    try {
      const result = await checkWishlistDuplicate(cleaned);
      if (result.found) {
        setDuplicate(result);
      } else {
        setDuplicate(null);
        await doSubmit(cleaned);
      }
    } finally {
      setChecking(false);
    }
  };

  const doSubmit = async (cleaned: string) => {
    const finalCity = city === "__other__" ? customCity.trim() : city;
    await createMutation.mutateAsync({
      instagram_handle: cleaned,
      full_name: fullName.trim() || null,
      country: country || null,
      city: finalCity || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    toast({ title: "Contacto agregado al Wishlist" });
    resetAndClose();
  };

  const handleForceAdd = async () => {
    const cleaned = cleanHandle(handle);
    if (!cleaned) return;
    setDuplicate(null);
    await doSubmit(cleaned);
  };

  const resetAndClose = () => {
    onOpenChange(false);
    setHandle("");
    setFullName("");
    setCountry("");
    setCity("");
    setCustomCity("");
    setPhone("");
    setEmail("");
    setDuplicate(null);
  };

  const formatDate = (d?: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" /> Agregar Contacto
          </DialogTitle>
        </DialogHeader>

        {/* Duplicate Warning */}
        {duplicate && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-amber-600">¡Este contacto ya existe!</p>
                <p><strong>Registrado en:</strong> {duplicate.sourceLabel}</p>
                {duplicate.name && <p><strong>Nombre:</strong> {duplicate.name}</p>}
                {duplicate.createdAt && <p><strong>Fecha:</strong> {formatDate(duplicate.createdAt)}</p>}
                {duplicate.createdByName && <p><strong>Agregado por:</strong> {duplicate.createdByName}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <a
                href={duplicate.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Ver Instagram
              </a>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDuplicate(null)}>
                Cancelar
              </Button>
              {duplicate.source !== "wishlist" && (
                <Button size="sm" variant="default" onClick={handleForceAdd}>
                  Agregar de todos modos
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Handle de Instagram *</Label>
            <Input
              value={handle}
              onChange={(e) => { setHandle(e.target.value); setDuplicate(null); }}
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
          <Button variant="outline" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleCheck} disabled={!handle.trim() || checking || createMutation.isPending}>
            {checking ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verificando...</>
            ) : createMutation.isPending ? "Guardando..." : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddSingleContactModal;
