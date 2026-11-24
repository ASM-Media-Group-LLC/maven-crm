// El banco congela el reloj en la noche del 11/11/2026 (hora en que se copiaron
// los datos), para que «hoy», «hace X min» y el turno cuadren con los datos reales.
const FIJO = Date.parse("2026-11-12T03:00:00Z");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Real: any = Date;
const inicio = Real.now();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Fijo(this: any, ...a: any[]) {
  if (!(this instanceof Fijo)) return new Real(FIJO + (Real.now() - inicio)).toString();
  return a.length === 0 ? new Real(FIJO + (Real.now() - inicio)) : new Real(...a);
}
Fijo.now = () => FIJO + (Real.now() - inicio);
Fijo.parse = Real.parse;
Fijo.UTC = Real.UTC;
Fijo.prototype = Real.prototype;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Date = Fijo;
export const RELOJ_FIJO = FIJO;
