import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const ORIGEN_MAVEN = "https://app.maven-ai.me";

/** Solo las invitaciones de Cowork navegan dentro de la ventana actual.
 * El enlace conserva el destino, pero el servidor sigue decidiendo el acceso. */
export function rutaCoworkDelMensaje(href: string, origenActual?: string): string | null {
  try {
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (url.origin !== ORIGEN_MAVEN && url.origin !== origenActual) return null;
    if (url.pathname !== "/cowork" && url.pathname !== "/cowork/") return null;
    return `/cowork${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export default function EnlaceDeMensaje({ href, children }: { href: string; children: ReactNode }) {
  const ruta = rutaCoworkDelMensaje(href, typeof window !== "undefined" ? window.location.origin : undefined);
  const className = "underline hover:opacity-80 break-all";
  if (ruta) {
    return <Link to={ruta} className={className} onClick={e => e.stopPropagation()}>{children}</Link>;
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={e => e.stopPropagation()}>{children}</a>;
}
