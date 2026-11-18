// El dibujo del fondo fino, todo en la GPU (WebGL2). Una cámara entra, sale el
// mismo cuadro con el fondo borroso o cambiado. Pasadas por cuadro:
//
//   1. (solo cuando hay máscara nueva) SUAVIZADO EN EL TIEMPO: la confianza de
//      «es persona» que da MediaPipe se mezcla con la de antes, a 1/2 de
//      resolución, con el factor adaptativo de parametros.ts. Mata el parpadeo
//      sin que la silueta se arrastre cuando te mueves.
//   2. BORDE GUIADO POR LA IMAGEN: un filtro bilateral conjunto (7×7) sobre esa
//      máscara, con el color de la cámara como guía. La máscara del detector es
//      de 256×256 y estirada se ve «en bloques»; el filtro la hace seguir los
//      bordes de color reales (el pelo, el hombro contra la pared) y no un
//      contorno redondeado con halo.
//   3. (solo blur) FONDO SIN LA PERSONA: se reduce la cámara a 1/4 y cada píxel
//      se pesa por «cuánto es fondo». La persona pesa cero, así que al
//      desenfocar no «chorrea» su color sobre la pared (el halo claro alrededor
//      de la cabeza que tenía el procesador viejo).
//   4. (solo blur) GAUSSIANO SEPARABLE: horizontal y vertical, con la sigma del
//      nivel. Al final se divide por el peso: queda solo el fondo, desenfocado.
//   4b. (borde por color, «mate») PROMEDIOS LOCALES: el mismo fondo-sin-persona
//      y un persona-sin-fondo, a 1/4 con un gaussiano chico. Dicen, cerca de
//      cada píxel del borde, de qué color es la pared vieja y de qué color la
//      persona (ver «El borde por color» en parametros.ts).
//   5. COMPOSICIÓN: persona nítida encima, fondo (borroso o imagen) debajo, con
//      la curva del borde de parametros.ts. Con el mate, en la franja del borde
//      la «a» se corrige por color (los huecos del pelo pasan a fondo) y el
//      color de la persona se despeja de la pared vieja.
//   (Opcional, apagado) FUSIÓN con el multiclase en la pasada 1: solo suma
//      persona cerca del contorno del liviano.
//
// Convención de coordenadas: en todas las texturas t=0 es la fila de ARRIBA de
// la imagen (así sube un VideoFrame y así entrega MediaPipe la máscara). Solo la
// última pasada, que escribe en el canvas, da vuelta la Y.
//
// ⚠️ MediaPipe comparte este mismo contexto WebGL (le pasamos el canvas para que
// la máscara se quede en la GPU) y toca el estado a su gusto: programa, buffers,
// framebuffer, viewport, texturas. Por eso cada pasada vuelve a fijar TODO lo que
// usa y no confía en nada de la pasada anterior.

import {
  CURVA_BORDE_BLUR, CURVA_BORDE_IMAGEN, MUESTRAS_MAX_POR_LADO, REDUCCION_DE_LA_MASCARA,
  REDUCCION_DEL_DESENFOQUE, SUAVIZADO_MAX, SUAVIZADO_MIN, CAMBIO_CHICO, CAMBIO_GRANDE,
  CONFIANZA_COLOR, FRANJA, FUERZA_DEL_MATE, PISO_DEL_DESPEJE, SUBIDA_MAX_DEL_COLOR, RADIO_CERCA_TEXELES, SIGMA_DEL_MATE_720,
  muestrasPorLado, pasoDeMuestreo, sigmaEnTextura, uvParaCubrir,
} from "./parametros";

