// Handlers de discovery: discover_seed (lista explícita de @handles) y
// discover_hashtag (autores que postean con un hashtag). Ambos terminan
// llamando a runProfileScrape para enriquecer y luego upsert a
// scouter_leads. Cada lead nuevo enqueua automáticamente un score_lead
// para que el LLM lo califique.

import { sb } from "../db.ts";
import { checkBudget } from "../budget.ts";
import { runHashtagDiscovery, runProfileScrape } from "../scrapecreators.ts";
import { persistIgPhoto } from "../storage.ts";
import type {
  DiscoverHashtagPayload,
  DiscoverSeedPayload,
  JobResult,
  ScouterJob,
} from "../types.ts";

interface ProfileItem {
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  verified?: boolean;
  profilePicUrlHD?: string;
  profilePicUrl?: string;
  externalUrl?: string;
}

const DEFAULT_MAX_LEADS = 30;

// Heurística rápida para detectar la plataforma del link in bio.
// Mismo patrón que kash usaba para pre-rank antes del scorer LLM.
function detectLinkInBio(externalUrl?: string | null): string | null {
  if (!externalUrl) return null;
  const u = externalUrl.toLowerCase();
  if (u.includes("linktr.ee")) return "Linktree";
  if (u.includes("beacons.")) return "Beacons";
  if (u.includes("stan.store") || u.includes("stanstore.")) return "Stan";
  if (u.includes("allmylinks")) return "AllMyLinks";
  if (u.includes("koji.to") || u.includes("withkoji")) return "Koji";
  if (u.includes("onlyfans.com")) return "Direct OF";
  return "Other";
}

// Heurística de país basada en señales visibles en el perfil de IG. Es
// pre-scoring: solo descartamos si el user puso target_countries en la
// compañía y la cuenta NO matchea. Si no hay señal clara, devolvemos
// null y el caller decide qué hacer (skipear o no).
//
// Detectamos:
//   · banderas emoji en bio/fullName
//   · keywords explícitas: "México", "MX", "CDMX", "Argentina", etc.
//   · sufijo del handle: "_mx", "_arg" (señal débil pero suma)
//
// Para perfiles que mezclan bandera con keyword + handle suffix, los
// señalamos con confianza alta. Para los que solo tienen 1 señal débil,
// confianza media. Los que no tienen nada → null.
const FLAG_TO_COUNTRY: Record<string, string> = {
  "🇲🇽": "México", "🇦🇷": "Argentina", "🇧🇷": "Brasil", "🇨🇱": "Chile",
  "🇨🇴": "Colombia", "🇵🇪": "Perú", "🇺🇾": "Uruguay", "🇵🇾": "Paraguay",
  "🇧🇴": "Bolivia", "🇪🇨": "Ecuador", "🇻🇪": "Venezuela", "🇨🇺": "Cuba",
  "🇨🇷": "Costa Rica", "🇵🇦": "Panamá", "🇬🇹": "Guatemala", "🇸🇻": "El Salvador",
  "🇭🇳": "Honduras", "🇳🇮": "Nicaragua", "🇩🇴": "República Dominicana",
  "🇵🇷": "Puerto Rico", "🇯🇲": "Jamaica",
  "🇪🇸": "España", "🇵🇹": "Portugal", "🇮🇹": "Italia", "🇫🇷": "Francia",
  "🇩🇪": "Alemania", "🇬🇧": "UK", "🇮🇪": "Irlanda", "🇳🇴": "Noruega",
  "🇸🇪": "Suecia", "🇨🇭": "Suiza", "🇳🇱": "Países Bajos", "🇵🇱": "Polonia",
  "🇷🇺": "Rusia", "🇺🇦": "Ucrania", "🇷🇴": "Rumania", "🇨🇿": "República Checa",
  "🇭🇺": "Hungría", "🇷🇸": "Serbia", "🇦🇲": "Armenia",
  "🇺🇸": "US/CA", "🇨🇦": "Canadá",
  "🇦🇺": "Australia", "🇳🇿": "Nueva Zelanda", "🇯🇵": "Japón",
  "🇨🇳": "China", "🇰🇷": "Corea del Sur", "🇹🇭": "Tailandia",
  "🇵🇭": "Filipinas", "🇮🇩": "Indonesia", "🇻🇳": "Vietnam",
  "🇸🇬": "Singapur", "🇮🇳": "India", "🇵🇰": "Pakistán",
  "🇮🇱": "Israel", "🇹🇷": "Turquía", "🇦🇪": "Emiratos Árabes Unidos",
  "🇲🇦": "Marruecos", "🇪🇬": "Egipto", "🇿🇦": "Sudáfrica", "🇳🇬": "Nigeria",
};

