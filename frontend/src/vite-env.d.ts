/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Un paquete de traducciones por idioma (scripts/i18n/vitePluginIdiomas.ts).
declare module "virtual:maven-i18n/*" {
  const catalogo: Record<string, string>;
  export default catalogo;
}