const VERTICES = `#version 300 es
layout(location = 0) in vec2 pos;
uniform bool voltear;
out vec2 uv;
void main() {
  uv = (pos + 1.0) * 0.5;
  if (voltear) uv.y = 1.0 - uv.y;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

// 1. Suavizado en el tiempo. `mascaraMP` es la textura de MediaPipe: puede ser
// de punto flotante NO filtrable, así que se lee con texelFetch (sin filtro) y
// se promedian 4 vecinos para bajarla a 1/2 sin escalones.
const SUAVIZADO = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D mascaraMP;
uniform sampler2D previa;
uniform bool invertir;
uniform bool primera;
uniform float suavMin;
// Fusión con el multiclase (ver personaFusionada en parametros.ts): su persona
// ya copiada a nuestra textura «fina»; solo SUMA, y solo cerca del contorno.
uniform sampler2D fina;
uniform bool usarFina;
out vec4 color;
float leer(ivec2 p, ivec2 tam) {
  float v = texelFetch(mascaraMP, clamp(p, ivec2(0), tam - 1), 0).r;
  return invertir ? 1.0 - v : v;
}
void main() {
  ivec2 tam = textureSize(mascaraMP, 0);
  vec2 f = uv * vec2(tam) - 0.5;
  ivec2 p = ivec2(floor(f));
  vec2 w = fract(f);
  float a = mix(leer(p, tam), leer(p + ivec2(1, 0), tam), w.x);
  float b = mix(leer(p + ivec2(0, 1), tam), leer(p + ivec2(1, 1), tam), w.x);
  float detectada = clamp(mix(a, b, w.y), 0.0, 1.0);
  if (usarFina) {
    float maximo = 0.0;
    for (int j = -${RADIO_CERCA_TEXELES}; j <= ${RADIO_CERCA_TEXELES}; j += 2) {
      for (int i = -${RADIO_CERCA_TEXELES}; i <= ${RADIO_CERCA_TEXELES}; i += 2) {
        maximo = max(maximo, leer(p + ivec2(i, j), tam));
      }
    }
    float cerca = smoothstep(0.25, 0.6, maximo);
    detectada = max(detectada, texture(fina, uv).r * cerca);
  }
  if (primera) { color = vec4(detectada); return; }
  float anterior = texture(previa, uv).r;
  float cambio = abs(detectada - anterior);
  float factor = mix(suavMin, ${SUAVIZADO_MAX.toFixed(3)}, smoothstep(${CAMBIO_CHICO.toFixed(3)}, ${CAMBIO_GRANDE.toFixed(3)}, cambio));
  color = vec4(mix(anterior, detectada, factor));
}`;

// 2. Filtro bilateral conjunto guiado por el color de la cámara.
const REFINAR = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D mascara;
uniform sampler2D cuadro;
uniform vec2 paso;
out vec4 color;
const float SIGMA_ESPACIO = 2.0;
const float SIGMA_COLOR = 0.11;
void main() {
  vec3 centro = texture(cuadro, uv).rgb;
  float suma = 0.0;
  float pesos = 0.0;
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec2 o = vec2(float(i), float(j)) * paso;
      vec3 c = texture(cuadro, uv + o).rgb;
      vec3 d = c - centro;
      float w = exp(-float(i * i + j * j) / (2.0 * SIGMA_ESPACIO * SIGMA_ESPACIO)
                    - dot(d, d) / (2.0 * SIGMA_COLOR * SIGMA_COLOR));
      suma += w * texture(mascara, uv + o).r;
      pesos += w;
    }
  }
  color = vec4(suma / max(pesos, 1e-5));
}`;

// 3. Reducción a 1/4 pesando por «cuánto es fondo» (color premultiplicado).
const REDUCIR = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D cuadro;
uniform sampler2D mascara;
uniform vec2 pasoFuente;
uniform bool pesarPersona;
out vec4 color;
void main() {
  // 4 lecturas bilineales = el promedio de un bloque de 4×4 píxeles.
  vec3 c = texture(cuadro, uv + pasoFuente * vec2(-1.0, -1.0)).rgb
         + texture(cuadro, uv + pasoFuente * vec2( 1.0, -1.0)).rgb
         + texture(cuadro, uv + pasoFuente * vec2(-1.0,  1.0)).rgb
         + texture(cuadro, uv + pasoFuente * vec2( 1.0,  1.0)).rgb;
  float persona = texture(mascara, uv).r;
  // Solo cuenta lo que es fondo con claridad: el borde de la persona tampoco
  // debe teñir el desenfoque.
  float fondo = 1.0 - smoothstep(0.15, 0.5, persona);
  // Para el borde por color: el promedio de lo que es persona SEGURA cerca.
  float peso = pesarPersona ? smoothstep(0.6, 0.9, persona) : fondo;
  color = vec4(c * 0.25 * peso, peso);
}`;