// Keywords de ciudades/palabras-clave → país canónico. Lowercase, sin
// acentos. Ordenadas por especificidad: las claves más largas/más raras
// se chequean primero (un loop normal va match-by-match, pero hay un
// orden manual que pone "santiago de chile" antes que "santiago" para
// que no se pierda el match más específico).
//
// Ambigüedades comunes resueltas:
//   · Córdoba → "cordoba arg/ar/argentina" vs "cordoba esp/es/spain"
//   · Valencia → "valencia es/españa/spain" vs "valencia ve/venezuela"
//   · Santiago → "santiago de chile/chile" vs "santiago de cuba"
//   · Mérida → "merida mx/mexico/yucatan" vs "merida ve/venezuela"
//   · San José → "san jose costa rica/cr"
const KEYWORD_TO_COUNTRY: Record<string, string> = {
  // ─── MÉXICO ──────────────────────────────────────────────────────
  "mexico": "México", "méxico": "México", "mexicana": "México",
  "mexicano": "México", "mexicanx": "México", "mex 🇲🇽": "México",
  "mexico city": "México", "ciudad de mexico": "México", "cdmx": "México",
  "df mexico": "México",
  "guadalajara": "México", "gdl": "México", "tapatia": "México",
  "tapatio": "México", "jalisco": "México",
  "monterrey": "México", "mty": "México", "regio mx": "México",
  "regiomontana": "México", "regiomontano": "México",
  "tijuana": "México", "tj mexico": "México", "tj baja": "México",
  "baja california": "México", "mexicali": "México", "ensenada": "México",
  "cancun": "México", "cdmx 🇲🇽": "México", "playa del carmen": "México",
  "tulum": "México", "cozumel": "México", "riviera maya": "México",
  "queretaro": "México", "qro": "México",
  "puebla": "México", "pue mexico": "México", "puebla mx": "México",
  "merida mx": "México", "merida mexico": "México", "merida yucatan": "México",
  "yucatan": "México", "campeche": "México", "quintana roo": "México",
  "leon mexico": "México", "leon mx": "México", "leon guanajuato": "México",
  "guanajuato": "México", "san miguel de allende": "México",
  "toluca": "México", "estado de mexico": "México", "edomex": "México",
  "acapulco": "México", "veracruz": "México", "mazatlan": "México",
  "hermosillo": "México", "saltillo": "México", "aguascalientes": "México",
  "tampico": "México", "chihuahua": "México", "ciudad juarez": "México",
  "oaxaca": "México", "morelia": "México", "michoacan": "México",
  "culiacan": "México", "sinaloa": "México", "san luis potosi": "México",
  "slp mexico": "México", "pachuca": "México", "hidalgo mexico": "México",
  "tepic": "México", "nayarit": "México", "villahermosa": "México",
  "tabasco": "México", "durango": "México", "los cabos": "México",
  "san cabos": "México", "huatulco": "México", "puerto vallarta": "México",
  "vallarta mexico": "México", "ixtapa": "México", "zihuatanejo": "México",

  // ─── ARGENTINA ───────────────────────────────────────────────────
  "argentina": "Argentina", "argentino": "Argentina", "argentina🇦🇷": "Argentina",
  "argenta": "Argentina", "argento": "Argentina",
  "buenos aires": "Argentina", "bsas": "Argentina", "bs as": "Argentina",
  "bs.as": "Argentina", "capital federal": "Argentina", "caba": "Argentina",
  "porteño": "Argentina", "porteña": "Argentina", "porteno": "Argentina",
  "portena": "Argentina", "palermo arg": "Argentina", "palermo bsas": "Argentina",
  "recoleta": "Argentina", "belgrano arg": "Argentina", "caballito": "Argentina",
  "almagro arg": "Argentina", "villa crespo": "Argentina",
  "cordoba arg": "Argentina", "cordoba ar": "Argentina",
  "cordoba argentina": "Argentina", "cordobesa": "Argentina",
  "cordobes": "Argentina", "cba arg": "Argentina",
  "rosario arg": "Argentina", "rosario ar": "Argentina",
  "rosario santa fe": "Argentina", "rosarino": "Argentina", "rosarina": "Argentina",
  "santa fe arg": "Argentina", "santa fe ar": "Argentina",
  "mendoza arg": "Argentina", "mendoza ar": "Argentina", "mdz": "Argentina",
  "mendocina": "Argentina", "mendocino": "Argentina",
  "la plata arg": "Argentina", "la plata bsas": "Argentina",
  "mar del plata": "Argentina", "mdp arg": "Argentina", "marplatense": "Argentina",
  "tucuman arg": "Argentina", "tucuman ar": "Argentina", "tucumana": "Argentina",
  "salta arg": "Argentina", "salta ar": "Argentina", "salteña": "Argentina",
  "bariloche": "Argentina", "brc": "Argentina", "patagonia arg": "Argentina",
  "neuquen": "Argentina", "neuquina": "Argentina", "san juan arg": "Argentina",
  "san juan argentina": "Argentina", "jujuy": "Argentina", "jujeña": "Argentina",
  "entre rios": "Argentina", "tigre arg": "Argentina", "san isidro arg": "Argentina",
  "zona norte arg": "Argentina", "zona sur arg": "Argentina", "gba arg": "Argentina",
  "ushuaia": "Argentina", "tierra del fuego": "Argentina",

  // ─── BRASIL ──────────────────────────────────────────────────────
  "brasil": "Brasil", "brazil": "Brasil", "brasileira": "Brasil",
  "brasileiro": "Brasil", "brasilera": "Brasil", "brasilero": "Brasil",
  "sao paulo": "Brasil", "são paulo": "Brasil", "sp brasil": "Brasil",
  "sampa": "Brasil", "paulista": "Brasil", "paulistano": "Brasil",
  "paulistana": "Brasil",
  "rio de janeiro": "Brasil", "rj brasil": "Brasil", "rj brazil": "Brasil",
  "carioca": "Brasil", "ipanema": "Brasil", "copacabana": "Brasil",
  "leblon": "Brasil", "barra da tijuca": "Brasil",
  "salvador bahia": "Brasil", "ssa brasil": "Brasil", "bahiana": "Brasil",
  "bahiano": "Brasil", "soteropolitano": "Brasil",
  "brasilia": "Brasil", "brasília": "Brasil", "bsb brasil": "Brasil",
  "belo horizonte": "Brasil", "bh brasil": "Brasil", "bhz brasil": "Brasil",
  "mineiro": "Brasil", "mineira": "Brasil", "minas gerais": "Brasil",
  "fortaleza": "Brasil", "fortaleza ce": "Brasil", "cearense": "Brasil",
  "ceará": "Brasil",
  "manaus": "Brasil", "amazonas brasil": "Brasil", "amazonense": "Brasil",
  "curitiba": "Brasil", "cwb brasil": "Brasil", "curitibano": "Brasil",
  "curitibana": "Brasil", "parana brasil": "Brasil", "paranaense": "Brasil",
  "recife": "Brasil", "pernambuco": "Brasil", "pernambucana": "Brasil",
  "pernambucano": "Brasil",
  "porto alegre": "Brasil", "poa brasil": "Brasil", "gaucho": "Brasil",
  "gaucha": "Brasil", "rio grande do sul": "Brasil",
  "florianopolis": "Brasil", "floripa": "Brasil", "fln brasil": "Brasil",
  "santa catarina": "Brasil", "catarinense": "Brasil",
  "goiania": "Brasil", "goiás brasil": "Brasil", "belem para": "Brasil",
  "natal rn": "Brasil", "natal brasil": "Brasil", "joao pessoa": "Brasil",
  "maceio": "Brasil", "aracaju": "Brasil", "vitoria es brasil": "Brasil",
  "campinas": "Brasil", "santos brasil": "Brasil", "guaruja": "Brasil",
  "buzios": "Brasil", "paraty": "Brasil",

  // ─── COLOMBIA ────────────────────────────────────────────────────
  "colombia": "Colombia", "colombiana": "Colombia", "colombiano": "Colombia",
  "colombianita": "Colombia",
  "bogota": "Colombia", "bog colombia": "Colombia", "rolo bogotano": "Colombia",
  "rola bogotana": "Colombia", "cundinamarca": "Colombia",
  "medellin": "Colombia", "medellín": "Colombia", "mde colombia": "Colombia",
  "med colombia": "Colombia", "paisa": "Colombia", "antioquia": "Colombia",
  "antioqueña": "Colombia", "antioqueno": "Colombia",
  "cali colombia": "Colombia", "cali col": "Colombia", "caleña": "Colombia",
  "caleño": "Colombia", "valle del cauca": "Colombia",
  "cartagena col": "Colombia", "cartagena colombia": "Colombia",
  "ctg colombia": "Colombia", "cartagenera": "Colombia",
  "barranquilla": "Colombia", "baq colombia": "Colombia", "barranquillera": "Colombia",
  "barranquillero": "Colombia", "costeña col": "Colombia",
  "bucaramanga": "Colombia", "bga colombia": "Colombia", "bumangues": "Colombia",
  "santander col": "Colombia", "pereira col": "Colombia", "pereirana": "Colombia",
  "manizales": "Colombia", "manizalita": "Colombia", "caldas col": "Colombia",
  "santa marta col": "Colombia", "santa marta colombia": "Colombia",
  "samaria col": "Colombia", "magdalena col": "Colombia",
  "cucuta": "Colombia", "norte de santander": "Colombia",
  "ibague": "Colombia", "tolima col": "Colombia",
  "armenia col": "Colombia", "quindio": "Colombia",
  "monteria": "Colombia", "neiva col": "Colombia", "huila col": "Colombia",
  "villavicencio": "Colombia",
  "san andres col": "Colombia", "providencia col": "Colombia",

  // ─── CHILE ───────────────────────────────────────────────────────
  "chile": "Chile", "chilena": "Chile", "chileno": "Chile",
  "santiago de chile": "Chile", "santiago chile": "Chile", "scl chile": "Chile",
  "santiaguino": "Chile", "santiaguina": "Chile",
  "providencia chile": "Chile", "las condes": "Chile", "vitacura": "Chile",
  "ñuñoa": "Chile", "lo barnechea": "Chile",
  "valparaiso": "Chile", "valpo": "Chile", "porteña chile": "Chile",
  "viña del mar": "Chile", "viña chile": "Chile", "vina del mar": "Chile",
  "viñamarina": "Chile",
  "concepcion chile": "Chile", "ccp chile": "Chile", "penquista": "Chile",
  "antofagasta": "Chile", "la serena chile": "Chile",
  "temuco": "Chile", "araucania": "Chile", "iquique": "Chile",
  "puerto montt": "Chile", "puerto varas": "Chile", "chiloe": "Chile",
  "patagonia chilena": "Chile", "punta arenas": "Chile",
  "rancagua": "Chile", "talca chile": "Chile", "chillan": "Chile",
  "arica chile": "Chile",

  // ─── VENEZUELA ───────────────────────────────────────────────────
  "venezuela": "Venezuela", "venezolana": "Venezuela", "venezolano": "Venezuela",
  "venezolana🇻🇪": "Venezuela",
  "caracas": "Venezuela", "ccs venezuela": "Venezuela", "caraqueña": "Venezuela",
  "caraqueño": "Venezuela",
  "maracaibo": "Venezuela", "mcbo": "Venezuela", "zuliana": "Venezuela",
  "zuliano": "Venezuela", "zulia ve": "Venezuela",
  "valencia ve": "Venezuela", "valencia venezuela": "Venezuela",
  "valencia carabobo": "Venezuela", "carabobeña": "Venezuela",
  "barquisimeto": "Venezuela", "lara venezuela": "Venezuela",
  "maracay": "Venezuela", "aragua venezuela": "Venezuela",
  "merida ve": "Venezuela", "merida venezuela": "Venezuela",
  "puerto la cruz ve": "Venezuela", "puerto ordaz ve": "Venezuela",
  "ciudad bolivar ve": "Venezuela", "isla margarita": "Venezuela",
  "san cristobal ve": "Venezuela", "tachira ve": "Venezuela",

  // ─── PERÚ ────────────────────────────────────────────────────────
  "peru": "Perú", "perú": "Perú", "peruana": "Perú", "peruano": "Perú",
  "lima peru": "Perú", "lima perú": "Perú", "lim peru": "Perú",
  "limeña": "Perú", "limeño": "Perú", "miraflores peru": "Perú",
  "barranco peru": "Perú", "san isidro peru": "Perú",
  "arequipa": "Perú", "aqp peru": "Perú", "arequipeña": "Perú",
  "arequipeño": "Perú",
  "cusco": "Perú", "cuzco": "Perú", "machu picchu": "Perú", "cusqueña": "Perú",
  "trujillo peru": "Perú", "trujillana": "Perú", "trujillano": "Perú",
  "piura": "Perú", "piurana": "Perú", "iquitos": "Perú",
  "chiclayo": "Perú", "chiclayana": "Perú", "huancayo": "Perú",
  "tacna": "Perú", "puno peru": "Perú", "ica peru": "Perú",
  "callao peru": "Perú", "chalaca": "Perú",

  // ─── URUGUAY ─────────────────────────────────────────────────────
  "uruguay": "Uruguay", "uruguaya": "Uruguay", "uruguayo": "Uruguay",
  "montevideo": "Uruguay", "mvd uy": "Uruguay", "montevideana": "Uruguay",
  "montevideano": "Uruguay",
  "punta del este": "Uruguay", "punta uy": "Uruguay", "maldonado uy": "Uruguay",
  "salto uy": "Uruguay", "paysandu": "Uruguay", "colonia uy": "Uruguay",

  // ─── PARAGUAY ────────────────────────────────────────────────────
  "paraguay": "Paraguay", "paraguaya": "Paraguay", "paraguayo": "Paraguay",
  "asuncion py": "Paraguay", "asunción py": "Paraguay", "asu paraguay": "Paraguay",
  "ciudad del este": "Paraguay", "cde paraguay": "Paraguay",
  "encarnacion py": "Paraguay", "pedro juan caballero": "Paraguay",

  // ─── BOLIVIA ─────────────────────────────────────────────────────
  "bolivia": "Bolivia", "boliviana": "Bolivia", "boliviano": "Bolivia",
  "la paz bo": "Bolivia", "la paz bolivia": "Bolivia", "lpz bolivia": "Bolivia",
  "paceña": "Bolivia",
  "santa cruz bo": "Bolivia", "santa cruz bolivia": "Bolivia",
  "cruceña": "Bolivia", "cruceño": "Bolivia",
  "cochabamba": "Bolivia", "cochabambina": "Bolivia",
  "sucre bo": "Bolivia", "sucre bolivia": "Bolivia",
  "potosi bo": "Bolivia", "oruro bo": "Bolivia", "tarija bo": "Bolivia",

  // ─── ECUADOR ─────────────────────────────────────────────────────
  "ecuador": "Ecuador", "ecuatoriana": "Ecuador", "ecuatoriano": "Ecuador",
  "quito": "Ecuador", "uio ecuador": "Ecuador", "quiteña": "Ecuador",
  "quiteño": "Ecuador",
  "guayaquil": "Ecuador", "gye ecuador": "Ecuador", "guayaca": "Ecuador",
  "guayaco": "Ecuador",
  "cuenca ec": "Ecuador", "cuenca ecuador": "Ecuador", "cuencana": "Ecuador",
  "manta ecuador": "Ecuador", "salinas ecuador": "Ecuador",
  "galapagos": "Ecuador",

  // ─── CUBA ────────────────────────────────────────────────────────
  "cuba": "Cuba", "cubana": "Cuba", "cubano": "Cuba",
  "la habana": "Cuba", "havana": "Cuba", "habana cuba": "Cuba",
  "habanera": "Cuba", "habanero": "Cuba",
  "santiago de cuba": "Cuba", "varadero": "Cuba", "matanzas cuba": "Cuba",
  "holguin cuba": "Cuba", "camaguey": "Cuba", "santa clara cuba": "Cuba",

  // ─── REPÚBLICA DOMINICANA ───────────────────────────────────────
  "republica dominicana": "República Dominicana",
  "república dominicana": "República Dominicana",
  "dominican republic": "República Dominicana", "dominicana": "República Dominicana",
  "dominicano": "República Dominicana",
  "santo domingo": "República Dominicana", "sdq": "República Dominicana",
  "punta cana": "República Dominicana", "puj dominicana": "República Dominicana",
  "santiago do": "República Dominicana", "santiago rd": "República Dominicana",
  "puerto plata": "República Dominicana", "la romana rd": "República Dominicana",

  // ─── PUERTO RICO ────────────────────────────────────────────────
  "puerto rico": "Puerto Rico", "puertorriqueña": "Puerto Rico",
  "puertorriqueño": "Puerto Rico", "boricua": "Puerto Rico",
  "san juan pr": "Puerto Rico", "san juan puerto rico": "Puerto Rico",
  "bayamon pr": "Puerto Rico", "ponce pr": "Puerto Rico",
  "mayaguez pr": "Puerto Rico", "caguas pr": "Puerto Rico",

  // ─── PANAMÁ ─────────────────────────────────────────────────────
  "panama": "Panamá", "panamá": "Panamá", "panameña": "Panamá",
  "panameño": "Panamá",
  "panama city": "Panamá", "pty panama": "Panamá", "ciudad de panama": "Panamá",
  "colon panama": "Panamá", "david panama": "Panamá", "chitre": "Panamá",
  "bocas del toro": "Panamá", "san blas panama": "Panamá",

  // ─── COSTA RICA ─────────────────────────────────────────────────
  "costa rica": "Costa Rica", "costarricense": "Costa Rica", "tica": "Costa Rica",
  "tico": "Costa Rica", "ticx": "Costa Rica",
  "san jose costa rica": "Costa Rica", "san jose cr": "Costa Rica",
  "sjo costa rica": "Costa Rica", "heredia cr": "Costa Rica",
  "alajuela": "Costa Rica", "guanacaste cr": "Costa Rica", "tamarindo cr": "Costa Rica",
  "puntarenas cr": "Costa Rica", "cartago cr": "Costa Rica",

  // ─── GUATEMALA ──────────────────────────────────────────────────
  "guatemala": "Guatemala", "guatemalteca": "Guatemala", "guatemalteco": "Guatemala",
  "chapina": "Guatemala", "chapin": "Guatemala",
  "guatemala city": "Guatemala", "gua guatemala": "Guatemala",
  "antigua guatemala": "Guatemala", "quetzaltenango": "Guatemala", "xela": "Guatemala",

  // ─── EL SALVADOR ────────────────────────────────────────────────
  "el salvador": "El Salvador", "salvadoreña": "El Salvador",
  "salvadoreño": "El Salvador", "guanaca": "El Salvador", "guanaco": "El Salvador",
  "san salvador": "El Salvador", "santa ana es": "El Salvador",
  "san miguel es": "El Salvador",

  // ─── HONDURAS ───────────────────────────────────────────────────
  "honduras": "Honduras", "hondureña": "Honduras", "hondureño": "Honduras",
  "catracha": "Honduras", "catracho": "Honduras",
  "tegucigalpa": "Honduras", "tegus": "Honduras", "san pedro sula": "Honduras",
  "sps honduras": "Honduras", "roatan": "Honduras", "la ceiba honduras": "Honduras",

  // ─── NICARAGUA ──────────────────────────────────────────────────
  "nicaragua": "Nicaragua", "nicaraguense": "Nicaragua", "nicaragüense": "Nicaragua",
  "nica": "Nicaragua",
  "managua": "Nicaragua", "mga nicaragua": "Nicaragua",
  "granada nicaragua": "Nicaragua", "leon nicaragua": "Nicaragua",
  "san juan del sur": "Nicaragua",

  // ─── JAMAICA ────────────────────────────────────────────────────
  "jamaica": "Jamaica", "jamaicana": "Jamaica", "jamaicano": "Jamaica",
  "kingston jamaica": "Jamaica", "montego bay": "Jamaica", "ocho rios": "Jamaica",

  // ─── ESPAÑA ─────────────────────────────────────────────────────
  "españa": "España", "espana": "España", "spain": "España",
  "española": "España", "espanola": "España", "español": "España",
  "espanol": "España",
  "madrid": "España", "mad spain": "España", "madrileña": "España",
  "madrileño": "España", "chamartin": "España", "malasaña": "España",
  "barcelona": "España", "bcn spain": "España", "bcn españa": "España",
  "barcelonesa": "España", "barcelones": "España", "catalana": "España",
  "catalan": "España", "cataluña": "España", "catalunya": "España",
  "valencia es": "España", "valencia spain": "España",
  "valencia españa": "España", "valenciana": "España", "valenciano": "España",
  "sevilla": "España", "svq spain": "España", "sevillana": "España",
  "sevillano": "España", "andalucia": "España", "andaluz": "España",
  "andaluza": "España",
  "bilbao": "España", "bio spain": "España", "vasca": "España", "vasco": "España",
  "euskadi": "España", "pais vasco": "España",
  "malaga": "España", "agp spain": "España", "marbella": "España",
  "costa del sol": "España", "torremolinos": "España", "fuengirola": "España",
  "zaragoza": "España", "maña spain": "España", "aragon spain": "España",
  "murcia es": "España", "murciana": "España",
  "palma de mallorca": "España", "pmi spain": "España", "ibiza": "España",
  "menorca": "España", "mallorca": "España",
  "las palmas": "España", "gran canaria": "España", "tenerife": "España",
  "canarias": "España", "canaria": "España", "canarian": "España",
  "granada es": "España", "granada españa": "España", "granadina": "España",
  "alicante es": "España", "alicantina": "España", "benidorm": "España",
  "cordoba es": "España", "cordoba esp": "España", "cordoba spain": "España",
  "cordoba españa": "España", "cordoba andalucia": "España",
  "a coruña": "España", "coruña spain": "España", "galicia": "España",
  "gallega": "España", "gallego": "España",
  "vigo es": "España", "vigo spain": "España", "gijon": "España",
  "asturias": "España", "asturiana": "España", "oviedo es": "España",
  "santander es": "España", "cantabria": "España",
  "pamplona": "España", "navarra": "España", "logroño": "España",
  "la rioja es": "España", "san sebastian": "España", "donosti": "España",
  "donostia": "España", "salamanca es": "España", "salmantina": "España",
  "valladolid": "España", "burgos es": "España", "leon es": "España",
  "leon españa": "España", "leon spain": "España", "castilla y leon": "España",
  "toledo es": "España", "toledana": "España", "albacete": "España",
  "ciudad real": "España", "castilla la mancha": "España",
  "cadiz": "España", "gaditana": "España", "jerez": "España",
  "almeria": "España", "huelva": "España", "jaen es": "España",
  "extremadura": "España", "badajoz": "España", "caceres es": "España",
};

