import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AtSign, Check, Copy, KeyRound, Loader2, Mail, User, UserCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DOMINIO_CASILLA, sugerirDireccion } from "@/lib/direccionCorreo";

/**
 * Alta de usuario: NOMBRE, APELLIDO, ROL y el TIPO de correo.
 *
 * Dos modos (decisión de Jhon, 23/08/2026):
 *  · Casilla Maven (default): el correo de acceso se genera del nombre
 *    (juan.perez@maven-ai.me; ocupado → juan.perez1@...) y es a la vez la
 *    casilla — identidad = casilla. La contraseña temporal aparece acá al
 *    terminar y el admin la entrega EN MANO (mandarla a una casilla que
 *    se abre con esa misma contraseña es el círculo vicioso).
 *  · Correo externo: se escribe el correo de la persona, entra con ese, y
 *    la contraseña temporal LE LLEGA AHÍ (el flujo de siempre). No se le
 *    crea casilla @maven-ai.me.
 *
 * El backend ya distingue solo: con `email` no provisiona casilla y manda
 * la bienvenida por Resend; sin `email` genera la dirección y no manda nada.
 */


export interface NuevoUsuario {
  first_name: string;
  last_name: string;
  role?: string;
  /** Solo en modo "correo externo": el login es este correo y la
   *  contraseña temporal viaja ahí. Ausente = casilla Maven generada. */
  email?: string;
}

/** Lo que el backend devuelve y el admin tiene que ENTREGAR (o confirmar
 *  que ya viajó por correo, según el modo). */
export interface CredencialesCreadas {
  email: string;
  temp_password: string;
  /** true = la contraseña NO viajó por correo: el admin la entrega en mano. */
  hand_delivery: boolean;
  email_sent: boolean;
  email_sent_to: string | null;
  email_error: string | null;
  mailbox_ok: boolean;
  mailbox_error?: string | null;
}

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: NuevoUsuario) => void;
  isLoading: boolean;
  /** Al llegar, el modal pasa a la vista de entrega de credenciales. */
  credenciales?: CredencialesCreadas | null;
}