// 4. Gaussiano separable (una dirección por pasada).
const GAUSS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D fuente;
uniform vec2 direccion;
uniform float sigma;
uniform int muestras;
uniform float paso;
out vec4 color;
void main() {
  vec4 suma = texture(fuente, uv);
  float pesos = 1.0;
  float k = -1.0 / (2.0 * sigma * sigma);
  for (int i = 1; i <= ${MUESTRAS_MAX_POR_LADO}; i++) {
    if (i > muestras) break;
    float d = float(i) * paso;
    float w = exp(d * d * k);
    vec2 o = direccion * d;
    suma += w * (texture(fuente, uv + o) + texture(fuente, uv - o));
    pesos += 2.0 * w;
  }
  color = suma / pesos;
}`;

// 5. Composición final (al canvas, con la Y dada vuelta).
const COMPONER = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D cuadro;
uniform sampler2D mascara;
uniform sampler2D fondo;
uniform int modo; // 1 = borroso, 2 = imagen
uniform vec4 cubrir; // escala.xy, corrimiento.zw
uniform vec2 curva;
// Borde por color (ver alfaFinal y colorSinFondoViejo en parametros.ts):
// promedios locales ponderados de fondo viejo (locB) y de persona (locF).
uniform sampler2D locB;
uniform sampler2D locF;
uniform bool mate;
out vec4 color;
void main() {
  vec3 persona = texture(cuadro, uv).rgb;
  // Borde nítido pero sin escalones: la transición dura lo que diga la curva,
  // pero nunca más de ~3 píxeles de pantalla (fwidth = cuánto cambia la máscara
  // de un píxel al vecino). Sin este tope, donde el detector duda (camisa oscura
  // contra pared oscura) el borde quedaba como una niebla de 15-20 píxeles.
  float m = texture(mascara, uv).r;
  float centro = 0.5 * (curva.x + curva.y);
  float ancho = 1.5 * max(fwidth(m), 1e-4);
  float a = smoothstep(max(curva.x, centro - ancho), min(curva.y, centro + ancho), m);
  vec3 atras;
  if (modo == 1) {
    vec4 b = texture(fondo, uv);
    // b.a ≈ 0 solo muy adentro de la persona (ahí a = 1 y no se ve).
    atras = b.a > 1e-3 ? b.rgb / b.a : persona;
  } else {
    atras = texture(fondo, uv * cubrir.xy + cubrir.zw).rgb;
  }
  if (!mate) { color = vec4(mix(atras, persona, a), 1.0); return; }
  vec4 lb = texture(locB, uv);
  vec4 lf = texture(locF, uv);
  vec3 B = lb.rgb / max(lb.a, 1e-3);
  vec3 F = lf.rgb / max(lf.a, 1e-3);
  float franjaFondo = smoothstep(${FRANJA.desde.toFixed(3)}, ${FRANJA.hasta.toFixed(3)}, lb.a);
  float franja = franjaFondo * smoothstep(${FRANJA.desde.toFixed(3)}, ${FRANJA.hasta.toFixed(3)}, lf.a);
  vec3 d = F - B;
  float dd = dot(d, d);
  float confianza = smoothstep(${CONFIANZA_COLOR.desde.toFixed(4)}, ${CONFIANZA_COLOR.hasta.toFixed(4)}, dd);
  float ac = dd < 1e-4 ? 0.5 : clamp(dot(persona - B, d) / dd, 0.0, 1.0);
  // El color puede SACAR fondo sin límite (los huecos del pelo), pero solo
  // puede AGREGAR un poco, y solo donde la máscara ya ve algo de persona.
  ac = min(ac, a + ${SUBIDA_MAX_DEL_COLOR.toFixed(2)} * smoothstep(0.02, 0.2, m));
  a += franja * confianza * ${FUERZA_DEL_MATE.toFixed(3)} * (ac - a);
  // Color de la persona SIN el fondo viejo (ver colorDePersona en parametros.ts):
  // de I = a·F + (1 − a)·B se despeja F. Lejos del borde B → I y F = I.
  vec3 be = mix(persona, B, franja);
  vec3 despejada = clamp((persona - (1.0 - a) * be) / max(a, ${PISO_DEL_DESPEJE.toFixed(2)}), 0.0, 1.0);
  vec3 f = mix(mix(persona, F, franja), despejada, smoothstep(0.1, 0.4, a));
  color = vec4(mix(atras, f, a), 1.0);
}`;