// Heurística de género — pronombres explícitos primero (señal más
// fuerte), después emojis típicos, después términos del bio. Si nada
// matchea → null. Comportamiento de "no detectable" lo decide el caller
// (mismo approach que país: permisivo si no podemos confirmar).
function inferGender(item: ProfileItem): "male" | "female" | null {
  const text = [item.fullName ?? "", item.biography ?? ""].join(" ");
  // 1) Pronombres explícitos
  if (/\b(she\s*\/\s*her|she\s*\/\s*they|ella\s*\/\s*ella|hers)\b/i.test(text))
    return "female";
  if (/\b(he\s*\/\s*him|he\s*\/\s*they|él\s*\/\s*él|el\s*\/\s*el|his)\b/i.test(text))
    return "male";
  // 2) Emojis femeninos / masculinos típicos
  if (/[👩💃👗💄💋👠👚👒👰🙋‍♀️🤷‍♀️🤰🌸💗💕]/u.test(text)) return "female";
  if (/[👨🕺🥷🤵🙋‍♂️🤷‍♂️💪]/u.test(text)) return "male";
  // 3) Keywords en español + inglés
  const norm = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const femaleHints =
    /\b(mom|mama|mami|wife|esposa|girlfriend|novia|sister|hermana|chica|girl|gal|mujer|woman|female|mamacita|mrs|miss|madre|señorita|senorita|princesa|reina|baddie|girlie|girlies)\b/i;
  const maleHints =
    /\b(papa|padre|husband|esposo|boyfriend|novio|brother|hermano|chico|guy|hombre|man|male|sir|mr|señor|senor|caballero|king|rey)\b/i;
  if (femaleHints.test(norm)) return "female";
  if (maleHints.test(norm)) return "male";
  return null;
}

