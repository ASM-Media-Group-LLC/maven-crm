# Maven Promolog — Scanner IG (extensión de Chrome)

Lee las historias de Instagram de las creadoras **desde TU navegador** (tu IP residencial +
tu sesión real de IG) y las manda a Maven, que las analiza con IA + guarda la evidencia —
igual que el resto de Promolog. Como el scraping NO sale del server, IG no lo marca como
IP de datacenter (que es lo que quemó la cuenta anterior).

## Cómo funciona
1. La extensión le pide a Maven la lista de creadoras activas (`promolog-scan-targets`).
2. Por cada una, desde tu navegador: resuelve el user-id de IG y lee sus historias.
3. Manda los resultados a Maven (`promolog-ingest-stories`) en lotes de 6; Maven corre
   Gemini + guarda `promolog_entries` (Sí / No / pendiente).

## Setup (una vez)

### 1. Token compartido
- En **Supabase → Project → Edge Functions → Secrets** (o Settings → Functions), creá un
  secret llamado **`PROMOLOG_EXT_TOKEN`** con un valor aleatorio largo (ej. generá uno con
  `openssl rand -hex 24`).
- Guardá ese MISMO valor para pegarlo en la extensión (paso 4).

### 2. Cuenta de IG
- Iniciá sesión en **instagram.com** con la **cuenta scanner** (NO tu personal) en el
  Chrome donde vas a instalar la extensión.
- **Seguí a las creadoras privadas** desde esa cuenta (las públicas no hace falta) — si no
  las seguís, sus historias no se pueden leer.

### 3. Instalar la extensión
- Abrí `chrome://extensions` → activá **Modo desarrollador** (arriba a la derecha).
- **Cargar descomprimida** → elegí esta carpeta (`infra/promolog-extension`).

### 4. Configurar
- Click en la extensión → **⚙ Opciones**.
- **Maven URL:** `https://lsagslbkliprespbyhts.supabase.co` (ya viene por default).
- **Token:** pegá el `PROMOLOG_EXT_TOKEN` del paso 1. Guardar.

## Uso
- **Manual:** click en la extensión → **Escanear historias ahora**. Muestra el progreso.
- **Automático:** corre **1×/día** solo (mientras Chrome esté abierto). Para que sea
  confiable, dejá este Chrome **abierto** en una máquina que quede prendida.

## Notas
- Solo lee lo que tu cuenta puede ver (públicas + privadas que seguís).
- La evidencia (imagen de cada historia) queda en el bucket de Maven, igual que siempre.
- No guarda tu sesión ni el token en ningún lado más que este navegador.
