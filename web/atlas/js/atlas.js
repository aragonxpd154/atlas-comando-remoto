/*
 * Atlas Comando Remoto - logica da pagina
 * Servida pelo servidor web do S7-1200 (paginas definidas pelo usuario).
 *
 *  - Le o estado em status.html (JSON gerado com tags AWP) a cada 1 s.
 *  - Envia comandos por POST em cmd.html (variaveis AWP_In_Variable).
 *  - Confirma cada comando por um dialogo com tempo limite.
 *  - Verifica se o CLP realmente aceitou o comando (contadores).
 *  - Modo demonstracao (sem CLP): abrir o arquivo localmente ou usar ?demo=1.
 */
(function () {
  "use strict";

  var CFG = {
    urlStatus: "status.html",
    urlCmd: "cmd.html",
    db: '"WebAtlas".',          // prefixo das tags no POST
    intervalo: 1000,            // leitura de estado (ms)
    falhasParaOffline: 3,       // leituras falhas seguidas -> offline
    ciclosHeartbeat: 5,         // leituras sem heartbeat mudar -> CLP parado
    prazoVerificacao: 4000,     // tempo para o CLP aceitar/rejeitar (ms)
    prazoConfirmacao: 10000     // tempo do dialogo de confirmacao (ms)
  };

  var DEMO = (window.ATLAS_DEMO === true) ||
             (location.protocol === "file:") ||
             (/[?&]demo=1/.test(location.search));

  var TEXTO_ESTADO = { 0: "Pronto", 1: "Pulso LIGAR", 2: "Pulso DESLIGAR", 3: "Bloqueio" };
  var TEXTO_REJEICAO = {
    1: "CLP ocupado (pulso ou bloqueio em andamento)",
    2: "comando remoto não permitido (chave em LOCAL)",
    3: "LIGAR e DESLIGAR recebidos juntos"
  };
  var TEXTO_CMD = { 0: "—", 1: "LIGAR", 2: "DESLIGAR" };

  // ------------------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var st = null;              // ultimo estado lido
  var falhas = 0;
  var ultHeartbeat = null, ciclosSemHb = 0;
  var enviando = false;
  var pendente = null;        // comando aguardando verificacao
  var timerModal = null;

  function bool(v) { return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true"; }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function hora() { var d = new Date(); return dois(d.getHours()) + ":" + dois(d.getMinutes()) + ":" + dois(d.getSeconds()); }

  function extrairJSON(txt) {
    // A resposta pode trazer comentarios AWP antes do JSON
    var i = txt.indexOf("{"), f = txt.lastIndexOf("}");
    if (i < 0 || f < i) throw new Error("resposta sem JSON");
    return JSON.parse(txt.substring(i, f + 1));
  }

  function normalizar(j) {
    return {
      estado: num(j.estado),
      motivoRejeicao: num(j.motivoRejeicao),
      remotoPermitido: bool(j.remotoPermitido),
      saidaLigar: bool(j.saidaLigar),
      saidaDesligar: bool(j.saidaDesligar),
      atlasLigado: bool(j.atlasLigado),
      atlasFalha: bool(j.atlasFalha),
      aguardandoConfirmacao: bool(j.aguardandoConfirmacao),
      alarmeSemConfirmacao: bool(j.alarmeSemConfirmacao),
      bloqueioRestante: num(j.bloqueioRestante_ms),
      cfgPulso: num(j.cfgPulso_ms),
      cfgBloqueio: num(j.cfgBloqueio_ms),
      cfgUsaRetorno: bool(j.cfgUsaRetorno),
      cfgUsaChaveRemoto: bool(j.cfgUsaChaveRemoto),
      ultimoComando: num(j.ultimoComando),
      ult: [num(j.ultAno), num(j.ultMes), num(j.ultDia), num(j.ultHora), num(j.ultMin), num(j.ultSeg)],
      contLigar: num(j.contLigar),
      contDesligar: num(j.contDesligar),
      contRejeitados: num(j.contRejeitados),
      heartbeat: num(j.heartbeat),
      versao: String(j.versao || "").trim()
    };
  }

  // ------------------------------------------------------------------
  // Comunicacao
  // ------------------------------------------------------------------
  function lerEstado() {
    if (DEMO) { return Promise.resolve(Demo.status()); }
    return fetch(CFG.urlStatus + "?t=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { return normalizar(extrairJSON(t)); });
  }

  function enviar(variavel) {
    if (DEMO) { Demo.comando(variavel); return Promise.resolve(); }
    var corpo = encodeURIComponent(CFG.db + variavel) + "=1";
    return fetch(CFG.urlCmd, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (t) {
      if (t.indexOf('"ack"') < 0) {
        // Normalmente e a pagina de login do CLP -> sessao expirada
        throw new Error("sem autorização (faça login na página do CLP)");
      }
    });
  }

  // ------------------------------------------------------------------
  // Interface
  // ------------------------------------------------------------------
  function selo(texto, classe) {
    var el = $("conexao");
    el.textContent = texto;
    el.className = "selo " + classe;
  }

  function valor(id, texto, classe) {
    var el = $(id);
    el.textContent = texto;
    el.className = "valor " + (classe || "");
  }

  function mensagem(texto, classe) {
    var el = $("msgCmd");
    el.textContent = texto || "";
    el.className = "mensagem " + (classe || "");
  }

  function registrar(texto) {
    var log = $("logLocal");
    var vazio = log.querySelector(".log-vazio");
    if (vazio) log.removeChild(vazio);
    var li = document.createElement("li");
    li.textContent = hora() + " — " + texto;
    log.insertBefore(li, log.firstChild);
    while (log.children.length > 15) log.removeChild(log.lastChild);
  }

  function online() {
    return st !== null && falhas < CFG.falhasParaOffline && ciclosSemHb < CFG.ciclosHeartbeat;
  }

  function atualizarTela() {
    if (!st) return;

    // Conexao
    if (falhas >= CFG.falhasParaOffline) selo("Sem comunicação", "selo-erro");
    else if (ciclosSemHb >= CFG.ciclosHeartbeat) selo("CLP sem varredura", "selo-alerta");
    else selo(DEMO ? "Modo demonstração" : "Online", DEMO ? "selo-alerta" : "selo-ok");

    // Estado do transmissor
    if (!st.cfgUsaRetorno) valor("vAtlas", "Sem retorno", "v-neutro");
    else if (st.atlasLigado) valor("vAtlas", "LIGADO", "v-ok");
    else valor("vAtlas", "DESLIGADO", "v-erro");

    valor("vFalha", st.atlasFalha ? "FALHA" : "Normal", st.atlasFalha ? "v-erro" : "v-ok");

    if (!st.cfgUsaChaveRemoto) valor("vRemoto", "Liberado", "v-ok");
    else valor("vRemoto", st.remotoPermitido ? "Liberado (chave)" : "LOCAL", st.remotoPermitido ? "v-ok" : "v-alerta");

    var tEstado = TEXTO_ESTADO[st.estado] || ("Estado " + st.estado);
    if (st.estado === 3) tEstado += " " + Math.ceil(st.bloqueioRestante / 1000) + " s";
    if (st.aguardandoConfirmacao) tEstado += " · aguardando retorno";
    valor("vEstado", tEstado, st.estado === 0 ? "v-ok" : "v-alerta");

    // LEDs das saidas
    $("ledLigar").className = "bt-led" + (st.saidaLigar ? " aceso" : "");
    $("ledDesligar").className = "bt-led" + (st.saidaDesligar ? " aceso" : "");

    // Botoes
    var livre = online() && st.estado === 0 && st.remotoPermitido && !enviando && !pendente;
    $("btLigar").disabled = !livre;
    $("btDesligar").disabled = !livre;

    // Alarme
    $("caixaAlarme").hidden = !st.alarmeSemConfirmacao;

    // Historico
    var u = st.ult;
    var quando = u[0] > 0 ? (dois(u[2]) + "/" + dois(u[1]) + "/" + u[0] + " " + dois(u[3]) + ":" + dois(u[4]) + ":" + dois(u[5])) : "";
    $("vUltimo").textContent = st.ultimoComando ? (TEXTO_CMD[st.ultimoComando] + (quando ? " · " + quando : "")) : "—";
    $("vContLigar").textContent = st.contLigar;
    $("vContDesligar").textContent = st.contDesligar;
    $("vContRej").textContent = st.contRejeitados;
    $("vTempos").textContent = (st.cfgPulso / 1000).toFixed(1) + " s / " + (st.cfgBloqueio / 1000).toFixed(0) + " s";
    $("vVersao").textContent = st.versao || "—";
  }

  function verificarPendente() {
    if (!pendente || !st) return;
    var p = pendente;
    var decorrido = Date.now() - p.t0;

    if (p.variavel === "reqReconhecer") {
      if (!st.alarmeSemConfirmacao) { mensagem("Alarme reconhecido.", "ok"); registrar("Alarme reconhecido"); pendente = null; }
      else if (decorrido > CFG.prazoVerificacao) { mensagem("O CLP não confirmou o reconhecimento.", "erro"); pendente = null; }
      return;
    }

    var contAgora = p.variavel === "reqLigar" ? st.contLigar : st.contDesligar;
    if (contAgora > p.contAntes) {
      mensagem("Comando " + p.nome + " aceito pelo CLP — pulso enviado.", "ok");
      registrar(p.nome + " aceito");
      pendente = null;
    } else if (st.contRejeitados > p.rejAntes) {
      var motivo = TEXTO_REJEICAO[st.motivoRejeicao] || "motivo " + st.motivoRejeicao;
      mensagem("Comando " + p.nome + " rejeitado: " + motivo + ".", "erro");
      registrar(p.nome + " rejeitado (" + motivo + ")");
      pendente = null;
    } else if (decorrido > CFG.prazoVerificacao) {
      mensagem("O CLP não confirmou o comando " + p.nome + ". Verifique o login e a permissão de escrita.", "erro");
      registrar(p.nome + " sem confirmação do CLP");
      pendente = null;
    }
  }

  // ------------------------------------------------------------------
  // Ciclo de leitura
  // ------------------------------------------------------------------
  function ciclo() {
    lerEstado().then(function (novo) {
      falhas = 0;
      if (ultHeartbeat !== null && novo.heartbeat === ultHeartbeat) ciclosSemHb++;
      else ciclosSemHb = 0;
      ultHeartbeat = novo.heartbeat;
      st = novo;
      verificarPendente();
      atualizarTela();
    }).catch(function () {
      falhas++;
      if (falhas >= CFG.falhasParaOffline) {
        selo("Sem comunicação", "selo-erro");
        $("btLigar").disabled = true;
        $("btDesligar").disabled = true;
      }
    }).then(function () {
      setTimeout(ciclo, CFG.intervalo);
    });
  }

  // ------------------------------------------------------------------
  // Comandos com confirmacao
  // ------------------------------------------------------------------
  function executar(variavel, nome) {
    if (!st) return;
    enviando = true;
    pendente = {
      variavel: variavel, nome: nome, t0: Date.now(),
      contAntes: variavel === "reqLigar" ? st.contLigar : st.contDesligar,
      rejAntes: st.contRejeitados
    };
    mensagem("Enviando " + (nome || "comando") + "…", "");
    atualizarTela();
    enviar(variavel).catch(function (e) {
      pendente = null;
      mensagem("Falha ao enviar: " + e.message + ".", "erro");
      registrar("Falha ao enviar " + (nome || variavel));
    }).then(function () {
      enviando = false;
      atualizarTela();
    });
  }

  function abrirModal(variavel, nome, classe) {
    $("mTexto").innerHTML = "Enviar comando <b>" + nome + "</b> para o transmissor Atlas?";
    var bt = $("mConfirmar");
    bt.textContent = "Confirmar " + nome;
    bt.className = "bt-conf " + classe;
    $("modal").hidden = false;
    $("mCancelar").focus();

    var barra = $("mBarra"), inicio = Date.now();
    clearInterval(timerModal);
    timerModal = setInterval(function () {
      var resto = 1 - (Date.now() - inicio) / CFG.prazoConfirmacao;
      barra.style.width = Math.max(0, resto * 100) + "%";
      if (resto <= 0) { fecharModal(); mensagem("Confirmação expirou — nenhum comando enviado.", ""); }
    }, 100);

    bt.onclick = function () { fecharModal(); executar(variavel, nome); };
  }

  function fecharModal() {
    clearInterval(timerModal);
    $("modal").hidden = true;
    $("mConfirmar").onclick = null;
  }

  $("btLigar").addEventListener("click", function () { abrirModal("reqLigar", "LIGAR", "ligar"); });
  $("btDesligar").addEventListener("click", function () { abrirModal("reqDesligar", "DESLIGAR", "desligar"); });
  $("btReconhecer").addEventListener("click", function () { executar("reqReconhecer", "Reconhecer alarme"); });
  $("mCancelar").addEventListener("click", function () { fecharModal(); mensagem("Comando cancelado.", ""); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) fecharModal(); });

  // ------------------------------------------------------------------
  // Simulacao local (sem CLP) - reproduz a logica do FB_AtlasCmd
  // ------------------------------------------------------------------
  var Demo = !DEMO ? null : (function () {
    var s = {
      estado: 0, motivoRejeicao: 0, remotoPermitido: 1, saidaLigar: 0, saidaDesligar: 0,
      atlasLigado: 1, atlasFalha: 0, aguardandoConfirmacao: 0, alarmeSemConfirmacao: 0,
      bloqueioRestante_ms: 0, cfgPulso_ms: 1000, cfgBloqueio_ms: 5000, cfgUsaRetorno: 1,
      cfgUsaChaveRemoto: 0, ultimoComando: 0, ultAno: 0, ultMes: 0, ultDia: 0, ultHora: 0,
      ultMin: 0, ultSeg: 0, contLigar: 0, contDesligar: 0, contRejeitados: 0, heartbeat: 0,
      versao: "v1.0.0-demo"
    };
    var tEstado = 0;
    function passo() {
      var agora = Date.now();
      s.heartbeat++;
      if (s.estado === 1 || s.estado === 2) {
        s.saidaLigar = s.estado === 1 ? 1 : 0; s.saidaDesligar = s.estado === 2 ? 1 : 0;
        if (agora - tEstado >= s.cfgPulso_ms) {
          if (s.estado === 1) setTimeout(function () { s.atlasLigado = 1; s.aguardandoConfirmacao = 0; }, 2000);
          else setTimeout(function () { s.atlasLigado = 0; s.aguardandoConfirmacao = 0; }, 2000);
          s.estado = 3; tEstado = agora;
        }
      } else { s.saidaLigar = 0; s.saidaDesligar = 0; }
      if (s.estado === 3) {
        s.bloqueioRestante_ms = Math.max(0, s.cfgBloqueio_ms - (agora - tEstado));
        if (s.bloqueioRestante_ms === 0) s.estado = 0;
      } else s.bloqueioRestante_ms = 0;
    }
    setInterval(passo, 100);
    return {
      status: function () { return normalizar(s); },
      comando: function (v) {
        if (v === "reqReconhecer") { s.alarmeSemConfirmacao = 0; return; }
        if (s.estado !== 0) { s.motivoRejeicao = 1; s.contRejeitados++; return; }
        var d = new Date();
        s.estado = v === "reqLigar" ? 1 : 2; tEstado = Date.now();
        s.ultimoComando = s.estado; s.motivoRejeicao = 0; s.aguardandoConfirmacao = 1;
        if (v === "reqLigar") s.contLigar++; else s.contDesligar++;
        s.ultAno = d.getFullYear(); s.ultMes = d.getMonth() + 1; s.ultDia = d.getDate();
        s.ultHora = d.getHours(); s.ultMin = d.getMinutes(); s.ultSeg = d.getSeconds();
      }
    };
  })();

  ciclo();
})();
