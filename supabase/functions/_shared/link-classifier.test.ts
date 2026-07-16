// Tests del clasificador de destino de link-sticker. Batería = casos reales
// (ennidwong, elizabeth, leona) + red-team de parsing (workflow 2026-06-24).
// Correr: deno test supabase/functions/_shared/link-classifier.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLinkDestination, type LinkTier } from "./link-classifier.ts";

function tier(raw: string | null | undefined, funnelHosts: string[] = []): LinkTier {
  return classifyLinkDestination(raw, funnelHosts).tier;
}

Deno.test("casos reales", () => {
  // ennidwong: l.instagram.com → link.me (agregador) → promo
  assertEquals(
    tier("https://l.instagram.com/?u=http%3A%2F%2Flink.me%2Fennidwong&e=AT"),
    "aggregator",
  );
  // elizabeth: link a YouTube → NO promo (el bug que reportó el user)
  assertEquals(
    tier("https://l.instagram.com/?u=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dx&e=AT"),
    "nonpaid",
  );
  // leona/michelle: piclink.me (su funnel) → promo, plataforma resuelta
  const leona = classifyLinkDestination(
    "https://l.instagram.com/?u=https%3A%2F%2Fpiclink.me%2Fleonaoficial&e=AT",
  );
  assertEquals(leona.tier, "aggregator");
  assertEquals(leona.platform, "piclink");
  // unlok.me = funnel propio de la agencia (marca Unlok) → aggregator, plataforma resuelta
  assertEquals(
    classifyLinkDestination("https://l.instagram.com/?u=https%3A%2F%2Funlok.me%2Fleonaoficial&e=AT").platform,
    "unlok",
  );
  // casino/afiliado → tier "casino" (el webhook lo fuerza a No, no a "a revisar")
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Ftucasinoencasa.com%2Fr_adriana&e=AT"), "casino");
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fwww.megacasino-online.com%2Fx&e=AT"), "casino");
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fbetplay.com.co%2Fx&e=AT"), "casino");
});

Deno.test("red-team: parsing del wrapper", () => {
  // happy path paid
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fonlyfans.com%2Fennid&e=AT"), "paid");
  // doble-encoding %253A
  assertEquals(tier("https://l.instagram.com/?u=https%253A%252F%252Fpiclink.me%252Fennid&e=AT2"), "aggregator");
  // wrapper anidado
  assertEquals(
    tier("https://l.instagram.com/?u=https%3A%2F%2Fl.instagram.com%2F%3Fu%3Dhttps%253A%252F%252Fonlyfans.com%252Fx&e=AT3"),
    "paid",
  );
  // wrapper SIN parámetro u → unknown (nunca promo)
  assertEquals(tier("https://l.instagram.com/?e=ATxxxx&s=1"), "unknown");
  // wrapper de Facebook (l.php)
  assertEquals(tier("https://lm.facebook.com/l.php?u=https%3A%2F%2Flinktr.ee%2Fennid&h=AT"), "aggregator");
  // mayúsculas en esquema y host
  assertEquals(tier("HTTPS://L.INSTAGRAM.COM/?u=HTTPS%3A%2F%2FONLYFANS.COM%2FEnnid"), "paid");
  // subdominio m.onlyfans.com + http
  assertEquals(tier("http://l.instagram.com/?u=http%3A%2F%2Fm.onlyfans.com%2Fennid"), "paid");
  // trailing junk / utm
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fbeacons.ai%2Fennid%3Futm_source%3Dig&e=AT"), "aggregator");
  // link directo sin esquema
  assertEquals(tier("piclink.me/ennid"), "aggregator");
  // dominio con puerto
  assertEquals(tier("https://onlyfans.com:443/ennid"), "paid");
  // espacios en el path
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fonlyfans.com%2F%20ennid%20"), "paid");
  // vacío / literal null
  assertEquals(tier(""), "none");
  assertEquals(tier("null"), "none");
  assertEquals(tier(null), "none");
  // path delata plataforma en agregador → tier sigue aggregator, plataforma onlyfans
  const pathReveals = classifyLinkDestination("https://l.instagram.com/?u=https%3A%2F%2Flinktr.ee%2Fennid%2Fonlyfans&e=AT");
  assertEquals(pathReveals.tier, "aggregator");
  assertEquals(pathReveals.platform, "onlyfans");
  // whatsapp con texto sugestivo → NO promo (es contacto, no contenido pago)
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fwa.me%2F569123%3Ftext%3Dquiero%2520OnlyFans&e=AT"), "nonpaid");
  // acortador opaco → unknown
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fbit.ly%2F3xYz9&e=AT"), "unknown");
  // u duplicado + fragment → toma el primero (onlyfans)
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fonlyfans.com%2Fennid%23s&e=AT&u=https%3A%2F%2Fyoutube.com"), "paid");
});

Deno.test("anti falso-positivo de substring (homoglifo/lookalike)", () => {
  // evilonlyfans.com NO debe matchear onlyfans.com (match por label, no substring)
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fevilonlyfans.com%2Fx&e=AT"), "unknown");
});

Deno.test("funnel propio custom (host no listado)", () => {
  // dominio custom que es el funnel de la creadora → aggregator (promo)
  assertEquals(
    tier("https://l.instagram.com/?u=https%3A%2F%2Fmi-dominio-custom.xyz%2Fx&e=AT", ["mi-dominio-custom.xyz"]),
    "aggregator",
  );
  // el mismo dominio SIN ser su funnel → unknown
  assertEquals(tier("https://l.instagram.com/?u=https%3A%2F%2Fmi-dominio-custom.xyz%2Fx&e=AT"), "unknown");
});
