#!/bin/bash
# SIMULACRO v2 — el director. Corre en la Mac y maneja las 4 máquinas de Vultr
# (Miami, Madrid, São Paulo, Ciudad de México) por ssh. Todo contra la COPIA y
# la RÉPLICA del servidor de llamadas; producción no se toca.
#   F1 · 6 llamadas de 2 entre países (bueno, 4G, malo, corte de 30 s, sin UDP, wifi malo)
#   F2 · Cowork de 16 (4 por país), con cortes y pantalla compartida
#   F3 · Sala de 24 (6 por país) + 1000 personas usando Maven a la vez (250 por país)
#   F4 · Mensajes en vivo desde los 4 países: cuántos llegan y en cuánto
#   F5 · Llamada larga de 30 min (8 personas)   (LARGA=0 para saltarla)
# Si la CPU de una máquina pasa del 85 %, lo de esa máquina se marca «no válido».
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
source ~/.config/maven/simulacro.env
source ~/.config/maven/vultr.env
case "$SIM_URL" in *lsagslbkliprespbyhts*) echo "NUNCA contra producción"; exit 1;; esac
SSH="ssh -i $HOME/.ssh/maven-vps -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
NOCHE=$(date -u +%Y-%m-%d_%H%M)
OUT=${OUT:-$HOME/Documents/Claude/Projects/maven-crm/simulacro/v2-$NOCHE}
mkdir -p "$OUT"
exec > >(tee -a "$OUT/bitacora.txt") 2>&1
echo "== Simulacro v2 — $NOCHE UTC"

while read -r label ip; do printf -v "IP_${label#sim-}" "%s" "$ip"; done < <(curl -s -H "Authorization: Bearer $VULTR_API_KEY" "https://api.vultr.com/v2/instances?tag=simulacro" | python3 -c "import sys,json;[print(i['label'],i['main_ip']) for i in json.load(sys.stdin)['instances']]")
PAISES=(mia mad sao mex)
ipde() { local v="IP_$1"; echo "${!v:-}"; }
for r in "${PAISES[@]}"; do [ -n "$(ipde $r)" ] || { echo "falta la máquina $r"; exit 1; }; done
en() { $SSH root@$(ipde $1) "${@:2}"; }
todas() { for r in "${PAISES[@]}"; do en $r "$@" & done; wait; }

# 0) Esperar a que la copia esté arriba (tras cambiarla de tamaño se reinicia).
for k in $(seq 1 60); do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$SIM_URL/auth/v1/health" -H "apikey: $SIM_ANON")
  [ "$c" = 200 ] && curl -s -o /dev/null -w "%{http_code}" "$SIM_URL/rest/v1/tenants?select=id&limit=1" -H "apikey: $SIM_ANON" | grep -q 200 && break
  echo "esperando la copia ($c)…"; sleep 20
done

# 1) Subir lo necesario y armar Chrome en cada máquina.
for r in "${PAISES[@]}"; do
  ( en $r 'mkdir -p /opt/sim' && scp -q -i ~/.ssh/maven-vps -o BatchMode=yes \
      "$AQUI/../navegador.mjs" "$AQUI/../red.sh" "$AQUI/../Dockerfile.navegador" "$AQUI/../maven.js" "$AQUI/../tiempo_real.js" "$AQUI/maquina.sh" \
      root@$(ipde $r):/opt/sim/ && scp -q -i ~/.ssh/maven-vps -o BatchMode=yes ~/.config/maven/simulacro.env root@$(ipde $r):/opt/sim/sim.env \
    && en $r 'chmod 600 /opt/sim/sim.env; chmod +x /opt/sim/maquina.sh; rm -rf /opt/sim/resultados; /opt/sim/maquina.sh preparar' ) &
done; wait

# 2) Un Cowork nuevo, creado por un supervisor de prueba con la función real.
T=$(curl -s "$SIM_URL/auth/v1/token?grant_type=password" -H "apikey: $SIM_ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"sim0160@simulacro.maven.test\",\"password\":\"$SIM_PASS\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
# Un supervisor solo puede tener un Cowork abierto: se terminan los de corridas anteriores.
UID_=$(python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[1];print(json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))['sub'])" "$T")
for viejo in $(curl -s "$SIM_URL/rest/v1/cowork_sessions?select=id&created_by=eq.$UID_&ended_at=is.null" -H "apikey: $SIM_ANON" -H "Authorization: Bearer $T" | python3 -c "import sys,json;[print(x['id']) for x in json.load(sys.stdin)]"); do
  curl -s -o /dev/null "$SIM_URL/functions/v1/cowork-session" -H "apikey: $SIM_ANON" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d "{\"action\":\"endSession\",\"sessionId\":\"$viejo\"}"
