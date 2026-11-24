#!/usr/bin/env python3
"""Simulacro acotado de LiveKit en Docker, sin puertos ni credenciales reales.

Ejecutar EN el servidor de laboratorio con Python 3 y las imágenes YA presentes:
  python3 simulacro-livekit-aislado.py --plan
  python3 simulacro-livekit-aislado.py --run --audio --output /var/tmp/maven-simulacro

No mide Maven completo, navegadores, internet residencial ni grabaciones.
Fuente del generador: https://docs.livekit.io/transport/self-hosting/benchmark/
"""
import argparse
import datetime
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import signal
import subprocess
import time
import urllib.request

SFU_IMAGE = "livekit/livekit-server:v1.8.4"
CLI_IMAGE = "livekit/livekit-cli:latest"
GENERATOR_BASE_IMAGE = "denoland/deno:latest"
CONNECTIONS = (33, 165, 330)
ROOM_SIZE = 11
PUBLISHERS = 5
SUBSCRIBERS = 6
SERVER_CPUS = 2
LABEL = "maven.auditoria.simulacro"


def run(*args, check=True, timeout=20):
    p = subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=timeout)
    if check and p.returncode:
        raise RuntimeError(f"Comando {args[0]} falló ({p.returncode}): {p.stderr[-1200:]}")
    return (p.stdout + p.stderr if len(args) > 1 and args[1] == "logs" else p.stdout).strip()


def memory_available():
    values = dict(re.findall(r"^(\w+):\s+(\d+)", Path("/proc/meminfo").read_text(), re.M))
    return int(values["MemAvailable"]) * 1024


def cpu_counters():
    fields = list(map(int, Path("/proc/stat").read_text().splitlines()[0].split()[1:9]))
    return sum(fields), fields[3] + fields[4]


def existing_state():
    ids = run("docker", "ps", "-q").split()
    if not ids:
        return {}
    records = json.loads(run("docker", "inspect", *ids))
    return {r["Id"]: {"name": r["Name"], "running": r["State"]["Running"],
                        "restarts": r["RestartCount"], "health": r["State"].get("Health", {}).get("Status")}
            for r in records if not r["Config"].get("Labels", {}).get(LABEL)}


