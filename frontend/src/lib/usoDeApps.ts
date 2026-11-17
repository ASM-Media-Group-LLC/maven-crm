// Resumen del día de argos_uso_apps (lo que manda la app de computador):
// cuánto tiempo en cada app, cuánto de eso sin tocar nada, y las páginas o
// ventanas donde más estuvo dentro de cada app.

export type FilaUso = { app: string; titulo: string; url: string | null; segundos: number; segundos_inactivo: number };

export type AppDelDia = {
  app: string;
  segundos: number;
  inactivos: number;
  paginas: { titulo: string; url: string | null; segundos: number }[];
};

export type ResumenUso = { total: number; inactivos: number; apps: AppDelDia[] };

export function resumirUso(filas: FilaUso[], paginasPorApp = 5): ResumenUso {
  const porApp = new Map<string, { segundos: number; inactivos: number; paginas: Map<string, { titulo: string; url: string | null; segundos: number }> }>();
  let total = 0, inactivos = 0;
  for (const f of filas) {
    const s = Math.max(0, f.segundos || 0);
    const i = Math.min(s, Math.max(0, f.segundos_inactivo || 0));
    total += s;
    inactivos += i;
    let a = porApp.get(f.app);
    if (!a) porApp.set(f.app, (a = { segundos: 0, inactivos: 0, paginas: new Map() }));
    a.segundos += s;
    a.inactivos += i;
    const titulo = (f.titulo || "").trim();
    if (titulo) {
      const p = a.paginas.get(titulo) ?? { titulo, url: f.url, segundos: 0 };
      p.segundos += s;
      if (!p.url && f.url) p.url = f.url;
      a.paginas.set(titulo, p);
    }
  }
  const apps = [...porApp.entries()]
    .map(([app, a]) => ({
      app,
      segundos: a.segundos,
      inactivos: a.inactivos,
      paginas: [...a.paginas.values()].sort((x, y) => y.segundos - x.segundos).slice(0, paginasPorApp),
    }))
    .sort((x, y) => y.segundos - x.segundos);
  return { total, inactivos, apps };
}

/** «2 h 05 min», «12 min», «40 s». */
export function duracion(segundos: number): string {
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
