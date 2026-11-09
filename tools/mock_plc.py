#!/usr/bin/env python3
"""
Simulador local do CLP para testar as paginas web sem hardware.

Reproduz o servidor web do S7-1200 de forma simplificada:
  - serve os arquivos de web/atlas/ em /awp/atlas/
  - substitui as leituras AWP  :="WebAtlas".tag:  pelos valores simulados
  - aceita POST em cmd.html somente para as variaveis declaradas com
    AWP_In_Variable (igual ao CLP)
  - executa a mesma logica do FB_AtlasCmd (pulso, bloqueio, rejeicoes,
    confirmacao pelo retorno de estado)

Uso:
    python3 tools/mock_plc.py [--porta 8080] [--sem-retorno] [--chave-local]
Depois abra:  http://localhost:8080/awp/atlas/index.html

Somente biblioteca padrao do Python 3.
"""
import argparse
import datetime as dt
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ_WEB = Path(__file__).resolve().parent.parent / "web" / "atlas"
PREFIXO_URL = "/awp/atlas/"
RE_LEITURA = re.compile(r':="WebAtlas"\.(\w+):')
RE_ENTRADA = re.compile(r"""<!--\s*AWP_In_Variable\s+Name='"WebAtlas"\.(\w+)'\s*-->""")
TIPOS = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml"}


class CLPSimulado:
    """Espelha UDT_WebAtlas + FB_AtlasCmd."""

    def __init__(self, usa_retorno: bool, usa_chave: bool, chave_remoto: bool):
        self.lock = threading.Lock()
        self.db = {
            "reqLigar": 0, "reqDesligar": 0, "reqReconhecer": 0,
            "cfgPulso_ms": 1000, "cfgBloqueio_ms": 5000, "cfgConfirmacao_ms": 30000,
            "cfgUsaRetorno": int(usa_retorno), "cfgUsaChaveRemoto": int(usa_chave),
            "estado": 0, "motivoRejeicao": 0, "remotoPermitido": 1,
            "saidaLigar": 0, "saidaDesligar": 0, "atlasLigado": 1, "atlasFalha": 0,
            "aguardandoConfirmacao": 0, "alarmeSemConfirmacao": 0, "bloqueioRestante_ms": 0,
            "ultimoComando": 0, "ultAno": 0, "ultMes": 0, "ultDia": 0,
            "ultHora": 0, "ultMin": 0, "ultSeg": 0,
            "contLigar": 0, "contDesligar": 0, "contRejeitados": 0,
            "heartbeat": 0, "versao": "v1.0.0-sim",
        }
        self.chave_remoto = chave_remoto
        self.cmd_atual = 0
        self.t_estado = 0.0
        self.t_aguardo = 0.0
        self.t_retorno = None      # instante em que o "Atlas" muda de estado
        self.historico_saidas = [] # (instante, ligar, desligar) p/ verificacao

    @staticmethod
    def _limitar(v, mn, mx):
        return max(mn, min(mx, v))

    def ciclo(self):
        with self.lock:
            d = self.db
            agora = time.monotonic()
            pulso = self._limitar(d["cfgPulso_ms"], 200, 5000) / 1000
            bloqueio = self._limitar(d["cfgBloqueio_ms"], 1000, 60000) / 1000
            confirmacao = self._limitar(d["cfgConfirmacao_ms"], 5000, 600000) / 1000

            # "Atlas" simulado responde 2 s apos o pulso
            if self.t_retorno is not None and agora >= self.t_retorno:
                d["atlasLigado"] = 1 if self.cmd_atual == 1 else 0
                self.t_retorno = None

            d["remotoPermitido"] = int((not d["cfgUsaChaveRemoto"]) or self.chave_remoto)
            d["heartbeat"] = 0 if d["heartbeat"] >= 2_000_000_000 else d["heartbeat"] + 1

            p_lig, p_des, p_rec = d["reqLigar"], d["reqDesligar"], d["reqReconhecer"]
            d["reqLigar"] = d["reqDesligar"] = d["reqReconhecer"] = 0
            ha_pedido = bool(p_lig or p_des)
            estado = d["estado"]

            if estado == 0:
                if ha_pedido:
                    if p_lig and p_des:
                        d["motivoRejeicao"] = 3; d["contRejeitados"] += 1
                    elif not d["remotoPermitido"]:
                        d["motivoRejeicao"] = 2; d["contRejeitados"] += 1
                    else:
                        self.cmd_atual = 1 if p_lig else 2
                        estado = self.cmd_atual
                        d["contLigar" if p_lig else "contDesligar"] += 1
                        d["ultimoComando"] = self.cmd_atual
                        d["motivoRejeicao"] = 0
                        d["alarmeSemConfirmacao"] = 0
                        d["aguardandoConfirmacao"] = d["cfgUsaRetorno"]
                        self.t_aguardo = agora
                        n = dt.datetime.now()
                        d.update(ultAno=n.year, ultMes=n.month, ultDia=n.day,
                                 ultHora=n.hour, ultMin=n.minute, ultSeg=n.second)
                        self.t_estado = agora
            elif estado in (1, 2):
                if ha_pedido:
                    d["motivoRejeicao"] = 1; d["contRejeitados"] += 1
                if agora - self.t_estado >= pulso:
                    estado = 3
                    self.t_estado = agora
                    if d["cfgUsaRetorno"]:
                        self.t_retorno = agora + 2.0
            elif estado == 3:
                if ha_pedido:
                    d["motivoRejeicao"] = 1; d["contRejeitados"] += 1
                if agora - self.t_estado >= bloqueio:
                    estado = 0
            else:
                estado = 0

            if d["aguardandoConfirmacao"]:
                if (self.cmd_atual == 1 and d["atlasLigado"]) or (self.cmd_atual == 2 and not d["atlasLigado"]):
                    d["aguardandoConfirmacao"] = 0
                elif agora - self.t_aguardo >= confirmacao:
                    d["alarmeSemConfirmacao"] = 1
                    d["aguardandoConfirmacao"] = 0
            if p_rec:
                d["alarmeSemConfirmacao"] = 0

            lig, des = int(estado == 1), int(estado == 2)
            if lig and des:  # intertravamento (nunca deve ocorrer)
                lig = des = 0; estado = 0
            d["saidaLigar"], d["saidaDesligar"], d["estado"] = lig, des, estado
            d["bloqueioRestante_ms"] = (max(0, int((bloqueio - (agora - self.t_estado)) * 1000))
                                        if estado == 3 else 0)
            self.historico_saidas.append((agora, lig, des))
            self.historico_saidas = self.historico_saidas[-5000:]

    def ler(self, nome):
        with self.lock:
            return self.db.get(nome, "")

    def gravar(self, nome, valor):
        with self.lock:
            atual = self.db[nome]
            self.db[nome] = int(valor) if isinstance(atual, int) else valor


