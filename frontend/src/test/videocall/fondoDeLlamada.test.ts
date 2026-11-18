import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RADIO_DE_BLUR, esBlur, radioDeBlur, alternarBlur, isTemplateBackground, isCustomBackground,
  getCustomBackgroundUrl, leerFondoGuardado, guardarFondo, resolverImagenDeFondo,
  BACKGROUND_TEMPLATES,
} from "@/lib/fondoDeLlamada";

// El localStorage del setup es una instancia in-memory ÚNICA por archivo y
// nadie la limpia: sin esto un caso contamina al siguiente.
beforeEach(async () => {
  localStorage.clear();
  const { fijarDuenoDeFondos } = await import("@/lib/fondoDeLlamada");
  fijarDuenoDeFondos(null);
});

describe("niveles de difuminado", () => {
  it("los dos niveles son blur, y nada más lo es", () => {
    expect(esBlur("blur")).toBe(true);
    expect(esBlur("blur-strong")).toBe(true);
    expect(esBlur("none")).toBe(false);
    expect(esBlur("tpl-office")).toBe(false);
    expect(esBlur("custom:f1")).toBe(false);
  });

  // 17/11/2026: el número dejó de ser el «radio» del paquete de LiveKit (que se
  // dividía por 4 y se topaba en 64, por eso antes se fijaba 20 y 64) y pasó a
  // ser la SIGMA de un gaussiano en px a 720p de nuestro procesador
  // (lib/fondoFino). El 20 viejo equivalía a ~5 px de sigma: Alvaro dijo que
  // apenas difuminaba, así que «el nivel de siempre» ya no se conserva.
  it("«un poco» difumina de verdad y «fuerte» bastante más", () => {
    expect(radioDeBlur("blur")).toBeGreaterThanOrEqual(7);
    expect(radioDeBlur("blur-strong")).toBeGreaterThanOrEqual(2.5 * radioDeBlur("blur"));
  });

  it("el fuerte cabe en el bucle del shader (sin recorte silencioso) y con costo topado", async () => {
    const { muestrasPorLado, pasoDeMuestreo, sigmaEnTextura, MUESTRAS_MAX_POR_LADO } = await import("@/lib/fondoFino/parametros");
    // Hasta con una cámara de 1080p las muestras cubren 3 sigmas enteras…
    const sigma = sigmaEnTextura(RADIO_DE_BLUR["blur-strong"], 1080);
    expect(muestrasPorLado(sigma) * pasoDeMuestreo(sigma)).toBeGreaterThanOrEqual(3 * sigma);
    // …sin pasar el tope del bucle, y saltando como mucho de a 3 texeles.
    expect(muestrasPorLado(sigma)).toBeLessThanOrEqual(MUESTRAS_MAX_POR_LADO);
    expect(pasoDeMuestreo(sigma)).toBeLessThanOrEqual(3);
  });

  it("«un poco» ya esconde el detalle: más de 3 veces el viejo (~11 px)", () => {
    expect(radioDeBlur("blur")).toBeGreaterThanOrEqual(30);
  });

  it("un valor desconocido cae al blur normal, no a un radio raro", () => {
    expect(radioDeBlur("blur-loquesea")).toBe(RADIO_DE_BLUR.blur);
  });
});

describe("isTemplateBackground — la trampa del nivel nuevo", () => {
  it("NO clasifica 'blur-strong' como plantilla", () => {
    // Con el chequeo viejo (`!== \"blur\"`) esto daba true, se buscaba una
    // plantilla inexistente y el fondo no se aplicaba, en silencio.
    expect(isTemplateBackground("blur-strong")).toBe(false);
    expect(isTemplateBackground("blur")).toBe(false);
    expect(isTemplateBackground("none")).toBe(false);
    expect(isTemplateBackground("custom:f1")).toBe(false);
    expect(isTemplateBackground("tpl-office")).toBe(true);
  });

  it("los personalizados se reconocen y se les saca el prefijo", () => {
    expect(isCustomBackground("custom:f17")).toBe(true);
    expect(getCustomBackgroundUrl("custom:f17")).toBe("f17");
  });
});

