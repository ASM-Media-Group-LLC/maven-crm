// Dominio con el que se arman los links que SALEN de Maven: los correos al
// candidato del evaluador, los reportes de QA, el enlace de invitado a una
// reunión.
//
// Tiene que ser el CANÓNICO y no `window.location.origin`, porque Maven se
// sirve desde varios dominios: si alguien genera un link mientras trabaja en el
// dominio histórico, el que lo recibe se queda con esa dirección para siempre
// (en su bandeja, en su marcador). `VITE_PUBLIC_URL` se inyecta en runtime
// (Dockerfile + docker-entrypoint.sh) y en Dokploy vale https://app.maven-ai.me.
//
// El fallback al origin cubre desarrollo local y el caso de que la variable no
// esté seteada: es mejor un link al dominio actual que un link vacío.
export const getPublicBaseUrl = (): string =>
  import.meta.env.VITE_PUBLIC_URL || (typeof window !== "undefined" ? window.location.origin : "");