function inferCountry(item: ProfileItem): string | null {
  const haystack = [
    item.fullName ?? "",
    item.biography ?? "",
    item.externalUrl ?? "",
  ].join(" ");
  // 1) Banderas emoji — señal más fuerte. Si hay más de una, devolvemos
  //    la primera (caller decide si matchea con target_countries).
  for (const [flag, country] of Object.entries(FLAG_TO_COUNTRY)) {
    if (haystack.includes(flag)) return country;
  }
  // 2) Keywords. Lowercase sin acentos para evitar miss por capitalización.
  const norm = haystack
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  for (const [kw, country] of Object.entries(KEYWORD_TO_COUNTRY)) {
    if (norm.includes(kw)) return country;
  }
  // 3) Sufijo del handle (señal débil pero suma cuando va sola). Match
  //    busca el patrón _xx o xx_ al final del handle. Solo abreviaturas
  //    inequívocas — evitamos colisiones tipo "_es" que también es plural
  //    en español, o "_co" que podría ser ".com".
  const handle = (item.username ?? "").toLowerCase();
  const suffixMatch: Array<[RegExp, string]> = [
    // México
    [/(?:_|^)(mx|mex|mexico|mxn|mexicana|mexicano|cdmx|gdl|mty)(?:_|\d*$)/, "México"],
    // Argentina
    [/(?:_|^)(arg|argentina|argenta|bsas|caba|mdz)(?:_|\d*$)/, "Argentina"],
    // Brasil
    [/(?:_|^)(br|bra|brasil|brazil|carioca|paulista|sampa)(?:_|\d*$)/, "Brasil"],
    // Colombia
    [/(?:_|^)(col|colombia|paisa|bogota|medellin)(?:_|\d*$)/, "Colombia"],
    // Chile
    [/(?:_|^)(chl|chile|chilena|santiagochile|scl)(?:_|\d*$)/, "Chile"],
    // Perú
    [/(?:_|^)(pe|peru|peruana|limena|limeño)(?:_|\d*$)/, "Perú"],
    // Venezuela
    [/(?:_|^)(ve|ven|venezuela|venezolana|caracas|ccs)(?:_|\d*$)/, "Venezuela"],
    // Uruguay
    [/(?:_|^)(uy|uru|uruguay|uruguaya|mvd)(?:_|\d*$)/, "Uruguay"],
    // Paraguay
    [/(?:_|^)(py|par|paraguay|paraguaya|asu)(?:_|\d*$)/, "Paraguay"],
    // Bolivia
    [/(?:_|^)(bo|bol|bolivia|boliviana|lpb)(?:_|\d*$)/, "Bolivia"],
    // Ecuador
    [/(?:_|^)(ec|ecu|ecuador|ecuatoriana|uio|gye)(?:_|\d*$)/, "Ecuador"],
    // Costa Rica
    [/(?:_|^)(cr|crc|costarica|costarrica|tica)(?:_|\d*$)/, "Costa Rica"],
    // Panamá
    [/(?:_|^)(pa|pty|panama|panameña|panamenia)(?:_|\d*$)/, "Panamá"],
    // República Dominicana
    [/(?:_|^)(rd|do|dom|dominicana|sdq)(?:_|\d*$)/, "República Dominicana"],
    // Puerto Rico
    [/(?:_|^)(pr|boricua|puertorico|sanjuanpr)(?:_|\d*$)/, "Puerto Rico"],
    // Cuba
    [/(?:_|^)(cu|cuba|cubana|habana)(?:_|\d*$)/, "Cuba"],
    // Guatemala
    [/(?:_|^)(gt|gua|guate|guatemala|chapina)(?:_|\d*$)/, "Guatemala"],
    // Honduras
    [/(?:_|^)(hn|hnd|honduras|catracha)(?:_|\d*$)/, "Honduras"],
    // El Salvador
    [/(?:_|^)(sv|elsalvador|salvadoreña|guanaca)(?:_|\d*$)/, "El Salvador"],
    // Nicaragua
    [/(?:_|^)(ni|nic|nicaragua|nica)(?:_|\d*$)/, "Nicaragua"],
    // Jamaica
    [/(?:_|^)(jm|jamaica|jamaicana)(?:_|\d*$)/, "Jamaica"],
    // España
    [/(?:_|^)(esp|españa|espana|spain|madrid|bcn|catalana|catalan)(?:_|\d*$)/, "España"],
  ];
  for (const [re, country] of suffixMatch) {
    if (re.test(handle)) return country;
  }
  return null;
}