def metric_values(raw):
    values = {}
    for line in raw.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        try:
            key, value = line.rsplit(" ", 1)
            values[key] = float(value)
        except ValueError:
            pass
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", action="store_true", help="Crear y ejecutar el laboratorio efímero")
    parser.add_argument("--plan", action="store_true", help="Mostrar alcance sin tocar Docker")
    parser.add_argument("--audio", action="store_true", help="Añadir un escenario solo audio de 330 conexiones")
    parser.add_argument("--connections", default="33,165,330", help="Subconjunto ascendente de 33,165,330")
    parser.add_argument("--generator-cpus", type=int, default=2, choices=range(1, 5))
    parser.add_argument("--generator-memory-gb", type=int, default=2, choices=range(2, 7))
    parser.add_argument("--server-memory-gb", type=int, default=2, choices=range(2, 4))
    parser.add_argument("--duration", type=int, default=60, choices=range(30, 121), metavar="30..120")
    parser.add_argument("--output", type=Path, help="Carpeta NUEVA para evidencia, nunca datos de producción")
    args = parser.parse_args()
    try:
        connections = tuple(int(n) for n in args.connections.split(","))
    except ValueError:
        parser.error("--connections solo admite 33,165,330 o un subconjunto ascendente.")
    if not connections or tuple(sorted(set(connections))) != connections or any(n not in CONNECTIONS for n in connections):
        parser.error("--connections solo admite 33,165,330 o un subconjunto ascendente sin duplicados.")
    total_cpus = SERVER_CPUS + args.generator_cpus
    total_memory = args.server_memory_gb + args.generator_memory_gb
    plan = {"connections": connections, "rooms": [n // ROOM_SIZE for n in connections],
            "room": {"publishers": PUBLISHERS, "subscribers": SUBSCRIBERS},
            "video": "720p VP8, simulcast, speaker (hasta 6 participantes visibles)",
            "seconds_per_room_after_join": args.duration, "extra_audio_330": args.audio,
            "limits_total": {"cpus": total_cpus, "memory_gb": total_memory},
            "limits_server": {"cpus": SERVER_CPUS, "memory_gb": args.server_memory_gb},
            "limits_generator": {"cpus": args.generator_cpus, "memory_gb": args.generator_memory_gb},
            "network": "Docker --internal, sin puertos publicados, sin servicios reales",
            "warning": "Carga sintética de SFU y generador en el mismo host; no certifica capacidad de Maven ni calidad WAN."}
    print(json.dumps(plan, ensure_ascii=False), flush=True)
    if args.plan or not args.run:
        return
    if (os.cpu_count() or 0) < max(8, total_cpus + 2) or memory_available() < (total_memory + 6) * 1024**3:
        raise RuntimeError("No hay recursos para conservar 2 CPU y 6 GiB fuera del laboratorio; no se inicia la carga.")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = (args.output or Path(f"/var/tmp/maven-simulacro-{stamp}")).resolve()
    output.mkdir(parents=True, exist_ok=False)
    # Se fija el ID local; nunca se descarga ni actualiza una imagen al ejecutar.
    images = {}
    for name in (SFU_IMAGE, CLI_IMAGE, GENERATOR_BASE_IMAGE):
        info = json.loads(run("docker", "image", "inspect", name))[0]
        images[name] = {"id": info["Id"], "digests": info.get("RepoDigests", []),
                        "entrypoint": info["Config"].get("Entrypoint")}
    server_image, cli_image = images[SFU_IMAGE]["id"], images[CLI_IMAGE]["id"]
    generator_image = images[GENERATOR_BASE_IMAGE]["id"]
    entrypoint = images[CLI_IMAGE]["entrypoint"] or []
    if len(entrypoint) != 1 or not re.fullmatch(r"/?[a-zA-Z0-9_./-]+", entrypoint[0]):
        raise RuntimeError("El ejecutable de la imagen CLI no se identifica de forma inequívoca.")
    cli_source = entrypoint[0] if entrypoint[0].startswith("/") else "/" + entrypoint[0]
    cli_path = "/audit-bin/lk"
    before = existing_state()
    report = {"plan": plan, "images": images,
              "host_cpus": os.cpu_count(), "host_available_memory_before": memory_available(),
              "started_utc": stamp, "scenarios": [], "existing_before": before}
    prefix = "maven-audit-" + secrets.token_hex(5)
    network = prefix + "-red"
    containers = []
    made_network = False
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def dump():
        pending = output / "resultado.json.tmp"
        pending.write_text(json.dumps(report, indent=2, ensure_ascii=False))
        pending.replace(output / "resultado.json")

    def remove(name):
        # Solo los nombres creados por ESTA ejecución; no se usan comodines.
        if name in containers:
            run("docker", "rm", "-f", name, check=False)
            containers.remove(name)

    def metrics(ip):
        try:
            return opener.open(f"http://{ip}:6789/metrics", timeout=3).read(2_000_000).decode()
        except Exception:
            return ""

    def interrupted(signum, frame):
        raise InterruptedError(f"Señal {signum}: se retiran únicamente los contenedores de prueba.")

    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    try:
        # La imagen oficial CLI no incluye shell. Extraemos su binario sin
        # ejecutarlo y usamos una base glibc YA presente para coordinar salas.
        extract = prefix + "-extract"
        containers.append(extract)
        run("docker", "create", "--pull", "never", "--name", extract, "--network", "none",
            "--label", f"{LABEL}={prefix}", cli_image)
        binary_dir = output / "bin"
        binary_dir.mkdir()
        binary = binary_dir / "lk"
        run("docker", "cp", f"{extract}:{cli_source}", str(binary))
        binary.chmod(0o555)
        report["cli_binary"] = {"source_path": cli_source,
                                "sha256": hashlib.sha256(binary.read_bytes()).hexdigest()}
        remove(extract)
        check_name = prefix + "-check"
        containers.append(check_name)
        report["cli_version"] = run("docker", "run", "--pull", "never", "--name", check_name,
            "--network", "none", "--label", f"{LABEL}={prefix}", "--read-only",
            "--user", "0:0",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            "--mount", f"type=bind,src={binary_dir},dst=/audit-bin,readonly",
            "--entrypoint", cli_path, generator_image, "--version")
        remove(check_name)
        dump()
        run("docker", "network", "create", "--internal", "--label", f"{LABEL}={prefix}", network)
        made_network = True
        net = json.loads(run("docker", "network", "inspect", network))[0]
        subnet = ipaddress.ip_network(net["IPAM"]["Config"][0]["Subnet"])
        ip = str(subnet.network_address + 10)
        api_key, api_secret = "auditoria_sintetica", secrets.token_hex(24)
        config = f"""port: 7880
prometheus_port: 6789
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false
logging:
  level: warn
keys:
  {api_key}: {api_secret}
"""
        scenarios = [("video", n) for n in connections]
        if args.audio:
            scenarios.append(("audio", CONNECTIONS[-1]))
        for media, n in scenarios:
            stage = f"{media}-{n}"
            stage_dir = output / stage
            stage_dir.mkdir()
            sfu, gen = prefix + "-sfu", prefix + "-gen"
            limits = ["--pids-limit", "1024", "--ulimit", "nofile=65535:65535",
                      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                      "--label", f"{LABEL}={prefix}", "--log-opt", "max-size=10m", "--log-opt", "max-file=1"]
            containers.append(sfu)
            run("docker", "run", "-d", "--pull", "never", "--name", sfu, "--network", network, "--ip", ip,
                "--network-alias", "sfu", *limits, "--cpus", str(SERVER_CPUS),
                "--memory", f"{args.server_memory_gb}g", "--memory-swap", f"{args.server_memory_gb}g",
                "--read-only", "--tmpfs", "/tmp:size=64m",
                "-e", "LIVEKIT_CONFIG=" + config, server_image, "--bind", "0.0.0.0", "--node-ip", ip)
            for _ in range(15):
                if metrics(ip):
                    break
                time.sleep(1)
            else:
                (stage_dir / "server.log").write_text(run("docker", "logs", sfu, check=False))
                raise RuntimeError("El SFU aislado no expone métricas; no se lanza carga a ciegas.")
            commands = ["set -u", "estado=0", "pids=''", "i=1"]
            commands.append(f"while [ \"$i\" -le {n // ROOM_SIZE} ]; do")
            pubflag = "--video-publishers" if media == "video" else "--audio-publishers"
            video_options = "--video-resolution high --video-codec vp8" if media == "video" else ""
            commands += [f"{shlex.quote(cli_path)} load-test --room 'auditoria-{stage}-'\"$i\" "
                         f"--identity-prefix 'sintetico-'\"$i\" {pubflag} {PUBLISHERS} --subscribers {SUBSCRIBERS} "
                         f"--duration {args.duration}s --num-per-second 5 --layout speaker {video_options} "
                         '>"/out/sala-$i.log" 2>&1 &',
                         'pids="$pids $!"', 'i=$((i + 1))', 'sleep 0.1', "done",
                         'for p in $pids; do wait "$p" || estado=1; done', 'exit "$estado"']
            containers.append(gen)
            run("docker", "run", "-d", "--pull", "never", "--name", gen, "--network", network,
                *limits, "--cpus", str(args.generator_cpus),
                "--memory", f"{args.generator_memory_gb}g", "--memory-swap", f"{args.generator_memory_gb}g",
                "--user", "0:0", "--tmpfs", "/tmp:size=256m", "--mount", f"type=bind,src={stage_dir},dst=/out",
                "--mount", f"type=bind,src={binary_dir},dst=/audit-bin,readonly",
                "-e", "LIVEKIT_URL=ws://sfu:7880", "-e", "LIVEKIT_API_KEY=" + api_key,
                "-e", "LIVEKIT_API_SECRET=" + api_secret, "--entrypoint", "/bin/sh", generator_image,
                "-c", "\n".join(commands))
            record = {"media": media, "target_connections": n, "target_rooms": n // ROOM_SIZE,
                      "duration_requested_seconds": args.duration, "samples": [], "status": "running"}
            report["scenarios"].append(record)
            dump()
            print(f"INICIO {stage}: {n} conexiones en {n // ROOM_SIZE} salas", flush=True)
            start = time.monotonic()
            previous_cpu = cpu_counters()
            cpu_high = 0
            with (stage_dir / "metricas.prom.jsonl").open("w") as metric_file:
                while True:
                    if time.monotonic() - start > args.duration + 120:
                        raise RuntimeError(f"{stage}: límite de tiempo de seguridad alcanzado.")
                    state = json.loads(run("docker", "inspect", gen))[0]["State"]
                    raw = metrics(ip)
                    elapsed = round(time.monotonic() - start, 1)
                    metric_file.write(json.dumps({"elapsed": elapsed, "prometheus": raw}) + "\n")
                    metric_file.flush()
                    docker_stats = run("docker", "stats", "--no-stream", "--format", "{{json .}}", sfu, gen)
                    cpu = cpu_counters()
                    total, idle = cpu[0] - previous_cpu[0], cpu[1] - previous_cpu[1]
                    usage = 100 * (1 - idle / total) if total > 0 else 0
                    previous_cpu = cpu
                    available = memory_available()
                    record["samples"].append({"elapsed": elapsed, "host_cpu_percent": round(usage, 1),
                                               "host_available_bytes": available,
                                               "containers": [json.loads(line) for line in docker_stats.splitlines() if line],
                                               "metrics": metric_values(raw)})
                    dump()
                    cpu_high = cpu_high + 1 if usage > 85 else 0
                    if available < 6 * 1024**3 or cpu_high >= 3:
                        raise RuntimeError(f"{stage}: guardia de CPU/RAM del host; se detiene el laboratorio.")
                    now = existing_state()
                    for cid, original in before.items():
                        current = now.get(cid)
                        if not current or current["restarts"] != original["restarts"] or (original["health"] == "healthy" and current["health"] == "unhealthy"):
                            raise RuntimeError(f"Cambió la salud de {original['name']}; se detiene el laboratorio.")
                    if not state["Running"]:
                        record["exit_code"] = state["ExitCode"]
                        record["oom_killed"] = state["OOMKilled"]
                        record["status"] = "completed" if state["ExitCode"] == 0 else "generator_failed"
                        break
                    time.sleep(4)
            (stage_dir / "server.log").write_text(run("docker", "logs", sfu, check=False))
            (stage_dir / "generator.log").write_text(run("docker", "logs", gen, check=False))
            record["elapsed_seconds"] = round(time.monotonic() - start, 1)
            remove(gen)
            remove(sfu)
            dump()
            print(f"FIN {stage}: {record['status']}; {record['elapsed_seconds']} s", flush=True)
            if record["status"] != "completed":
                raise RuntimeError(f"{stage}: generador falló; no se aumenta la carga.")
            time.sleep(3)
        report["status"] = "completed"
    except BaseException as error:
        report["status"] = "stopped"
        report["reason"] = str(error)
        for name in containers:
            (output / (name + ".log")).write_text(run("docker", "logs", name, check=False))
        raise
    finally:
        for name in list(reversed(containers)):
            remove(name)
        if made_network:
            run("docker", "network", "rm", network, check=False)
        report["existing_after"] = existing_state()
        report["host_available_memory_after"] = memory_available()
        report["finished_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        report["cleanup_names"] = [prefix + "-extract", prefix + "-check", prefix + "-sfu", prefix + "-gen", network]
        dump()
        print("EVIDENCIA " + str(output), flush=True)


if __name__ == "__main__":
    main()
