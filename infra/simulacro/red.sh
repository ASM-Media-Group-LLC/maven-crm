#!/bin/bash
# Imita el internet de una ciudad y una condición, y corre el comando.
#   RTT_MS   ida extra (la mitad del ping desde la ciudad)
#   COND     bueno | malo | cortes | sin_internet
set -u
IF=eth0
D=${RTT_MS:-20}
case "${COND:-bueno}" in
  bueno)        tc qdisc add dev $IF root netem delay ${D}ms $((D/10+1))ms ;;
  malo)         tc qdisc add dev $IF root netem delay $((D+80))ms 40ms distribution normal loss 3% rate 1500kbit ;;
  cortes|sin_internet|corte5|corte30) tc qdisc add dev $IF root netem delay ${D}ms $((D/10+1))ms ;;
  4g)           tc qdisc add dev $IF root netem delay $((D+40))ms 15ms distribution normal loss 0.5% rate 8mbit ;;
  3g)           tc qdisc add dev $IF root netem delay $((D+150))ms 50ms distribution normal loss 2% rate 1mbit ;;
  wifi_perdidas) tc qdisc add dev $IF root netem delay $((D+10))ms 20ms loss 5% ;;
  1mbps)        tc qdisc add dev $IF root netem delay ${D}ms 5ms rate 1mbit ;;
  sin_udp)      tc qdisc add dev $IF root netem delay ${D}ms $((D/10+1))ms
                # internet que bloquea llamadas: sin UDP (salvo DNS); obliga a TCP o a la red de respaldo
                iptables -A OUTPUT -p udp --dport 53 -j ACCEPT; iptables -A OUTPUT -p udp -j DROP ;;
esac
if [ "${COND:-}" = "corte5" ] || [ "${COND:-}" = "corte30" ]; then
  S=5; [ "$COND" = "corte30" ] && S=30
  ( sleep 90; tc qdisc change dev $IF root netem delay ${D}ms loss 100%; sleep $S; tc qdisc change dev $IF root netem delay ${D}ms $((D/10+1))ms ) &
fi
if [ "${COND:-}" = "cortes" ]; then
  # se cae 15 s cada 60 s
  ( while true; do sleep 45; tc qdisc change dev $IF root netem delay ${D}ms loss 100%; sleep 15; tc qdisc change dev $IF root netem delay ${D}ms $((D/10+1))ms; done ) &
fi
if [ "${COND:-}" = "sin_internet" ]; then
  # minuto 2 a 3: sin internet; después vuelve (¿se recupera solo?)
  ( sleep 120; tc qdisc change dev $IF root netem loss 100%; sleep 60; tc qdisc change dev $IF root netem delay ${D}ms $((D/10+1))ms ) &
fi
exec "$@"