// Cache de profile fresh: si ya scrapeamos este handle hace <24h, no
// gastamos crédito de nuevo. El refresh natural cada 24h mantiene los
// followers/bio actualizados pero no sangra créditos en autopilot.
const SCRAPE_CACHE_HOURS = 24;

interface DedupResult {
  toScrape: string[];
  skippedInLeadgen: number;
  skippedScouterFresh: number;
  skippedBlocked: number;
}

// Filtra una lista de handles ANTES de pegarle a ScrapeCreators. Cada
// handle filtrado = 1 crédito ahorrado. Devuelve los handles que SÍ
// deben scrapearse + counts de los descartados.
//
//   · en leadgen Y NO en scouter para esta company → skip (no creamos
//     duplicado de Lead Gen → Scouter)
//   · en scouter para esta company con updated_at < 24h → skip (cache
//     fresh, ya tenemos datos recientes)
//   · en blocklist del tenant → skip permanente
//   · resto → scrape (incluye refresh de scouter > 24h)
async function filterFreshHandles(
  handles: string[],
  tenantId: string,
  companyId: string | null,
): Promise<DedupResult> {
  const norm = handles
    .map((h) => h.replace(/^@/, "").trim().toLowerCase())
    .filter(Boolean);
  if (norm.length === 0) {
    return { toScrape: [], skippedInLeadgen: 0, skippedScouterFresh: 0, skippedBlocked: 0 };
  }

  const cacheBefore = new Date(Date.now() - SCRAPE_CACHE_HOURS * 3600 * 1000).toISOString();

  const [lgRes, scFreshRes, scAnyRes, dhRes] = await Promise.all([
    sb.from("leadgen_entries").select("model_handle").in("model_handle", norm),
    // "fresh" en scouter para esta company: scrapped reciente, NO gastar
    // crédito de nuevo.
    companyId
      ? sb
          .from("scouter_leads")
          .select("instagram_handle")
          .eq("company_id", companyId)
          .gte("updated_at", cacheBefore)
          .in("instagram_handle", norm)
      : Promise.resolve({ data: [] as Array<{ instagram_handle: string }>, error: null }),
    // existing-en-scouter-para-esta-company (sin restricción de fecha):
    // si ya existe, no es "duplicado nuevo" desde Lead Gen — refresh ok.
    companyId
      ? sb
          .from("scouter_leads")
          .select("instagram_handle")
          .eq("company_id", companyId)
          .in("instagram_handle", norm)
      : Promise.resolve({ data: [] as Array<{ instagram_handle: string }>, error: null }),
    sb
      .from("scouter_discarded_handles")
      .select("handle")
      .eq("tenant_id", tenantId)
      .in("handle", norm),
  ]);

  const existingInLeadgen = new Set<string>();
  const scouterFresh = new Set<string>();
  const scouterAny = new Set<string>();
  const blocked = new Set<string>();
  if (lgRes.error) console.error("leadgen dedup query failed", lgRes.error);
  else for (const r of (lgRes.data ?? []) as { model_handle: string | null }[]) {
    if (r.model_handle) existingInLeadgen.add(r.model_handle.toLowerCase());
  }
  if (scFreshRes.error) console.error("scouter-fresh query failed", scFreshRes.error);
  else for (const r of (scFreshRes.data ?? []) as { instagram_handle: string }[]) {
    scouterFresh.add(r.instagram_handle.toLowerCase());
  }
  if (scAnyRes.error) console.error("scouter-any query failed", scAnyRes.error);
  else for (const r of (scAnyRes.data ?? []) as { instagram_handle: string }[]) {
    scouterAny.add(r.instagram_handle.toLowerCase());
  }
  if (dhRes.error) console.error("discarded-handles query failed", dhRes.error);
  else for (const r of (dhRes.data ?? []) as { handle: string }[]) {
    blocked.add(r.handle.toLowerCase());
  }

  const toScrape: string[] = [];
  let skippedInLeadgen = 0;
  let skippedScouterFresh = 0;
  let skippedBlocked = 0;
  const seen = new Set<string>();

  for (const h of norm) {
    if (seen.has(h)) continue;
    seen.add(h);
    if (blocked.has(h)) {
      skippedBlocked += 1;
      continue;
    }
    if (scouterFresh.has(h)) {
      skippedScouterFresh += 1;
      continue;
    }
    if (existingInLeadgen.has(h) && !scouterAny.has(h)) {
      skippedInLeadgen += 1;
      continue;
    }
    toScrape.push(h);
  }
  return { toScrape, skippedInLeadgen, skippedScouterFresh, skippedBlocked };
}

