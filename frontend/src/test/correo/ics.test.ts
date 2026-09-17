import { describe, it, expect } from "vitest";
import { leerInvitacion } from "@/lib/ics";

/** Una invitación como las que manda Google Calendar, que es de donde vienen
 *  todas las del correo del equipo. */
const INVITACION = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  "CALSCALE:GREGORIAN",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Bogota:20260909T120000",
  "DTEND;TZID=America/Bogota:20260909T130000",
  "SUMMARY:Induccion MiiS",
  "LOCATION:Oficina principal\\, piso 3",
  "DESCRIPTION:Bienvenida al equipo.\\nLink: https://meet.google.com/abc-defg-hij",
  "ORGANIZER;CN=Andrea Palacio:mailto:andrea.palacio@unlok.me",
  "ATTENDEE;CN=Jonathan Hurtado;PARTSTAT=NEEDS-ACTION:mailto:jonathan.hurtado@maven-ai.me",
  "ATTENDEE;CN=Andrea Palacio;PARTSTAT=ACCEPTED:mailto:andrea.palacio@unlok.me",
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("leerInvitacion", () => {
  it("lee los datos que la tarjeta muestra", () => {
    const ev = leerInvitacion(INVITACION)!;
    expect(ev.titulo).toBe("Induccion MiiS");
    expect(ev.metodo).toBe("REQUEST");
    expect(ev.cancelado).toBe(false);
    expect(ev.todoElDia).toBe(false);
  });

  it("⚠️ convierte la hora de la zona a un instante REAL", () => {
    // Bogotá es UTC-5 todo el año: las 12:00 de allá son las 17:00 UTC.
    // Mostrar la hora equivocada en una invitación hace que alguien llegue
    // tarde a la reunión, así que esto se calcula, no se asume.
    const ev = leerInvitacion(INVITACION)!;
    expect(ev.inicio!.toISOString()).toBe("2026-09-09T17:00:00.000Z");
    expect(ev.fin!.toISOString()).toBe("2026-09-09T18:00:00.000Z");
  });

  it("desescapa comas y saltos de línea", () => {
    const ev = leerInvitacion(INVITACION)!;
    expect(ev.lugar).toBe("Oficina principal, piso 3");
    expect(ev.descripcion).toContain("\n");
  });

  it("saca el link de la videollamada de la descripción", () => {
    const ev = leerInvitacion(INVITACION)!;
    expect(ev.enlace).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("lee quién organiza y quiénes están invitados, con su respuesta", () => {
    const ev = leerInvitacion(INVITACION)!;
    expect(ev.organiza).toEqual({
      nombre: "Andrea Palacio",
      email: "andrea.palacio@unlok.me",
      respuesta: null,
    });
    expect(ev.invitados).toHaveLength(2);
    expect(ev.invitados[0].respuesta).toBe("NEEDS-ACTION");
    expect(ev.invitados[1].respuesta).toBe("ACCEPTED");
  });

  it("⚠️ des-pliega las líneas partidas a los 75 caracteres", () => {
    // iCalendar corta las líneas largas y continúa con un espacio. Sin
    // des-plegar, un link de Meet llega cortado por la mitad y no sirve.
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART:20260909T170000Z",
      "SUMMARY:Reunion con un titulo bastante largo que el cliente decidio",
      "  partir en dos lineas",
      "DESCRIPTION:https://meet.google.com/abc-defg",
      " -hij",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const ev = leerInvitacion(ics)!;
    expect(ev.titulo).toBe(
      "Reunion con un titulo bastante largo que el cliente decidio partir en dos lineas",
    );
    expect(ev.enlace).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("entiende una hora en UTC", () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT",
      "DTSTART:20260909T170000Z", "SUMMARY:x",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    expect(leerInvitacion(ics)!.inicio!.toISOString()).toBe("2026-09-09T17:00:00.000Z");
  });

  it("marca los eventos de día completo, que no tienen hora", () => {
    const ics = [
      "BEGIN:VCALENDAR", "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260909", "SUMMARY:Feriado",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const ev = leerInvitacion(ics)!;
    expect(ev.todoElDia).toBe(true);
    expect(ev.inicio).not.toBeNull();
  });

  it("reconoce una cancelación", () => {
    const ics = INVITACION.replace("METHOD:REQUEST", "METHOD:CANCEL");
    expect(leerInvitacion(ics)!.cancelado).toBe(true);

    const porEstado = INVITACION.replace("STATUS:CONFIRMED", "STATUS:CANCELLED");
    expect(leerInvitacion(porEstado)!.cancelado).toBe(true);
  });

  it("avisa cuando el evento se repite", () => {
    const ics = INVITACION.replace(
      "STATUS:CONFIRMED",
      "RRULE:FREQ=WEEKLY;BYDAY=MO\r\nSTATUS:CONFIRMED",
    );
    expect(leerInvitacion(ics)!.repeticion).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("⚠️ con una zona que el navegador no conoce NO inventa la hora", () => {
    // Antes que mostrar una hora inventada, se cae a la hora local: el que
    // mira ve algo coherente y el dato no se falsea con un desfase a mano.
    const ics = INVITACION.replace(/America\/Bogota/g, "Zona/Inventada");
    const ev = leerInvitacion(ics)!;
    expect(ev.inicio).not.toBeNull();
    expect(ev.titulo).toBe("Induccion MiiS");
  });

  it("devuelve null con cualquier cosa que no sea una invitación", () => {
    expect(leerInvitacion("")).toBeNull();
    expect(leerInvitacion("hola")).toBeNull();
    expect(leerInvitacion("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toBeNull();
  });
});
