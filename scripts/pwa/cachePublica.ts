/** Workbox serializa esta función dentro del SW: debe ser autocontenida.
 *  Solo los chunks propios con hash son inmutables. Nunca URLs de APIs,
 *  scripts de otro origen ni archivos públicos sin versión. */
export function esChunkPublico({ url, sameOrigin }: { url: URL; sameOrigin: boolean }): boolean {
  return sameOrigin && /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.js$/.test(url.pathname);
}