type Programa = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export type ModoDeDibujo = "borroso" | "imagen";

export interface PipelineFondo {
  /** Prepara las texturas para una cámara de w×h (no hace nada si ya lo están). */
  ajustarTamano(w: number, h: number): void;
  /** Mete una máscara nueva de MediaPipe (textura del mismo contexto). */
  actualizarMascara(textura: WebGLTexture, invertir: boolean, cadaCuantos: number): void;
  /**
   * Guarda la persona del multiclase (máscara 0 = fondo, se invierte). Desde ahí
   * cada máscara del liviano se fusiona con ella (ver personaFusionada).
   */
  actualizarFina(textura: WebGLTexture): void;
  /** Deja de fusionar (el multiclase se apagó o falló). */
  olvidarFina(): void;
  /** Dibuja el cuadro en el canvas (`mate`: con el borde por color, por defecto sí). */
  dibujar(frame: VideoFrame, modo: ModoDeDibujo, sigma720: number, mate?: boolean): void;
  ponerImagen(imagen: ImageBitmap | null): void;
  /** Olvida la máscara (al cambiar de cámara): el próximo cuadro arranca de cero. */
  reiniciarMascara(): void;
  destruir(): void;
}

function compilar(gl: WebGL2RenderingContext, tipo: number, fuente: string): WebGLShader {
  const s = gl.createShader(tipo);
  if (!s) throw new Error("fondo-fino: sin shader");
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`fondo-fino: shader no compila: ${log}`);
  }
  return s;
}

function programa(gl: WebGL2RenderingContext, vs: WebGLShader, fuente: string, uniformes: string[]): Programa {
  const fs = compilar(gl, gl.FRAGMENT_SHADER, fuente);
  const p = gl.createProgram();
  if (!p) throw new Error("fondo-fino: sin programa");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`fondo-fino: programa no enlaza: ${gl.getProgramInfoLog(p)}`);
  }
  const u: Programa["u"] = {};
  for (const n of [...uniformes, "voltear"]) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

interface Destino { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }

export function crearPipelineFondo(canvas: OffscreenCanvas | HTMLCanvasElement): PipelineFondo {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error("fondo-fino: sin WebGL2");

  // Texturas de media precisión para el desenfoque: con 8 bits, dividir por un
  // peso chico (el fondo pegado a la persona) hace bandas. Si el equipo no deja
  // dibujar en ellas, 8 bits igual funciona.
  const conFlotante = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");

  const vs = compilar(gl, gl.VERTEX_SHADER, VERTICES);
  const pSuav = programa(gl, vs, SUAVIZADO, ["mascaraMP", "previa", "invertir", "primera", "suavMin", "fina", "usarFina"]);
  const pRefinar = programa(gl, vs, REFINAR, ["mascara", "cuadro", "paso"]);
  const pReducir = programa(gl, vs, REDUCIR, ["cuadro", "mascara", "pasoFuente", "pesarPersona"]);
  const pGauss = programa(gl, vs, GAUSS, ["fuente", "direccion", "sigma", "muestras", "paso"]);
  const pComponer = programa(gl, vs, COMPONER, ["cuadro", "mascara", "fondo", "modo", "cubrir", "curva", "locB", "locF", "mate"]);
  gl.deleteShader(vs);

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  function textura(): WebGLTexture {
    const t = gl!.createTexture();
    if (!t) throw new Error("fondo-fino: sin textura");
    gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    return t;
  }

  function destino(w: number, h: number, flotante: boolean): Destino {
    const tex = textura();
    if (flotante) gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, w, h, 0, gl!.RGBA, gl!.HALF_FLOAT, null);
    else gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    const fbo = gl!.createFramebuffer();
    if (!fbo) throw new Error("fondo-fino: sin framebuffer");
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    if (gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.deleteFramebuffer(fbo);
      gl!.deleteTexture(tex);
      if (flotante) return destino(w, h, false);
      throw new Error("fondo-fino: framebuffer incompleto");
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  function borrarDestino(d: Destino | null) {
    if (!d) return;
    gl!.deleteFramebuffer(d.fbo);
    gl!.deleteTexture(d.tex);
  }

  const texCuadro = textura();
  const texImagen = textura();
  let imagen: { w: number; h: number } | null = null;

  // Las de tamaño variable se crean al primer cuadro y cuando cambia la cámara.
  let ancho = 0;
  let alto = 0;
  let ema: [Destino, Destino] | null = null;
  let emaLeer = 0;
  let hayMascara = false;
  let alfa: Destino | null = null;
  let red1: Destino | null = null;
  let red2: Destino | null = null;
  // Promedios locales para el borde por color (1/4) y la persona del multiclase.
  let locB: Destino | null = null;
  let locF: Destino | null = null;
  let tmp: Destino | null = null;
  let fina: Destino | null = null;
  let hayFina = false;

  function ajustarTamano(w: number, h: number) {
    if (w === ancho && h === alto && ema) return;
    ancho = w;
    alto = h;
    if (ema) { borrarDestino(ema[0]); borrarDestino(ema[1]); }
    borrarDestino(alfa); borrarDestino(red1); borrarDestino(red2);
    borrarDestino(locB); borrarDestino(locF); borrarDestino(tmp); borrarDestino(fina);
    const mw = Math.max(1, Math.ceil(w / REDUCCION_DE_LA_MASCARA));
    const mh = Math.max(1, Math.ceil(h / REDUCCION_DE_LA_MASCARA));
    ema = [destino(mw, mh, false), destino(mw, mh, false)];
    alfa = destino(mw, mh, false);
    const bw = Math.max(1, Math.ceil(w / REDUCCION_DEL_DESENFOQUE));
    const bh = Math.max(1, Math.ceil(h / REDUCCION_DEL_DESENFOQUE));
    red1 = destino(bw, bh, conFlotante);
    red2 = destino(bw, bh, conFlotante);
    locB = destino(bw, bh, conFlotante);
    locF = destino(bw, bh, conFlotante);
    tmp = destino(bw, bh, conFlotante);
    fina = destino(mw, mh, false);
    hayMascara = false;
    hayFina = false;
  }

  function prepararPasada(d: Destino | null, prog: Programa, voltear: boolean) {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, d ? d.fbo : null);
    gl!.viewport(0, 0, d ? d.w : ancho, d ? d.h : alto);
    gl!.disable(gl!.BLEND);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.disable(gl!.SCISSOR_TEST);
    gl!.disable(gl!.CULL_FACE);
    gl!.disable(gl!.STENCIL_TEST);
    gl!.colorMask(true, true, true, true);
    gl!.useProgram(prog.p);
    gl!.uniform1i(prog.u.voltear, voltear ? 1 : 0);
    gl!.bindVertexArray(vao);
  }

  function unir(unidad: number, tex: WebGLTexture, uniforme: WebGLUniformLocation | null) {
    gl!.activeTexture(gl!.TEXTURE0 + unidad);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.uniform1i(uniforme, unidad);
  }

  function dibujarQuad() {
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
    gl!.bindVertexArray(null);
  }

  function actualizarMascara(texMP: WebGLTexture, invertir: boolean, cadaCuantos: number) {
    if (!ema) return;
    const escribir = 1 - emaLeer;
    prepararPasada(ema[escribir], pSuav, false);
    unir(0, texMP, pSuav.u.mascaraMP);
    unir(1, ema[emaLeer].tex, pSuav.u.previa);
    gl!.uniform1i(pSuav.u.invertir, invertir ? 1 : 0);
    gl!.uniform1i(pSuav.u.primera, hayMascara ? 0 : 1);
    gl!.uniform1f(pSuav.u.suavMin, 1 - Math.pow(1 - SUAVIZADO_MIN, Math.max(1, cadaCuantos)));
    unir(2, fina ? fina.tex : texCuadro, pSuav.u.fina);
    gl!.uniform1i(pSuav.u.usarFina, hayFina ? 1 : 0);
    dibujarQuad();
    emaLeer = escribir;
    hayMascara = true;
  }

  function actualizarFina(texMP: WebGLTexture) {
    if (!fina || !ema) return;
    // La misma pasada, en modo «primera» y sin fusión: solo copia e invierte.
    prepararPasada(fina, pSuav, false);
    unir(0, texMP, pSuav.u.mascaraMP);
    unir(1, ema[emaLeer].tex, pSuav.u.previa);
    unir(2, ema[emaLeer].tex, pSuav.u.fina);
    gl!.uniform1i(pSuav.u.invertir, 1);
    gl!.uniform1i(pSuav.u.primera, 1);
    gl!.uniform1i(pSuav.u.usarFina, 0);
    gl!.uniform1f(pSuav.u.suavMin, 1);
    dibujarQuad();
    hayFina = true;
  }

  function gauss(desde: Destino, medio: Destino, hasta: Destino, sigma: number) {
    const n = muestrasPorLado(sigma);
    const paso = pasoDeMuestreo(sigma);
    prepararPasada(medio, pGauss, false);
    unir(0, desde.tex, pGauss.u.fuente);
    gl!.uniform2f(pGauss.u.direccion, 1 / desde.w, 0);
    gl!.uniform1f(pGauss.u.sigma, sigma);
    gl!.uniform1i(pGauss.u.muestras, n);
    gl!.uniform1f(pGauss.u.paso, paso);
    dibujarQuad();
    prepararPasada(hasta, pGauss, false);
    unir(0, medio.tex, pGauss.u.fuente);
    gl!.uniform2f(pGauss.u.direccion, 0, 1 / medio.h);
    gl!.uniform1f(pGauss.u.sigma, sigma);
    gl!.uniform1i(pGauss.u.muestras, n);
    gl!.uniform1f(pGauss.u.paso, paso);
    dibujarQuad();
  }

  function reducir(d: Destino, w: number, h: number, persona: boolean) {
    if (!alfa) return;
    prepararPasada(d, pReducir, false);
    unir(0, texCuadro, pReducir.u.cuadro);
    unir(1, alfa.tex, pReducir.u.mascara);
    gl!.uniform2f(pReducir.u.pasoFuente, 1 / w, 1 / h);
    gl!.uniform1i(pReducir.u.pesarPersona, persona ? 1 : 0);
    dibujarQuad();
  }

  function subirCuadro(frame: VideoFrame) {
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texCuadro);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, frame);
  }

  function dibujar(frame: VideoFrame, modo: ModoDeDibujo, sigma720: number, mate = true) {
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ajustarTamano(w, h);
    if (!ema || !alfa || !red1 || !red2 || !locB || !locF || !tmp) return;
    subirCuadro(frame);

    // 2. Borde guiado (si todavía no hubo máscara, la de ceros = todo fondo).
    prepararPasada(alfa, pRefinar, false);
    unir(0, ema[emaLeer].tex, pRefinar.u.mascara);
    unir(1, texCuadro, pRefinar.u.cuadro);
    gl!.uniform2f(pRefinar.u.paso, 1 / alfa.w, 1 / alfa.h);
    dibujarQuad();

    // 3. Fondo sin la persona, a 1/4 (sirve al blur y al borde por color).
    if (modo === "borroso" || mate) reducir(locB, w, h, false);

    let texFondo: WebGLTexture = texImagen;
    if (modo === "borroso") {
      // 4. Gaussiano grande: horizontal a red2, vertical a red1.
      gauss(locB, red2, red1, sigmaEnTextura(sigma720, h));
      texFondo = red1.tex;
    }
    if (mate) {
      // Promedios LOCALES de fondo viejo y de persona, para el borde por color.
      const sigmaMate = sigmaEnTextura(SIGMA_DEL_MATE_720, h);
      gauss(locB, tmp, locB, sigmaMate);
      reducir(locF, w, h, true);
      gauss(locF, tmp, locF, sigmaMate);
    }

    // 5. Composición al canvas.
    prepararPasada(null, pComponer, true);
    unir(0, texCuadro, pComponer.u.cuadro);
    unir(1, alfa.tex, pComponer.u.mascara);
    unir(2, texFondo, pComponer.u.fondo);
    gl!.uniform1i(pComponer.u.modo, modo === "borroso" ? 1 : 2);
    const c = imagen ? uvParaCubrir(imagen.w, imagen.h, w, h) : { escalaX: 1, escalaY: 1, corrX: 0, corrY: 0 };
    gl!.uniform4f(pComponer.u.cubrir, c.escalaX, c.escalaY, c.corrX, c.corrY);
    const curva = modo === "borroso" ? CURVA_BORDE_BLUR : CURVA_BORDE_IMAGEN;
    gl!.uniform2f(pComponer.u.curva, curva.desde, curva.hasta);
    unir(3, locB.tex, pComponer.u.locB);
    unir(4, locF.tex, pComponer.u.locF);
    gl!.uniform1i(pComponer.u.mate, mate ? 1 : 0);
    dibujarQuad();
  }

  function ponerImagen(img: ImageBitmap | null) {
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texImagen);
    if (!img) {
      imagen = null;
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, 1, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      return;
    }
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, img);
    // Con mipmaps una foto grande achicada a la cámara no titila.
    gl!.generateMipmap(gl!.TEXTURE_2D);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
    imagen = { w: img.width, h: img.height };
  }
  ponerImagen(null);

  function destruir() {
    for (const p of [pSuav, pRefinar, pReducir, pGauss, pComponer]) gl!.deleteProgram(p.p);
    if (ema) { borrarDestino(ema[0]); borrarDestino(ema[1]); }
    borrarDestino(alfa); borrarDestino(red1); borrarDestino(red2);
    borrarDestino(locB); borrarDestino(locF); borrarDestino(tmp); borrarDestino(fina);
    ema = null; alfa = null; red1 = null; red2 = null; locB = null; locF = null; tmp = null; fina = null;
    gl!.deleteTexture(texCuadro);
    gl!.deleteTexture(texImagen);
    gl!.deleteBuffer(vbo);
    gl!.deleteVertexArray(vao);
  }

  return {
    ajustarTamano: (w, h) => {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ajustarTamano(w, h);
    },
    actualizarMascara,
    actualizarFina,
    olvidarFina: () => { hayFina = false; },
    dibujar,
    ponerImagen,
    reiniciarMascara: () => { hayMascara = false; },
    destruir,
  };
}
