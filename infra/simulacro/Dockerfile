# Una «persona» del simulacro: k6 (pantallas, mensajes, archivos, tiempo real)
# y lk (llamadas de LiveKit), con iproute2 para imitar el internet de cada país.
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 iptables ca-certificates curl jq python3 \
 && rm -rf /var/lib/apt/lists/*
ARG K6=v0.54.0
ARG LK=2.19.4
RUN curl -fsSL https://github.com/grafana/k6/releases/download/${K6}/k6-${K6}-linux-amd64.tar.gz | tar xz -C /tmp \
 && mv /tmp/k6-${K6}-linux-amd64/k6 /usr/local/bin/k6 \
 && curl -fsSL https://github.com/livekit/livekit-cli/releases/download/v${LK}/lk_${LK}_linux_amd64.tar.gz | tar xz -C /usr/local/bin lk
COPY red.sh /red.sh
RUN chmod +x /red.sh
ENTRYPOINT ["/red.sh"]