// Persiste los items ya scrapeados como leads, aplicando solo filtros
// post-scrape (país, género). El dedup contra Lead Gen / blocklist /
// cache fresh ya se hizo upstream en filterFreshHandles para no
// desperdiciar créditos de ScrapeCreators.
async function persistProfilesAsLeads(
  items: ProfileItem[],
  tenantId: string,
  companyId: string | null,
  discoverySource: string | ((item: ProfileItem) => string),
  targetCountries: string[] | null,
  targetGender: "male" | "female" | "any" | null,
): Promise<{
  inserted: number;
  updated: number;
  skippedByCountry: number;
  skippedByGender: number;
  leadIds: string[];
}> {
  const leadIds: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skippedByCountry = 0;
  let skippedByGender = 0;
  const hasCountryFilter = !!(targetCountries && targetCountries.length > 0);
  const hasGenderFilter = targetGender === "male" || targetGender === "female";

  for (const item of items) {
    const handle = item.username?.trim().toLowerCase();
    if (!handle) continue;

    const inferredCountry = inferCountry(item);
    if (hasCountryFilter && inferredCountry && !targetCountries!.includes(inferredCountry)) {
      skippedByCountry += 1;
      console.log(
        `[discover] skip @${handle} — país inferido ${inferredCountry} fuera de target (${targetCountries!.join(",")})`,
      );
      continue;
    }

    if (hasGenderFilter) {
      const inferredGender = inferGender(item);
      if (inferredGender && inferredGender !== targetGender) {
        skippedByGender += 1;
        console.log(
          `[discover] skip @${handle} — sexo inferido ${inferredGender} ≠ target ${targetGender}`,
        );
        continue;
      }
    }

    const linkPlatform = detectLinkInBio(item.externalUrl);
    const rawPhoto = item.profilePicUrlHD ?? item.profilePicUrl ?? null;
    const photo = await persistIgPhoto(rawPhoto, handle);

    const upsertPayload: Record<string, unknown> = {
      company_id: companyId,
      instagram_handle: handle,
      instagram_url: item.url ?? `https://www.instagram.com/${handle}/`,
      name: item.fullName ?? null,
      bio: item.biography ?? null,
      followers: item.followersCount ?? null,
      verified: item.verified ?? false,
      photo_data_url: photo,
      link_in_bio_platform: linkPlatform,
      discovery_source:
        typeof discoverySource === "function" ? discoverySource(item) : discoverySource,
      tenant_id: tenantId,
    };
    if (inferredCountry) upsertPayload.country = inferredCountry;

    const { data, error } = await sb
      .from("scouter_leads")
      .upsert(upsertPayload, { onConflict: "company_id,instagram_handle" })
      .select("id, ai_score")
      .single();

    if (error) {
      console.error("upsert lead error", handle, error);
      continue;
    }
    const row = data as { id: string; ai_score: number | null };
    leadIds.push(row.id);
    if (row.ai_score == null) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated, skippedByCountry, skippedByGender, leadIds };
}