def criar_handler(clp: CLPSimulado, verbose: bool):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            if verbose:
                super().log_message(fmt, *args)

        def _arquivo(self):
            caminho = urllib.parse.urlparse(self.path).path
            if caminho in ("/", "/awp/atlas", PREFIXO_URL):
                caminho = PREFIXO_URL + "index.html"
            if not caminho.startswith(PREFIXO_URL):
                return None
            alvo = (RAIZ_WEB / caminho[len(PREFIXO_URL):]).resolve()
            if RAIZ_WEB not in alvo.parents or not alvo.is_file():
                return None
            return alvo

        def _responder(self, alvo: Path):
            dados = alvo.read_bytes()
            if alvo.suffix == ".html":
                texto = dados.decode("utf-8")
                texto = RE_LEITURA.sub(lambda m: str(clp.ler(m.group(1))), texto)
                dados = texto.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", TIPOS.get(alvo.suffix, "application/octet-stream"))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def do_GET(self):
            if self.path.startswith("/Portal/"):
                corpo = "<p>Simulador: login do CLP nao e necessario.</p>".encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(corpo)
                return
            alvo = self._arquivo()
            if not alvo:
                self.send_error(404)
                return
            self._responder(alvo)

        def do_POST(self):
            alvo = self._arquivo()
            if not alvo or alvo.suffix != ".html":
                self.send_error(404)
                return
            tam = int(self.headers.get("Content-Length", 0))
            corpo = self.rfile.read(tam).decode("utf-8")
            permitidas = set(RE_ENTRADA.findall(alvo.read_text("utf-8")))
            for chave, valor in urllib.parse.parse_qsl(corpo):
                m = re.fullmatch(r'"WebAtlas"\.(\w+)', chave)
                if m and m.group(1) in permitidas:
                    clp.gravar(m.group(1), valor)
                    print(f"[POST] {m.group(1)} = {valor}")
                else:
                    print(f"[POST] IGNORADO (nao declarado com AWP_In_Variable): {chave}")
            self._responder(alvo)

    return Handler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--porta", type=int, default=8080)
    ap.add_argument("--sem-retorno", action="store_true", help="simula Atlas sem retorno de estado cabeado")
    ap.add_argument("--chave-local", action="store_true", help="simula chave Local/Remoto em LOCAL")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    clp = CLPSimulado(usa_retorno=not a.sem_retorno, usa_chave=a.chave_local, chave_remoto=not a.chave_local)

    def varredura():
        while True:
            clp.ciclo()
            time.sleep(0.01)  # ~10 ms de ciclo

    threading.Thread(target=varredura, daemon=True).start()
    srv = ThreadingHTTPServer(("0.0.0.0", a.porta), criar_handler(clp, a.verbose))
    print(f"Simulador do CLP em http://localhost:{a.porta}{PREFIXO_URL}index.html  (Ctrl+C para sair)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
