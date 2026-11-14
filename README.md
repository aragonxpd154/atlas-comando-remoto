# Atlas Comando Remoto

**▶ Demonstração da tela (modo simulado):** https://aragonxpd154.github.io/atlas-comando-remoto/

Interface web para **ligar e desligar o transmissor Harris Atlas** por contato seco, usando um CLP **Siemens S7-1200 CPU 1214C DC/DC/RLY** (`6ES7214-1HG40-0XB0`). A página web roda no próprio servidor web do CLP, sem PC ou servidor intermediário.


## Funcionalidades

- Dois comandos, **LIGAR** (Q0.0) e **DESLIGAR** (Q0.1), por **pulso de relé** com duração fixa (padrão: 1 s).
- **Intertravamento**: as duas saídas nunca ficam ativas ao mesmo tempo.
- **Bloqueio pós-comando** (padrão: 5 s), que evita duplo clique e comandos repetidos.
- **Confirmação na tela** antes de cada comando, com tempo limite de 10 s.
- **Verificação de aceitação**: a página confere nos contadores do CLP se o comando foi aceito ou rejeitado, e mostra o motivo.
- **Retorno de estado opcional** (I0.0 = Atlas ligado), com alarme se o transmissor não confirmar o comando no prazo.
- **Chave Local/Remoto opcional** (I0.2), que bloqueia o comando remoto durante a manutenção local.
- **Histórico**: último comando com data e hora, contadores de LIGAR, DESLIGAR e rejeitados.
- **Detecção de comunicação**: indica "sem comunicação" e "CLP sem varredura" (por heartbeat).
- Pela web, só os pedidos de comando podem ser gravados. Parâmetros e contadores ficam protegidos contra escrita.
- **Simulador local** (`tools/mock_plc.py`) para testar a página no Linux, sem CLP.

## Estrutura do repositório

```
atlas-comando-remoto/
├── plc/
│   ├── fontes/
│   │   ├── 01_UDT_DB_WebAtlas.scl   # UDT + DB de troca com a web (não otimizado)
│   │   ├── 02_FB_AtlasCmd.scl       # lógica: pulso, bloqueio, intertravamento
│   │   └── 03_OB1_Main.scl          # OB1: WWW (servidor web) + chamada do FB
│   └── tags_plc.xlsx                # tabela de tags para importar no TIA
├── web/atlas/                       # páginas definidas pelo usuário (pasta HTML)
│   ├── index.html                   # tela de operação
│   ├── status.html                  # estado em JSON (leituras AWP)
│   ├── cmd.html                     # endpoint de comando (AWP_In_Variable)
│   ├── css/atlas.css
│   └── js/atlas.js
├── tools/mock_plc.py                # simulador do CLP + servidor web
├── docs/
│   ├── ESCOPO.md                    # escopo, requisitos e critérios de aceite
│   ├── LIGACAO.md                   # tabela de I/O e esquema de ligação
│   ├── CONFIGURACAO_TIA.md          # passo a passo no TIA Portal V21
│   ├── TESTES.md                    # roteiro de comissionamento
│   └── preview.html                 # demonstração da tela (abre no navegador)
├── CHANGELOG.md
└── README.md
```

## Início rápido

### 1. Testar a página sem CLP (Linux, Windows ou macOS)

```bash
python3 tools/mock_plc.py
# abra http://localhost:8080/awp/atlas/index.html
```

Opções: `--sem-retorno` simula o Atlas sem retorno de estado cabeado, e `--chave-local` simula a chave em LOCAL. Se quiser só ver a tela, abra `docs/preview.html` direto no navegador.

### 2. Programar o CLP

O passo a passo completo está em [`docs/CONFIGURACAO_TIA.md`](docs/CONFIGURACAO_TIA.md). Em resumo:

1. Crie o projeto no TIA Portal V21 com a CPU `6ES7214-1HG40-0XB0`.
2. Importe a tabela de tags `plc/tags_plc.xlsx`.
3. Importe e gere os blocos a partir de `01_…scl` e depois de `02_…scl`.
4. Configure o servidor web: HTTPS, usuários e páginas definidas pelo usuário apontando para `web/atlas`. Depois gere os blocos do servidor web (DB333).
5. Importe `03_OB1_Main.scl`, compile e faça o download.
6. Acesse `https://<IP-do-CLP>/awp/atlas/index.html`.

### 3. Comissionar

Siga o roteiro de [`docs/TESTES.md`](docs/TESTES.md). **Teste as saídas com multímetro antes de ligar o cabo no Atlas.**

## Mapa de I/O

| Endereço | Tag | Função | Obrigatório |
|---|---|---|---|
| Q0.0 | `DQ_Atlas_Ligar` | Relé de comando LIGAR (fecha para GND) | Sim |
| Q0.1 | `DQ_Atlas_Desligar` | Relé de comando DESLIGAR (fecha para GND) | Sim |
| I0.0 | `DI_Atlas_Ligado` | Retorno: Atlas ligado / em ar | Não (`cfgUsaRetorno`) |
| I0.1 | `DI_Atlas_Falha` | Retorno: falha sumária | Não |
| I0.2 | `DI_Chave_Remoto` | Chave Local/Remoto (1 = remoto) | Não (`cfgUsaChaveRemoto`) |

O esquema de ligação e os cuidados com o comum dos relés estão em [`docs/LIGACAO.md`](docs/LIGACAO.md).

## Parâmetros

Os parâmetros ficam no DB `WebAtlas` e só podem ser alterados pelo TIA Portal. Pela web, eles são somente leitura.

| Parâmetro | Padrão | Faixa aceita pelo FB |
|---|---|---|
| `cfgPulso_ms` | 1000 | 200 a 5000 ms |
| `cfgBloqueio_ms` | 5000 | 1000 a 60000 ms |
| `cfgConfirmacao_ms` | 30000 | 5000 a 600000 ms |
| `cfgUsaRetorno` | FALSE | TRUE se I0.0 estiver cabeada |
| `cfgUsaChaveRemoto` | FALSE | TRUE se I0.2 estiver cabeada |

> Confirme no manual do Atlas se a entrada de controle remoto aceita comando por **pulso** e qual o tempo mínimo de fechamento. Ajuste `cfgPulso_ms` conforme o manual.

## Segurança

- Deixe o CLP **somente na VLAN de gerência**, nunca exposto à internet.
- Ative **acesso somente por HTTPS** no servidor web.
- Crie um usuário de operação com senha forte. O usuário "Everybody" (anônimo) não deve ter nenhum direito.
- A gravação pela web fica limitada às variáveis declaradas com `AWP_In_Variable` em `cmd.html` (`reqLigar`, `reqDesligar` e `reqReconhecer`).
- O CLP zera os pedidos no mesmo ciclo em que os lê, e descarta pedidos pendentes na partida.



Autor: **Marcos Santos** · Transmissão - Rede Gazeta
