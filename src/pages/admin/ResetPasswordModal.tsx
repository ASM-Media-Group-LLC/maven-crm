import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";

interface ResetPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  userId: string;
}

const ResetPasswordModal = ({ open, onOpenChange, userName, userId }: ResetPasswordModalProps) => {
  const [step, setStep] = useState<"confirm" | "result">("confirm");
  const [tempPassword, setTempPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    setIsLoading(true);
    try {
      const data = await adminInvoke<{ temp_password: string }>("admin-user-actions", {
        action: "reset_password",
        user_id: userId,
      });
      setTempPassword(data.temp_password);
      setStep("result");
    } catch (e: any) {
      const title = e instanceof SessionExpiredError ? "Sesión expirada" : "Error";
      toast({ title, description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    toast({ title: "Copiado al portapapeles" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("confirm");
      setTempPassword("");
      setCopied(false);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <KeyRound className="h-5 w-5" />
            </div>
            <DialogTitle>Restablecer Contraseña</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Restablecer contraseña del usuario</DialogDescription>
        </DialogHeader>

        {step === "confirm" ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                ¿Estás seguro de restablecer la contraseña de <strong>{userName || "este usuario"}</strong>? Se generará una contraseña temporal.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button
                onClick={handleReset}
                disabled={isLoading}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isLoading ? "Restableciendo..." : "Restablecer Contraseña"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              La contraseña ha sido restablecida exitosamente.
            </p>

            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm text-green-800">
                La contraseña fue actualizada. Comparte la contraseña temporal con el usuario de forma segura.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contraseña temporal</label>
              <div className="flex gap-2">
                <Input value={tempPassword} readOnly className="font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                El usuario deberá cambiar esta contraseña al iniciar sesión.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Cerrar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ResetPasswordModal;
