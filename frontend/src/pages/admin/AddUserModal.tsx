import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AtSign, LifeBuoy, Mail, User, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Dominio de las casillas del equipo. Solo se usa para SUGERIR la
 *  dirección; el admin puede escribir la que quiera. */
const DOMINIO_CASILLA = "maven-ai.me";

export interface NuevoUsuario {
  email: string;
  first_name: string;
  last_name: string;
  role?: string;
  /** Correo personal, fuera de Maven. Ver la nota del campo. */
  recovery_email?: string;
  /** Casilla de trabajo a crear. Si va vacía, no se provisiona nada. */
  mailbox_email?: string;
}

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: NuevoUsuario) => void;
  isLoading: boolean;
}

/** `José Pérez` → `jose.perez`. Sin tildes ni eñes: una dirección de
 *  correo con caracteres acentuados funciona mal en medio mundo. */
function sugerirCasilla(nombre: string, apellido: string): string {
  const limpiar = (s: string) =>
    s.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  const n = limpiar(nombre);
  const a = limpiar(apellido);
  if (!n && !a) return "";
  return `${[n, a].filter(Boolean).join(".")}@${DOMINIO_CASILLA}`;
}

const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AddUserModal = ({ open, onOpenChange, onConfirm, isLoading }: AddUserModalProps) => {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("employee");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [mailbox, setMailbox] = useState("");
  // Mientras el admin no toque la casilla a mano, la seguimos sugiriendo
  // a partir del nombre. En cuanto la edita, dejamos de pisársela.
  const [casillaEditada, setCasillaEditada] = useState(false);

  const limpiar = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole("employee");
    setRecoveryEmail("");
    setMailbox("");
    setCasillaEditada(false);
  };

  // Resetea el form cada vez que el modal se abre. Antes solo se
  // limpiaba cuando el usuario cerraba el diálogo (Esc / click fuera /
  // Cancelar) — pero cuando el padre lo cierra programáticamente al
  // guardar (`setAddUserOpen(false)` en el onSuccess), el callback
  // onOpenChange del Dialog no dispara, entonces los campos quedaban
  // pegados con los datos del último usuario creado y la próxima
  // apertura mostraba el form sucio.
  useEffect(() => {
    if (open) limpiar();
  }, [open]);

  const sugerida = useMemo(
    () => sugerirCasilla(firstName, lastName),
    [firstName, lastName],
  );
  useEffect(() => {
    if (!casillaEditada) setMailbox(sugerida);
  }, [sugerida, casillaEditada]);

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

  // Si la dirección de login ES la casilla interna, la contraseña temporal
  // viajaría a un buzón que solo se lee desde adentro de Maven: la persona
  // necesitaría entrar para poder entrar.
  const seEncierra =
    !recoveryEmail.trim() &&
    ES_CORREO.test(email.trim()) &&
    email.trim().toLowerCase().endsWith(`@${DOMINIO_CASILLA}`);

  const recoveryInvalido =
    !!recoveryEmail.trim() && !ES_CORREO.test(recoveryEmail.trim());

  const completo =
    !!email.trim() && !!firstName.trim() && !!lastName.trim() && !recoveryInvalido;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completo) return;
    onConfirm({
      email: email.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
      recovery_email: recoveryEmail.trim() || undefined,
      mailbox_email: mailbox.trim() || undefined,
    });
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) limpiar();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar Usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="email">Correo para entrar a Maven</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                  maxLength={255}
                />
              </div>
            </div>

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
              <Label htmlFor="lastName">Apellido</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="lastName"
                  placeholder="Apellido"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="pl-9"
                  required
                  maxLength={50}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recoveryEmail">Correo personal</Label>
              <div className="relative">
                <LifeBuoy className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="recoveryEmail"
                  type="email"
                  placeholder="personal@gmail.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  className="pl-9"
                  maxLength={255}
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ahí le llegan la contraseña temporal y los links para recuperar
                la cuenta. Es la única forma de destrabar a alguien que se
                olvidó la contraseña.
              </p>
              {recoveryInvalido && (
                <p className="text-xs text-destructive">No parece una dirección válida.</p>
              )}
            </div>

            {seEncierra && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-muted-foreground">
                  Sin correo personal, esta persona va a quedar encerrada afuera
                  si olvida su contraseña: el link de recuperación le llegaría a
                  una casilla que solo se lee entrando a Maven.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mailbox">Casilla de trabajo</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="mailbox"
                  type="email"
                  placeholder={`nombre.apellido@${DOMINIO_CASILLA}`}
                  value={mailbox}
                  onChange={(e) => {
                    setCasillaEditada(true);
                    setMailbox(e.target.value);
                  }}
                  className="pl-9"
                  maxLength={255}
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se crea sola y aparece en la pestaña Correo. Dejala vacía si
                esta persona no necesita casilla.
              </p>
            </div>

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
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !completo}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserModal;