const AddUserModal = ({ open, onOpenChange, onConfirm, isLoading, credenciales }: AddUserModalProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("employee");
  const [tipoCorreo, setTipoCorreo] = useState<"maven" | "externo">("maven");
  const [emailExterno, setEmailExterno] = useState("");
  const [copiado, setCopiado] = useState<"correo" | "clave" | null>(null);

  // Resetea el form cada vez que el modal se abre (el cierre programático
  // del padre no dispara onOpenChange, y el form quedaba sucio).
  useEffect(() => {
    if (open) {
      setFirstName("");
      setLastName("");
      setRole("employee");
      setTipoCorreo("maven");
      setEmailExterno("");
      setCopiado(null);
    }
  }, [open]);

  const sugerida = useMemo(
    () => sugerirDireccion(firstName, lastName),
    [firstName, lastName],
  );

  const { data: roles = [] } = useQuery({
    queryKey: ["roles-config-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles_config")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const externoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailExterno.trim());
  // El apellido NO entra acá: es opcional (hay gente con un solo nombre y
  // buzones funcionales como capturados@ que no tienen apellido).
  const puedeEnviar =
    !!firstName.trim() &&
    (tipoCorreo === "maven" || externoValido);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar) return;
    onConfirm({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
      ...(tipoCorreo === "externo" ? { email: emailExterno.trim().toLowerCase() } : {}),
    });
  };

  const copiar = async (texto: string, cual: "correo" | "clave") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      // Sin permiso de portapapeles: el texto queda visible para copiarlo a mano.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {credenciales ? (
          /* ── Vista de ENTREGA: esto es lo que el admin le pasa a la persona ── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-success" />
                Usuario creado
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {credenciales.hand_delivery ? (
                /* Casilla Maven: la contraseña se entrega en mano. */
                <>
                  <p className="text-sm text-muted-foreground">
                    Entregale estos datos a la persona. La contraseña
                    <strong> no se muestra de nuevo</strong>: si se pierde, se le
                    hace un reset desde acá mismo.
                  </p>

                  <Credencial
                    etiqueta="Correo de acceso"
                    valor={credenciales.email}
                    icono={Mail}
                    copiado={copiado === "correo"}
                    onCopiar={() => copiar(credenciales.email, "correo")}
                  />
                  <Credencial
                    etiqueta="Contraseña temporal"
                    valor={credenciales.temp_password}
                    icono={KeyRound}
                    mono
                    copiado={copiado === "clave"}
                    onCopiar={() => copiar(credenciales.temp_password, "clave")}
                  />

                  {credenciales.mailbox_ok ? (
                    <p className="text-xs text-muted-foreground">
                      La casilla de correo quedó creada y aparece en la pestaña
                      Correo al entrar.
                    </p>
                  ) : (
                    <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                      El acceso a Maven quedó bien, pero la casilla de correo no
                      se pudo crear{credenciales.mailbox_error ? ` (${credenciales.mailbox_error})` : ""}.
                      Se puede reintentar después sin romper nada.
                    </p>
                  )}
                </>
              ) : credenciales.email_sent ? (
                /* Correo externo y el envío salió: no hay nada que entregar. */
                <>
                  <p className="text-sm text-muted-foreground">
                    La contraseña temporal ya le llegó por correo a{" "}
                    <strong className="text-foreground">{credenciales.email_sent_to}</strong>.
                    No hay nada que entregar en mano.
                  </p>
                  <Credencial
                    etiqueta="Correo de acceso"
                    valor={credenciales.email}
                    icono={Mail}
                    copiado={copiado === "correo"}
                    onCopiar={() => copiar(credenciales.email, "correo")}
                  />
                </>
              ) : (
                /* Correo externo pero el envío FALLÓ: el fallback es la
                   entrega en mano — sin esto la persona queda sin poder
                   entrar y nadie se entera. */
                <>
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
                    La cuenta quedó creada pero <strong>el correo con la
                    contraseña no salió</strong>
                    {credenciales.email_error ? ` (${credenciales.email_error})` : ""}.
                    Entregale estos datos en mano:
                  </p>
                  <Credencial
                    etiqueta="Correo de acceso"
                    valor={credenciales.email}
                    icono={Mail}
                    copiado={copiado === "correo"}
                    onCopiar={() => copiar(credenciales.email, "correo")}
                  />
                  <Credencial
                    etiqueta="Contraseña temporal"
                    valor={credenciales.temp_password}
                    icono={KeyRound}
                    mono
                    copiado={copiado === "clave"}
                    onCopiar={() => copiar(credenciales.temp_password, "clave")}
                  />
                </>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Vista de ALTA: nombre, apellido y rol ── */
          <>
            <DialogHeader>
              <DialogTitle>Agregar Usuario</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    placeholder="Nombre"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-9"
                    required
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">
                  Apellido <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="lastName"
                    placeholder="Apellido"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="pl-9"
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Correo de acceso</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoCorreo("maven")}
                    className={
                      "rounded-lg border px-3 py-2 text-left text-xs transition-colors " +
                      (tipoCorreo === "maven"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50")
                    }
                  >
                    <span className="block font-semibold">Casilla Maven</span>
                    <span className="block text-[11px] opacity-80">Se genera del nombre</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoCorreo("externo")}
                    className={
                      "rounded-lg border px-3 py-2 text-left text-xs transition-colors " +
                      (tipoCorreo === "externo"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50")
                    }
                  >
                    <span className="block font-semibold">Correo externo</span>
                    <span className="block text-[11px] opacity-80">Gmail, etc.</span>
                  </button>
                </div>
              </div>

              {tipoCorreo === "maven" ? (
                sugerida && (
                  <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5">
                    <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                    <p className="text-xs text-muted-foreground">
                      Va a entrar con <strong className="text-foreground">{sugerida}</strong>,
                      que es también su casilla de correo. Si ese nombre ya está
                      ocupado, se le agrega un número solo. La contraseña la
                      entregas tú en mano al terminar.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="persona@gmail.com"
                      value={emailExterno}
                      onChange={(e) => setEmailExterno(e.target.value)}
                      className="pl-9"
                      required
                      maxLength={120}
                    />
                  </div>
                  <p className="rounded-lg bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
                    Va a entrar con ese correo y <strong className="text-foreground">la
                    contraseña temporal le llega ahí</strong> — no hay nada que
                    entregar en mano. No se le crea casilla @{DOMINIO_CASILLA}.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.name}>
                        {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading || !puedeEnviar}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Agregar
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

function Credencial({
  etiqueta,
  valor,
  icono: Icono,
  mono,
  copiado,
  onCopiar,
}: {
  etiqueta: string;
  valor: string;
  icono: React.ComponentType<{ className?: string }>;
  mono?: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={mono ? "flex-1 font-mono text-sm tracking-wider" : "flex-1 truncate text-sm"}>
          {valor}
        </span>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCopiar}>
          {copiado ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export default AddUserModal;
