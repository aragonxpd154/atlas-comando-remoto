# Escopo: Atlas Comando Remoto

## 1. Objetivo

Permitir que a equipe de transmissão **ligue e desligue o transmissor Harris Atlas** remotamente, por uma página web servida pelo próprio CLP. O comando é feito por contato seco (relé fechando para GND) na interface de controle remoto do transmissor.

## 2. Escopo incluído

- CLP Siemens S7-1200 CPU 1214C DC/DC/RLY dedicado ao comando do Atlas.
- Duas saídas a relé: Q0.0 = LIGAR e Q0.1 = DESLIGAR.
- Página web própria (páginas definidas pelo usuário do S7-1200), com:
  - botões LIGAR e DESLIGAR, com confirmação;
  - estado do CLP, das saídas e, opcionalmente, do transmissor;
  - histórico do último comando e contadores.
- Lógica de segurança no CLP: pulso com tempo fixo, intertravamento, bloqueio pós-comando, rejeição de pedidos simultâneos e descarte de pedidos na partida.
- Entradas opcionais: retorno de estado do Atlas, falha sumária e chave Local/Remoto.
- Documentação: ligação, configuração no TIA Portal e roteiro de testes.
- Simulador para desenvolvimento e treinamento sem hardware.

## 3. Fora do escopo (v1)

- Comutação **automática** para o reserva. A decisão de ligar ou desligar é sempre humana.
- Integração SNMP com o Firon ou o Zabbix. Fica para uma versão futura: o JSON de `status.html` já pode ser lido por um coletor autenticado.
- Registro de eventos persistente (log com histórico longo).
- Acesso pela internet ou VPN. O uso previsto é somente na VLAN de gerência.

## 4. Requisitos funcionais

| ID | Requisito |
|---|---|
| RF01 | Ao confirmar LIGAR na página, o CLP fecha Q0.0 por `cfgPulso_ms` e depois abre. |
| RF02 | Ao confirmar DESLIGAR na página, o CLP fecha Q0.1 por `cfgPulso_ms` e depois abre. |
| RF03 | Q0.0 e Q0.1 nunca ficam fechadas ao mesmo tempo. |
| RF04 | Depois de cada comando, novos pedidos ficam bloqueados por `cfgBloqueio_ms` e são registrados como rejeitados. |
| RF05 | Pedidos LIGAR e DESLIGAR recebidos juntos são rejeitados (motivo 3). |
| RF06 | Com `cfgUsaChaveRemoto` = TRUE e a chave em LOCAL, o comando remoto é rejeitado (motivo 2). |
| RF07 | Toda ação exige confirmação na tela. A confirmação expira em 10 s. |
| RF08 | A página informa se o comando foi aceito, rejeitado (com o motivo) ou não confirmado pelo CLP. |
| RF09 | Com `cfgUsaRetorno` = TRUE, a página mostra LIGADO ou DESLIGADO e gera alarme se o retorno não confirmar o comando em `cfgConfirmacao_ms`. |
| RF10 | A página mostra a data e a hora do último comando aceito e os contadores. |
| RF11 | A página indica perda de comunicação e CLP sem varredura. |
| RF12 | Na partida do CLP, nenhum comando pendente é executado. |

## 5. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Acesso somente por HTTPS, com usuário e senha. O usuário anônimo não tem direitos. |
| RNF02 | Pela web, só os pedidos de comando são graváveis. Parâmetros só mudam pelo TIA Portal. |
| RNF03 | A página funciona em navegador de desktop e de celular, sem dependências externas. |
| RNF04 | A atualização de estado ocorre a cada 1 s. |
| RNF05 | O CLP fica isolado na VLAN de gerência. |

## 6. Critérios de aceite

O sistema é aceito quando todos os testes de [`TESTES.md`](TESTES.md) forem executados com sucesso e registrados, com destaque para:

1. a medição com multímetro, sem o Atlas conectado, mostrando o pulso correto em cada saída;
2. o teste de intertravamento e de bloqueio;
3. o teste real de LIGAR e DESLIGAR no Atlas, em janela de manutenção autorizada.

## 7. Materiais (cotação de referência)

| Item | Código | Preço médio cotado |
|---|---|---|
| CLP Siemens SIMATIC S7-1200, CPU 1214C DC/DC/RLY | 6ES7214-1HG40-0XB0 | R$ 4.500,00 a R$ 5.200,00 |
| SIMATIC STEP 7 Basic V21 (TIA Portal), licença flutuante, download | 6ES7822-0AE25-0YA5 | R$ 3.200,00 a R$ 3.900,00 |
| Fonte 24 V DC para trilho DIN | a definir | — |
| Cabo de controle blindado, bornes e trilho DIN | a definir | — |

**Total estimado (CLP + licença):** R$ 7.700,00 a R$ 9.100,00, sem contar fonte e materiais de instalação.

> Atenção: uma cotação anterior trouxe o código `6ES7214-1AF40-0XB0`, que é a CPU 1214 **FC** (segurança), com saídas a **transistor**. Ela não atende. O código correto é o `6ES7214-1HG40-0XB0`.

## 8. Riscos e premissas

| Risco / premissa | Tratamento |
|---|---|
| A entrada remota do Atlas pode exigir contato mantido em vez de pulso. | Confirmar no manual. Se for mantido, adaptar o FB (versão futura). |
| A tensão ou a corrente da entrada remota pode ser incompatível com os contatos do relé. | Medir antes. Usar relé de interface com contato banhado a ouro para sinais muito fracos. |
| Laço de terra entre equipamentos diferentes. | Q0.0 e Q0.1 compartilham o mesmo comum. Usar só para o Atlas, ou usar relés de interface. |
| Acionamento indevido por terceiros. | HTTPS, usuário e senha, VLAN de gerência, confirmação na tela e bloqueio. |
| Relógio do CLP fora de hora. | Configurar NTP e fuso horário (America/Sao_Paulo, UTC−3). |
