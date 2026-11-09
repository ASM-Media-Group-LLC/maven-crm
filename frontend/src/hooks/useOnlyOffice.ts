import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ConfigDeApertura {
  servidor: string;
  config: Record<string, unknown>;
}

/** Pide a Maven la configuración para abrir un documento en ONLYOFFICE.
 *
 *  No se arma en el navegador a propósito: lleva la URL firmada del archivo, el
 *  permiso de guardado y la firma que ONLYOFFICE exige. Si cualquiera de esas
 *  tres cosas se pudiera armar desde acá, cualquiera podría abrir —o pisar— el
 *  documento de otro. */
export function useAbrirEnOnlyOffice() {
  return useMutation({
    mutationFn: async (
      { id, tema }: { id: string; tema?: "dark" | "light" },
    ): Promise<ConfigDeApertura> => {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      // El tema viaja desde acá porque el editor tiene que abrirse del color de
      // Maven, y Maven tiene su propio claro/oscuro: leerlo del sistema
      // operativo en la edge daría el color equivocado a quien los tenga
      // distintos.
      const { data, error } = await supabase.functions.invoke("oficina-doc", {
        body: { action: "abrir", id, tema },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        const payload = (data ?? {}) as { error?: string };
        throw new Error(payload.error || error.message);
      }
      const payload = data as ConfigDeApertura & { error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.servidor) throw new Error("El servidor de Oficina no está configurado");
      return payload;
    },
  });
}

/** Los tres formatos de la Oficina. La extensión ES el tipo: la edge la usa
 *  para elegir el archivo en blanco y ONLYOFFICE para elegir el editor. */
export type FormatoDeOficina = "docx" | "xlsx" | "pptx";

export function useCrearDocumentoOffice() {
  return useMutation({
    mutationFn: async (
      args: { titulo?: string; extension?: FormatoDeOficina } = {},
    ): Promise<{ id: string }> => {
      const { titulo, extension = "docx" } = args;
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      const { data, error } = await supabase.functions.invoke("oficina-doc", {
        body: { action: "crear", titulo, extension },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        const payload = (data ?? {}) as { error?: string };
        throw new Error(payload.error || error.message);
      }
      const payload = data as { id?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.id) throw new Error("No se pudo crear el documento");
      return { id: payload.id };
    },
  });
}

// Exportar las horas del equipo (un rango) a una HOJA de la Oficina (Alvaro,
// 08/11). El edge arma el .xlsx con reporte_horas_mes y crea el documento; acá
// solo se pide y se devuelve el id para abrir la hoja. Solo admin/dueño (lo
// exige la función de la base).
export function useExportarHorasAHoja() {
  return useMutation({
    mutationFn: async ({ desde, hasta }: { desde: string; hasta: string }): Promise<{ id: string }> => {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      const { data, error } = await supabase.functions.invoke("oficina-doc", {
        body: { action: "exportar-reporte", desde, hasta },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        const payload = (data ?? {}) as { error?: string };
        throw new Error(payload.error || error.message);
      }
      const payload = data as { id?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.id) throw new Error("No se pudo exportar");
      return { id: payload.id };
    },
  });
}

/** Lo que el panel de historial de ONLYOFFICE espera recibir. Los nombres son
 *  los de su API, no los nuestros: son un contrato con el editor. */
export interface ListaDeHistorial {
  currentVersion: number;
  /** El editor acepta esto EN LUGAR de la lista y muestra el mensaje adentro
   *  del panel. Sin esto, un fallo deja el panel girando para siempre. */
  error?: string;
  history: {
    version: number;
    key: string;
    /** Ya formateada para mostrar: el editor la escribe tal cual. */
    created: string;
    user?: { id: string; name: string };
  }[];
}

export interface DatosDeVersion {
  fileType?: string;
  key?: string;
  url?: string;
  version?: number;
  token?: string;
  error?: string;
}

interface EditorDeOffice {
  destroyEditor: () => void;
  refreshHistory: (datos: ListaDeHistorial) => void;
  setHistoryData: (datos: DatosDeVersion) => void;
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (contenedorId: string, config: Record<string, unknown>) => EditorDeOffice;
    };
  }
}

/** Trae el `api.js` de ONLYOFFICE UNA vez por sesión del navegador.
 *
 *  El script no se puede empaquetar con Maven: tiene que venir del MISMO
 *  servidor que después atiende al editor, porque lleva adentro su versión y sus
 *  rutas. Pedirlo desde otro lado da un editor que carga y se queda en blanco. */
let cargando: Promise<void> | null = null;
function cargarApiDeOnlyOffice(servidor: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise<void>((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = `${servidor.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;
    s.async = true;
    s.onload = () => resolver();
    s.onerror = () => {
      cargando = null;
      rechazar(new Error("No se pudo contactar al servidor de Oficina"));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

type Estado = "cargando" | "listo" | "error";

/** Lo que la página tiene que saber contestar para que el panel de historial
 *  funcione. El protocolo con ONLYOFFICE lo maneja el hook; de dónde salen los
 *  datos es problema de la página. */
export interface Historial {
  pedirLista: () => Promise<ListaDeHistorial>;
  pedirVersion: (version: number) => Promise<DatosDeVersion>;
  restaurar: (version: number) => Promise<void>;
  /** Al salir del historial hay que volver a montar el editor en modo edición.
   *  La página lo hace pidiendo la configuración de nuevo. */
  alCerrar: () => void;
}

/** Monta el editor dentro del div con el id dado. */
export function useEditorDeOffice(
  contenedorId: string,
  apertura: ConfigDeApertura | undefined,
  historial?: Historial,
) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<EditorDeOffice | null>(null);

  // Los manejadores se arman una sola vez con el editor que todavía no existe,
  // así que leen el `historial` de una ref. Si se leyera de la clausura, un
  // cambio en la página dejaría al editor llamando a la versión vieja —y el
  // editor no se puede volver a montar solo para eso sin perder lo escrito.
  const historialRef = useRef(historial);
  historialRef.current = historial;

  useEffect(() => {
    if (!apertura) return;
    let vivo = true;
    setEstado("cargando");
    setError(null);

    cargarApiDeOnlyOffice(apertura.servidor)
      .then(() => {
        if (!vivo) return;
        if (!window.DocsAPI) throw new Error("El servidor de Oficina respondió algo inesperado");
        // Si quedaba un editor de un documento anterior hay que bajarlo: dos
        // editores sobre el mismo contenedor dejan la pantalla en blanco.
        editorRef.current?.destroyEditor();

        // ⚠️ Los eventos se enchufan ACÁ y no en la edge: son funciones, y por
        // el canal viaja JSON. El `config` llega firmado desde la edge y no se
        // toca —se copia— porque `events` es cosa del navegador y ONLYOFFICE
        // nunca se lo manda al servidor.
        const config = { ...apertura.config } as Record<string, unknown>;
        if (historialRef.current) {
          config.events = {
            // Abrir el panel: el botón del reloj aparece solo si esto existe.
            onRequestHistory: async () => {
              const h = historialRef.current;
              if (!h) return;
              try {
                editorRef.current?.refreshHistory(await h.pedirLista());
              } catch (e) {
                editorRef.current?.refreshHistory({
                  currentVersion: 0, history: [], error: (e as Error).message,
                });
              }
            },
            // Elegir una versión de la lista. `event.data` ES el número.
            onRequestHistoryData: async (ev: { data: number }) => {
              const h = historialRef.current;
              if (!h) return;
              try {
                editorRef.current?.setHistoryData(await h.pedirVersion(ev.data));
              } catch (e) {
                editorRef.current?.setHistoryData({ error: (e as Error).message });
              }
            },
            // Restaurar. Acá `event.data` SÍ es un objeto con `version`.
            onRequestRestore: async (ev: { data: { version: number } }) => {
              const h = historialRef.current;
              if (!h) return;
              try {
                await h.restaurar(ev.data.version);
                editorRef.current?.refreshHistory(await h.pedirLista());
              } catch (e) {
                // El botón de restaurar lo dibuja ONLYOFFICE mire quien mire;
                // quien solo tiene permiso de ver se come un 403 de la edge.
                // Sin este catch la promesa se rompe en silencio y el panel se
                // queda como si no hubiera pasado nada.
                editorRef.current?.refreshHistory({
                  currentVersion: 0, history: [], error: (e as Error).message,
                });
              }
            },
            onRequestHistoryClose: () => historialRef.current?.alCerrar(),
          };
        }

        editorRef.current = new window.DocsAPI.DocEditor(contenedorId, config);
        setEstado("listo");
      })
      .catch((e: Error) => {
        if (!vivo) return;
        setError(e.message);
        setEstado("error");
      });

    return () => {
      vivo = false;
      try {
        editorRef.current?.destroyEditor();
      } catch {
        /* ya estaba desmontado */
      }
      editorRef.current = null;
    };
  }, [contenedorId, apertura]);

  return { estado, error };
}
