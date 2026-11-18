// La pestaña (o ventana) de una llamada le avisa a Maven que sigue viva, y
// obedece a la barra de Maven: «mostrar» la trae al frente y «colgar» la corta.
// Ver lib/llamadaEnCurso.ts.
import { useEffect, useRef } from "react";
import { escritorio } from "@/lib/escritorio";
import { LATIDO_LLAMADA_MS, abrirCanalDeLlamada, esMensajeDeLlamada, type MensajeLlamada } from "@/lib/llamadaEnCurso";

export function useAnunciarLlamada({ sala, nombre, activa, alColgar }: {
  sala: string | undefined;
  nombre: string;
  activa: boolean;
  alColgar: () => void;
}) {
  const alColgarRef = useRef(alColgar);
  alColgarRef.current = alColgar;
  const nombreRef = useRef(nombre);
  nombreRef.current = nombre;

  useEffect(() => {
    if (!activa || !sala) return;
    const canal = abrirCanalDeLlamada();
    if (!canal) return;
    const desde = Date.now();
    const avisar = (m: MensajeLlamada) => { try { canal.postMessage(m); } catch { /* canal cerrado */ } };
    const latir = () => avisar({ tipo: "en-llamada", sala, nombre: nombreRef.current, desde });
    latir();
    const id = window.setInterval(latir, LATIDO_LLAMADA_MS);
    canal.onmessage = (e) => {
      const m: unknown = e.data;
      if (!esMensajeDeLlamada(m) || m.sala !== sala) return;
      if (m.tipo === "colgar") alColgarRef.current();
      if (m.tipo === "mostrar") {
        // En la app de computador la trae al frente la app; en el navegador,
        // lo que el navegador deje.
        const app = escritorio() as { mostrarEstaVentana?: () => void } | null;
        try { app?.mostrarEstaVentana?.(); } catch { /* app vieja */ }
        try { window.focus(); } catch { /* el navegador no deja */ }
      }
    };
    const despedirse = () => avisar({ tipo: "colgo", sala });
    window.addEventListener("pagehide", despedirse);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", despedirse);
      despedirse();
      canal.close();
    };
  }, [activa, sala]);
}
