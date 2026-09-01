import { toast } from "sonner";

// Descargar de verdad un archivo del chat.
//
// El intento anterior era `<a download href={url}>` con la URL del bucket. El
// atributo `download` SOLO funciona same-origin: sobre la URL de Supabase el
// navegador lo ignora y navega al archivo — de ahí el reporte de Maria:
// "probé con guardar como pero guarda es la página, el video no".
//
// La forma que sí funciona cross-origin: bajar el archivo con fetch, hacerlo
// blob local y descargar ESE objeto (ahí `download` sí aplica, es same-origin).
// Si el fetch falla (CORS de un host externo tipo Giphy, red), se abre en una
// pestaña como último recurso — peor que descargar, mejor que nada.
export async function descargarArchivo(url: string, fileName?: string | null): Promise<void> {
  const nombre = (fileName || "").trim() || url.split("/").pop()?.split("?")[0] || "archivo";
  const id = `descarga-${url}`;
  try {
    toast.loading(`Descargando ${nombre}…`, { id });
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revocar DESPUÉS de que el navegador tomó el blob: revocar en el acto
    // corta descargas grandes en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    toast.success(`Descargado: ${nombre}`, { id, duration: 2500 });
  } catch {
    toast.dismiss(id);
    window.open(url, "_blank", "noopener");
  }
}
