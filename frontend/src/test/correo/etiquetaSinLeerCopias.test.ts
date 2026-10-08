// Keila (08/10): «Y no entiendo esto, los abro varias veces pero no se quita eso,
// y en la etiqueta Gastos igual». En su buzón había dos copias del MISMO correo
// en Archivo (la que envió y la que recibió, archivadas juntas, UIDs seguidos):
// abría una y la otra seguía sin leer, y esa contaba para siempre. Y abrir una
// conversación marcaba leído solo el último mensaje.
import { describe, it, expect } from "vitest";
import { contarNoLeidosPorEtiqueta } from "@/hooks/useEtiquetasCorreo";
import hook from "@/hooks/useMailbox.ts?raw";
import pagina from "@/pages/correo/CorreoPage.tsx?raw";

const rel = (label_id: string, message_id: string) => ({ label_id, message_id });

describe("el número de la etiqueta", () => {
  it("un correo con UNA copia leída está leído, aunque otra copia siga sin leer", () => {
    const cuenta = contarNoLeidosPorEtiqueta(
      [rel("cxc", "<a@x>"), rel("cxc", "<b@x>"), rel("gastos", "<c@x>")],
      [
        { message_id: "<a@x>", unread: true }, { message_id: "<a@x>", unread: false }, // la del caso de Keila
        { message_id: "<b@x>", unread: true },
        { message_id: "<c@x>", unread: false },
      ],
    );
    expect(cuenta.get("cxc")).toBe(1);
    expect(cuenta.get("gastos")).toBeUndefined();
  });

  it("dos copias sin leer del mismo correo cuentan UNA vez", () => {
    const cuenta = contarNoLeidosPorEtiqueta([rel("cxc", "<a@x>"), rel("cxc", "<a@x>")], [
      { message_id: "<a@x>", unread: true }, { message_id: "<a@x>", unread: true },
    ]);
    expect(cuenta.get("cxc")).toBe(1);
  });

  it("un correo en dos etiquetas cuenta en las dos", () => {
    const cuenta = contarNoLeidosPorEtiqueta([rel("cxc", "<a@x>"), rel("gastos", "<a@x>")], [{ message_id: "<a@x>", unread: true }]);
    expect([cuenta.get("cxc"), cuenta.get("gastos")]).toEqual([1, 1]);
  });
});

describe("leer marca todas las copias y vuelve a contar al instante", () => {
  const marcar = hook.slice(hook.indexOf("export function useMarkSeen"), hook.indexOf("export type OperacionMasiva"));
  it("busca las otras copias por Message-ID y las marca, acá y en el proveedor", () => {
    expect(marcar).toMatch(/\.eq\("message_id", m\.messageId\)/);
    expect(marcar).toMatch(/\.update\(\{ unread: false \}\)\.in\("id", filas\.map/);
    expect(marcar).toMatch(/for \(const o of filas\)[\s\S]{0,120}action: "mark_seen", folder: o\.folder/);
  });
  it("invalida el número de las etiquetas al terminar", () => {
    expect(marcar).toMatch(/onSettled:[\s\S]{0,120}queryKey: \["mail-labels-unread"\]/);
  });
});

describe("abrir una conversación la deja leída entera, como Gmail", () => {
  it("la fila de la conversación abre con abrirHilo, que marca todos sus sin leer", () => {
    expect(pagina).toMatch(/onClick=\{\(\) => abrirHilo\(h\)\}/);
    const fn = pagina.slice(pagina.indexOf("const abrirHilo"), pagina.indexOf("const abrirHilo") + 500);
    expect(fn).toMatch(/for \(const m of h\.mensajes\)/);
    expect(fn).toMatch(/m\.unread && claveDe\(m\) !== claveDe\(h\.ultimo\)/);
  });
});
