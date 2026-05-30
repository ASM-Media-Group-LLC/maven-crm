import type { ReactNode, MouseEvent, CSSProperties } from "react";
import { Phone } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { maskPhone } from "@/lib/country-utils";

/**
 * Muestra un teléfono de creadora respetando la visibilidad por rol:
 * completo para admin, enmascarado (últimos 4) para el resto.
 * Centraliza el gate para no repetir useUserRole en cada pantalla.
 */
export function MaskedPhone({
  phone,
  className,
  fallback = "—",
}: {
  phone: string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  const { isAdmin } = useUserRole();
  if (!phone) return <span className={className}>{fallback}</span>;
  return <span className={className}>{isAdmin ? phone : maskPhone(phone)}</span>;
}

/**
 * Teléfono con link a WhatsApp SOLO para admin (el número va en el href, así que
 * para no-admin se muestra enmascarado y sin link). `waNumber` es el número en
 * formato internacional si difiere del display.
 */
export function WhatsAppPhone({
  phone,
  waNumber,
  className,
}: {
  phone: string | null | undefined;
  waNumber?: string | null;
  className?: string;
}) {
  const { isAdmin } = useUserRole();
  if (!phone) return <span className="text-muted-foreground">—</span>;
  const shown = isAdmin ? phone : maskPhone(phone);
  const digits = (waNumber ?? phone)?.replace(/[^0-9]/g, "") ?? "";
  if (!isAdmin || !digits) return <span className={className ?? "text-sm text-muted-foreground"}>{shown}</span>;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-primary hover:underline"
    >
      <Phone className="h-3 w-3" />
      <span className="truncate max-w-[100px]">{shown}</span>
    </a>
  );
}

/**
 * Envuelve contenido en un link a WhatsApp SOLO para admin. Para no-admin
 * renderiza el contenido sin <a> → el número (que va en el href) no llega al DOM.
 * Úsalo cuando el texto visible ya está enmascarado y solo hay que tapar el href.
 */
export function WhatsAppLink({
  phone,
  className,
  children,
  hideForNonAdmin,
  onClick,
  style,
  title,
}: {
  phone: string | null | undefined;
  className?: string;
  children: ReactNode;
  hideForNonAdmin?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  style?: CSSProperties;
  title?: string;
}) {
  const { isAdmin } = useUserRole();
  const digits = phone?.replace(/[^0-9]/g, "") ?? "";
  if (!isAdmin || !digits) return hideForNonAdmin ? null : <>{children}</>;
  return (
    <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick} style={style} title={title}>
      {children}
    </a>
  );
}