describe("la elección guardada", () => {
  it("sin nada guardado arranca sin efecto", () => {
    expect(leerFondoGuardado()).toBe("none");
  });

  it("guarda y devuelve lo elegido", () => {
    guardarFondo("blur-strong");
    expect(leerFondoGuardado()).toBe("blur-strong");
    guardarFondo("tpl-beach");
    expect(leerFondoGuardado()).toBe("tpl-beach");
  });

  it("'sin efecto' borra la clave en vez de guardar la palabra", () => {
    guardarFondo("blur");
    guardarFondo("none");
    expect(localStorage.getItem("call-background-effect")).toBeNull();
    expect(leerFondoGuardado()).toBe("none");
  });

  it("descarta una referencia blob vieja: esa imagen ya no existe", () => {
    localStorage.setItem("call-background-effect", "custom:blob:http://localhost/abc");
    expect(leerFondoGuardado()).toBe("none");
  });

  it("con localStorage bloqueado no revienta, arranca sin efecto", () => {
    const espia = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(leerFondoGuardado()).toBe("none");
    espia.mockRestore();
    const espia2 = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => guardarFondo("blur")).not.toThrow();
    espia2.mockRestore();
  });
});

describe("resolverImagenDeFondo", () => {
  const url = (r: Awaited<ReturnType<typeof resolverImagenDeFondo>>) => ("url" in r ? r.url : null);

  it("sin efecto y blur no piden imagen", async () => {
    expect(url(await resolverImagenDeFondo("none", "http://x"))).toBeNull();
    expect(url(await resolverImagenDeFondo("blur", "http://x"))).toBeNull();
    expect(url(await resolverImagenDeFondo("blur-strong", "http://x"))).toBeNull();
  });

  it("una plantilla resuelve a su versión liviana bajo el origen dado", async () => {
    const tpl = BACKGROUND_TEMPLATES[0];
    expect(url(await resolverImagenDeFondo(tpl.id, "http://x"))).toBe(`http://x${tpl.lowSrc}`);
  });

  it("una plantilla que ya no existe se reporta como FALTANTE, no como fallo del almacén", async () => {
    const r = await resolverImagenDeFondo("tpl-que-no-existe", "http://x");
    expect(url(r)).toBeNull();
    expect("falta" in r && r.falta).toBe(true);
  });

  it("un personalizado viejo que traía la URL adentro se sigue respetando", async () => {
    expect(url(await resolverImagenDeFondo("custom:https://cdn/x.jpg", "http://x"))).toBe("https://cdn/x.jpg");
  });

  it("sin IndexedDB, un fondo propio NO se reporta como faltante: la preferencia no se toca", async () => {
    // Distinguir "no pude leer" de "no está" es lo que evita borrarle el fondo
    // a alguien por un hipo del navegador.
    const r = await resolverImagenDeFondo("custom:f1-1", "http://x");
    expect(url(r)).toBeNull();
    expect("falta" in r && r.falta).toBe(false);
  });
});

