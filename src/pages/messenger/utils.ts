export function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(d: string) {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}
