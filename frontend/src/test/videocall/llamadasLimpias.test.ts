// LLAMADAS LIMPIAS (Alvaro, 26/11/2026). Tres rondas de preguntas con fotos:
// nada encima del video. Estas guardas leen el código para que no vuelva.
import { describe, it, expect } from "vitest";
import { estadoSoloApp } from "@/lib/coworkSoloApp";

const fuentes = import.meta.glob(
  [
    "../../pages/messenger/videocall/LiveKitCallView.tsx",
    "../../pages/messenger/videocall/ParticipantTile.tsx",
    "../../pages/messenger/videocall/RecordingControl.tsx",
    "../../pages/messenger/components/IncomingCallModal.tsx",
    "../../pages/meet/InvitarDeAfuera.tsx",
    "../../components/PersistentCallProvider.tsx",
    "../../components/AbrirEnApp.tsx",
    "../../components/CoworkSoloApp.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const leer = (fin: string) => {
  const k = Object.keys(fuentes).find((p) => p.endsWith(fin));
  if (!k) throw new Error(`no encuentro ${fin}`);
  return fuentes[k];
};

describe("Grabar va en la barra de abajo", () => {
  it("ya no flota sobre el video; en la barra es un botón redondo", () => {
    const v = leer("videocall/LiveKitCallView.tsx");
    expect(v).not.toContain('<div className="absolute left-5 top-5 z-20">');
    expect(v).toContain('variante="barra"');
    expect(v).toContain("<>{botonGrabar}{controlesExtra}</>");
    expect(leer("videocall/RecordingControl.tsx")).toContain('if (variante === "barra")');
  });
});

describe("ventanita: lo importante en grande y una tira debajo", () => {
  it("las caritas van en una tira debajo, con «y N más», no encima de la pantalla", () => {
    const v = leer("videocall/LiveKitCallView.tsx");
    expect(v).toContain("data-tira-caritas");
    expect(v).toContain('t("messenger.callView.yNMas"');
    expect(v).not.toContain("absolute bottom-2 right-2 flex flex-col-reverse");
    // Con 5 o más personas en la ventanita: quien habla en grande.
    expect(v).toContain("if (effectiveCompact && lk.participants.length >= 5) return \"sidebar\";");
  });
});

describe("nombres chicos que no tapan la cara", () => {
  it("rótulo con sombra suave, nombre chico y mic/señal al lado", () => {
    const s = leer("videocall/ParticipantTile.tsx");
    expect(s).toContain("data-rotulo");
    expect(s).toContain("bg-gradient-to-t from-black/60");
    expect(s).not.toContain("bg-[hsl(220_30%_10%/0.85)]");
  });
});

describe("llamada entrante: tarjeta arriba a la derecha", () => {
  it("sin velo sobre toda la pantalla", () => {
    const s = leer("components/IncomingCallModal.tsx");
    expect(s).toContain("data-llamada-entrante");
    expect(s).toContain("sm:right-4 sm:top-4");
    expect(s).not.toContain("fixed inset-0 z-50");
  });
});

describe("un solo «+persona» en la llamada del Messenger", () => {
  it("invitar de afuera usa el ícono de enlace", () => {
    const s = leer("meet/InvitarDeAfuera.tsx");
    expect(s).toContain("<Link2 ");
    expect(s).not.toContain("<UserPlus ");
  });
});

describe("la ventanita vive en la esquina", () => {
  it("sin mover, abajo a la derecha y se queda ahí; al arrastrarla, recuerda", () => {
    const s = leer("components/PersistentCallProvider.tsx");
    expect(s).toContain("function esquinaAbajoDerecha(");
    expect(s).toContain("if (anclada.current) {");
    expect(s).toContain("anclada.current = false;");
  });
});

describe("solo navegador por Posición", () => {
  it("a quien su posición le deja el navegador no se le bloquea ni se le ofrece la app", () => {
    const base = { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", tactil: false, enApp: false, desde: new Date("2026-01-01"), ahora: new Date("2026-11-27") };
    expect(estadoSoloApp(base)).toBe("bloqueo");
    expect(estadoSoloApp({ ...base, soloNavegador: true })).toBe("nada");
    expect(estadoSoloApp({ ...base, probador: true, soloNavegador: true })).toBe("nada");
    expect(leer("components/AbrirEnApp.tsx")).toContain("if (soloNavegador || tactil");
  });
});

describe("la app solo se exige a quien debe estar en Cowork (27/11/2026)", () => {
  it("quien no tiene Cowork obligatorio queda libre, y el aviso de la app es un botoncito", () => {
    const c = leer("components/CoworkSoloApp.tsx");
    expect(c).toContain("const libre = soloNavegador || debeCowork === false;");
    const a = leer("components/AbrirEnApp.tsx");
    expect(a).toContain("data-abrir-en-app");
    expect(a).not.toContain('t("pwa.app.siempre")');
  });
});