// Lee target_countries + target_gender de la compañía. Si no hay
// restricción, devuelve los nulls correspondientes.
async function fetchCompanyFilters(
  companyId: string | null,
): Promise<{ targetCountries: string[] | null; targetGender: "male" | "female" | "any" | null }> {
  if (!companyId) return { targetCountries: null, targetGender: null };
  const { data, error } = await sb
    .from("scouter_companies")
    .select("search_config")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return { targetCountries: null, targetGender: null };
  const cfg =
    (data as {
      search_config?: {
        target_countries?: string[];
        target_gender?: "male" | "female" | "any";
      };
    }).search_config ?? {};
  const countries = cfg.target_countries ?? [];
  return {
    targetCountries: countries.length > 0 ? countries : null,
    targetGender: cfg.target_gender ?? null,
  };
}

async function enqueueScoreJobs(leadIds: string[], tenantId: string): Promise<void> {
  if (leadIds.length === 0) return;
  const rows = leadIds.map((leadId) => ({
    kind: "score_lead",
    status: "queued",
    tenant_id: tenantId,
    payload: { leadId },
    // Priority 6: score_lead va por debajo de discovery (7) pero por
    // encima de enrich_handle (3). Queremos scorear leads frescos antes
    // que esperar avatares.
    priority: 6,
  }));
  const { error } = await sb.from("scouter_jobs").insert(rows);
  if (error) console.error("enqueueScoreJobs error", error);
}