done
SES=$(curl -s "$SIM_URL/functions/v1/cowork-session" -H "apikey: $SIM_ANON" -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d "{\"action\":\"createSession\",\"name\":\"Simulacro v2 $NOCHE\",\"roomNames\":[\"P1\",\"P2\",\"P3\",\"P4\",\"P5\",\"P6\",\"Cowork 16\",\"Sala 24\",\"Larga\"]}")
echo "$SES" > "$OUT/sesion.json"
SESSION=$(echo "$SES" | python3 -c "import sys,json;print(json.load(sys.stdin)['sessionId'])") || { echo "no se creó el Cowork: $SES"; exit 1; }
sala() { echo "$SES" | python3 -c "import sys,json;print([r for r in json.load(sys.stdin)['rooms'] if r['name']=='$1'][0]['id'])"; }
nav() { en $1 "SESSION=$SESSION /opt/sim/maquina.sh nav ${@:2}"; }   # pais persona sala cond esc seg comp
fase() { echo "-- $1 ($(date -u +%H:%M))"; }
# SOLO="f1 f4" corre solo esas fases (por defecto, todas).
SOLO=${SOLO:-"f1 f2 f3 f4 f5"}
toca() { [[ " $SOLO " == *" $1 "* ]]; }
correr() { todas "/opt/sim/maquina.sh cpu $1"; todas /opt/sim/maquina.sh esperar; }

# F1 · llamadas de 2 entre países
if toca f1; then
fase "F1: llamadas de 2 entre países"
nav mia 401 "$(sala P1)" bueno dos 300; nav mad 402 "$(sala P1)" bueno dos 300
nav sao 403 "$(sala P2)" bueno dos 300; nav mex 404 "$(sala P2)" bueno dos 300
nav mia 405 "$(sala P3)" 4g dos 300;    nav sao 406 "$(sala P3)" 4g dos 300
nav mad 407 "$(sala P4)" malo dos 300;  nav mex 408 "$(sala P4)" bueno dos 300
nav mia 409 "$(sala P5)" corte30 dos 300; nav mad 410 "$(sala P5)" bueno dos 300
nav sao 411 "$(sala P6)" sin_udp dos 300; nav mex 412 "$(sala P6)" wifi_perdidas dos 300
correr f1
fi

# F2 · Cowork de 16, 4 por país (2 bueno, 1 4G, 1 con cortes), 2 comparten pantalla
if toca f2; then
fase "F2: Cowork de 16"
C=$(sala "Cowork 16"); n=420
for r in "${PAISES[@]}"; do
  comp=0; [ "$r" = mia ] || [ "$r" = mad ] && comp=1
  nav $r $n "$C" bueno cowork16 360 $comp; nav $r $((n+1)) "$C" bueno cowork16 360
  nav $r $((n+2)) "$C" 4g cowork16 360;    nav $r $((n+3)) "$C" cortes cowork16 360
  n=$((n+4))
done
correr f2
fi

# F3 · Sala de 24 (6 por país, 2 pantallas) + 1000 personas usando Maven (250 por país)
if toca f3; then
fase "F3: sala de 24 + 1000 personas en Maven"
S=$(sala "Sala 24"); n=440; i=0
for r in "${PAISES[@]}"; do
  en $r "/opt/sim/maquina.sh k6 maven.js carga -e PARTES=4 -e PARTE=$i -e VUS=250 -e SUBIDA=2m -e DURACION=4m"
  comp=0; [ "$r" = sao ] || [ "$r" = mex ] && comp=1
  nav $r $n "$S" bueno sala24 360 $comp
  for k in 1 2 3 4 5; do c=bueno; [ $k = 4 ] && c=4g; [ $k = 5 ] && c=malo; nav $r $((n+k)) "$S" $c sala24 360; done
  n=$((n+6)); i=$((i+1))
done
correr f3
fi

# F4 · Mensajes en vivo desde los 4 países (25 personas por país)
if toca f4; then
fase "F4: mensajes en vivo"
i=0; for r in "${PAISES[@]}"; do en $r "/opt/sim/maquina.sh k6 tiempo_real.js vivo -e PARTES=4 -e PARTE=$i -e VUS=25 -e DURACION=5m"; i=$((i+1)); done
correr f4
fi

# F5 · Llamada larga
if toca f5; then
  fase "F5: llamada larga de 30 min"
  L=$(sala "Larga"); n=470
  for r in "${PAISES[@]}"; do nav $r $n "$L" bueno larga 1800; nav $r $((n+1)) "$L" 4g larga 1800; n=$((n+2)); done
  correr f5
fi

# Traer resultados
for r in "${PAISES[@]}"; do mkdir -p "$OUT/$r"; scp -q -r -i ~/.ssh/maven-vps -o BatchMode=yes root@$(ipde $r):/opt/sim/resultados/. "$OUT/$r/"; done
echo "== Terminó $(date -u +%H:%M) UTC · $OUT"
python3 "$AQUI/resumen.py" "$OUT" > "$OUT/resumen.json" && echo "resumen listo"