describe("subir una imagen propia", () => {
  // jsdom NO trae createImageBitmap ni canvas, así que sin este doble TODA
  // imagen daría "ilegible" y los tests pasarían aunque nadie pudiera subir un
  // fondo — que es el peor bug posible acá. El doble distingue: decodifica las
  // que declaran un tipo que el navegador entiende y rechaza el resto.
  const ponerDecodificador = () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
      async (b: Blob) => {
        if (b.type === "image/heic" || b.type === "image/tiff") throw new Error("no puedo decodificar esto");
        return { width: 100, height: 50, close: () => {} } as unknown as ImageBitmap;
      },
    );
  };

  beforeEach(ponerDecodificador);

  it("una imagen que el navegador NO puede decodificar se rechaza por ilegible", async () => {
    // Un .heic del iPhone en Chrome pasa el filtro de tipo pero no se puede
    // decodificar. Antes se guardaba igual: la miniatura salía rota y, ya en la
    // llamada, la imagen no cargaba, el procesador entraba en cooldown y la
    // cámara publicaba la habitación real.
    const { guardarFondoPropio } = await import("@/lib/fondoDeLlamada");
    const r = await guardarFondoPropio(new Blob(["no soy una imagen"], { type: "image/heic" }), 1_757_000_000_000);
    expect(r.fondo).toBeNull();
    expect(r.motivo).toBe("ilegible");
  });

  it("una imagen VÁLIDA no se rechaza por ilegible", async () => {
    // El espejo del caso anterior: sin esto, un cambio que rechazara TODO
    // seguiría en verde.
    const { guardarFondoPropio } = await import("@/lib/fondoDeLlamada");
    const r = await guardarFondoPropio(new Blob(["png"], { type: "image/png" }), 1_757_000_000_000);
    expect(r.motivo).not.toBe("ilegible");
    // Sin IndexedDB en jsdom no hay dónde guardarla, y eso se reporta como tal
    // en vez de culpar al límite de 5.
    expect(r.motivo).toBe("sin-almacen");
  });

  it("achicarImagen devuelve null solo con lo que no se puede pintar", async () => {
    const { achicarImagen } = await import("@/lib/fondoDeLlamada");
    expect(await achicarImagen(new Blob(["xx"], { type: "image/tiff" }))).toBeNull();
    expect(await achicarImagen(new Blob(["ok"], { type: "image/png" }))).not.toBeNull();
  });
});

describe("cada persona ve SOLO sus fondos", () => {
  it("la clave de la preferencia lleva la identidad adentro", async () => {
    // Una foto del cuarto de alguien no puede quedar a mano de quien entre
    // después en la misma máquina: A cerraba sesión, entraba B y B aparecía en
    // su reunión con la foto de A, que la sala entera veía.
    const { fijarDuenoDeFondos, guardarFondo, leerFondoGuardado } = await import("@/lib/fondoDeLlamada");

    fijarDuenoDeFondos("usuario-A");
    guardarFondo("custom:f1-1");
    expect(leerFondoGuardado()).toBe("custom:f1-1");

    fijarDuenoDeFondos("usuario-B");
    expect(leerFondoGuardado()).toBe("none");

    guardarFondo("blur-strong");
    fijarDuenoDeFondos("usuario-A");
    expect(leerFondoGuardado()).toBe("custom:f1-1");

    fijarDuenoDeFondos(null);
    expect(leerFondoGuardado()).toBe("none");
  });

  it("cerrar sesión no le deja la elección al siguiente", async () => {
    const { fijarDuenoDeFondos, guardarFondo, leerFondoGuardado } = await import("@/lib/fondoDeLlamada");
    fijarDuenoDeFondos("usuario-A");
    guardarFondo("tpl-beach");
    fijarDuenoDeFondos(undefined);   // signOut
    expect(leerFondoGuardado()).toBe("none");
  });
});

describe("alternarBlur — el botón rápido no degrada el nivel", () => {
  it("apaga desde cualquiera de los dos niveles", () => {
    expect(alternarBlur("blur", "blur")).toBe("none");
    expect(alternarBlur("blur-strong", "blur-strong")).toBe("none");
  });

  it("al volver a encender devuelve el nivel que la persona tenía", () => {
    // Antes esto devolvía siempre "blur": quien usaba el fuerte lo apagaba un
    // momento y se le degradaba sin aviso, también para la próxima llamada.
    expect(alternarBlur("none", "blur-strong")).toBe("blur-strong");
    expect(alternarBlur("none", "blur")).toBe("blur");
  });

  it("desde una plantilla enciende el nivel recordado", () => {
    expect(alternarBlur("tpl-office", "blur-strong")).toBe("blur-strong");
  });

  it("si lo recordado no es un blur, cae al normal", () => {
    expect(alternarBlur("none", "tpl-office")).toBe("blur");
    expect(alternarBlur("none", "none")).toBe("blur");
  });
});