export async function handleDiscoverSeed(
  job: ScouterJob,
  payload: DiscoverSeedPayload,
): Promise<JobResult> {
  const seeds = (payload.seeds ?? []).filter((s) => typeof s === "string" && s.trim());
  if (seeds.length === 0) {
    return { ok: false, message: "payload.seeds vacío." };
  }
  const max = Math.min(payload.maxLeads ?? DEFAULT_MAX_LEADS, seeds.length);

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  // Dedup ANTES del scrape — ahorra 1 crédito por handle ya conocido.
  const { toScrape, skippedInLeadgen, skippedScouterFresh, skippedBlocked } =
    await filterFreshHandles(seeds.slice(0, max), job.tenant_id, job.company_id);

  if (toScrape.length === 0) {
    const skips: string[] = [];
    if (skippedInLeadgen) skips.push(`${skippedInLeadgen} en Lead Gen`);
    if (skippedScouterFresh) skips.push(`${skippedScouterFresh} cache <24h`);
    if (skippedBlocked) skips.push(`${skippedBlocked} blocklist`);
    return {
      ok: true,
      message: `discover_seed: 0 nuevos (todos skipped: ${skips.join(", ") || "—"}).`,
      data: { skippedInLeadgen, skippedScouterFresh, skippedBlocked },
    };
  }

  const items = (await runProfileScrape(toScrape, job.tenant_id)) as ProfileItem[];
  const { targetCountries, targetGender } = await fetchCompanyFilters(job.company_id);
  const { inserted, updated, skippedByCountry, skippedByGender, leadIds } =
    await persistProfilesAsLeads(
      items,
      job.tenant_id,
      job.company_id,
      (item) => `seed:@${item.username ?? "?"}`,
      targetCountries,
      targetGender,
    );
  await enqueueScoreJobs(leadIds, job.tenant_id);

  const parts: string[] = [];
  if (skippedInLeadgen) parts.push(`${skippedInLeadgen} skip Lead Gen`);
  if (skippedScouterFresh) parts.push(`${skippedScouterFresh} skip cache<24h`);
  if (skippedBlocked) parts.push(`${skippedBlocked} skip blocklist`);
  if (skippedByCountry) parts.push(`${skippedByCountry} skip país`);
  if (skippedByGender) parts.push(`${skippedByGender} skip sexo`);
  const skipSummary = parts.length > 0 ? `, ${parts.join(", ")}` : "";
  return {
    ok: true,
    message: `discover_seed: ${inserted} nuevos, ${updated} actualizados${skipSummary}.`,
    data: {
      inserted, updated, skippedInLeadgen, skippedScouterFresh, skippedBlocked,
      skippedByCountry, skippedByGender, leadIds,
    },
    apifyItemsProcessed: items.length,
  };
}

export async function handleDiscoverHashtag(
  job: ScouterJob,
  payload: DiscoverHashtagPayload,
): Promise<JobResult> {
  const hashtag = payload.hashtag?.trim().replace(/^#/, "");
  if (!hashtag) return { ok: false, message: "payload.hashtag requerido." };
  const max = payload.maxLeads ?? DEFAULT_MAX_LEADS;

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  // 1) Descubrir autores del hashtag.
  const authors = await runHashtagDiscovery(hashtag, job.tenant_id, max);
  if (authors.length === 0) {
    return { ok: true, message: `hashtag #${hashtag}: 0 autores`, data: { authors: 0 } };
  }

  // 2) Re-checar budget — el hashtag run consumió crédito ya.
  const budget2 = await checkBudget(job.tenant_id);
  if (!budget2.ok) {
    return {
      ok: true,
      message: `discover_hashtag #${hashtag}: ${authors.length} autores encontrados, profile scrape pospuesto (${budget2.reason}).`,
      data: { authorsFound: authors.length, leadsPersisted: 0 },
    };
  }

  // 3) Dedup ANTES del scrape — ahorra crédito por cada autor ya conocido.
  const usernames = authors.map((a) => a.username);
  const { toScrape, skippedInLeadgen, skippedScouterFresh, skippedBlocked } =
    await filterFreshHandles(usernames, job.tenant_id, job.company_id);

  if (toScrape.length === 0) {
    const skips: string[] = [];
    if (skippedInLeadgen) skips.push(`${skippedInLeadgen} Lead Gen`);
    if (skippedScouterFresh) skips.push(`${skippedScouterFresh} cache<24h`);
    if (skippedBlocked) skips.push(`${skippedBlocked} blocklist`);
    return {
      ok: true,
      message: `discover_hashtag #${hashtag}: ${authors.length} autores, 0 nuevos (skipped: ${skips.join(", ") || "—"}).`,
      data: { authorsFound: authors.length, skippedInLeadgen, skippedScouterFresh, skippedBlocked },
      apifyItemsProcessed: authors.length,
    };
  }

  // 4) Enriquecer solo los handles que no están en cache.
  const items = (await runProfileScrape(toScrape, job.tenant_id)) as ProfileItem[];
  const { targetCountries, targetGender } = await fetchCompanyFilters(job.company_id);
  const { inserted, updated, skippedByCountry, skippedByGender, leadIds } =
    await persistProfilesAsLeads(
      items,
      job.tenant_id,
      job.company_id,
      `hashtag:${hashtag}`,
      targetCountries,
      targetGender,
    );
  await enqueueScoreJobs(leadIds, job.tenant_id);

  const parts: string[] = [];
  if (skippedInLeadgen) parts.push(`${skippedInLeadgen} skip Lead Gen`);
  if (skippedScouterFresh) parts.push(`${skippedScouterFresh} skip cache<24h`);
  if (skippedBlocked) parts.push(`${skippedBlocked} skip blocklist`);
  if (skippedByCountry) parts.push(`${skippedByCountry} skip país`);
  if (skippedByGender) parts.push(`${skippedByGender} skip sexo`);
  const skipSummary = parts.length > 0 ? `, ${parts.join(", ")}` : "";
  return {
    ok: true,
    message: `discover_hashtag #${hashtag}: ${inserted} nuevos, ${updated} actualizados${skipSummary}.`,
    data: {
      authorsFound: authors.length, inserted, updated,
      skippedInLeadgen, skippedScouterFresh, skippedBlocked,
      skippedByCountry, skippedByGender,
    },
    apifyItemsProcessed: authors.length + items.length,
  };
}
