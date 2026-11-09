# Roteiro de testes e comissionamento

Registre data, responsável e resultado de cada item. **As etapas A e B são feitas com o conector do Atlas DESCONECTADO.**

Data: ____/____/______  Responsável: ______________________  CLP (IP): ______________

## A. Bancada: CLP sem o Atlas

| # | Teste | Procedimento | Esperado | OK |
|---|---|---|---|---|
| A1 | Acesso | Abrir `https://IP/awp/atlas/index.html` sem login | Página não acessível, ou sem permissão de comando | ☐ |
| A2 | Login | Logar como `operador_atlas` e abrir a página | Selo **Online**, CLP **Pronto** | ☐ |
| A3 | Pulso LIGAR | Multímetro em continuidade entre DQ a.0 e 1L. Clicar LIGAR e confirmar | Continuidade por ≈ `cfgPulso_ms`, LED Q0.0 aceso na tela e na CPU | ☐ |
| A4 | Pulso DESLIGAR | Multímetro entre DQ a.1 e 1L. Clicar DESLIGAR e confirmar | Continuidade por ≈ `cfgPulso_ms` | ☐ |
| A5 | Intertravamento | Durante o pulso de A3, medir entre DQ a.1 e 1L | **Sem** continuidade | ☐ |
| A6 | Bloqueio | Logo após um comando, tentar outro | Botões desabilitados. Pela 2ª aba do navegador: "rejeitado: CLP ocupado" | ☐ |
| A7 | Cancelar | Clicar LIGAR e depois Cancelar | Nenhum pulso, mensagem "Comando cancelado" | ☐ |
| A8 | Confirmação expira | Clicar LIGAR e aguardar 10 s | Diálogo fecha, nenhum pulso | ☐ |
| A9 | Partida segura | Desligar e religar a alimentação do CLP | Nenhuma saída pulsa na partida | ☐ |
| A10 | Perda de rede | Retirar o cabo de rede do PC | Selo "Sem comunicação" e botões desabilitados em até 3 s | ☐ |
| A11 | Sessão | Fazer logout e tentar um comando | Mensagem de falha ou "não confirmou", e nenhum pulso | ☐ |
| A12 | Histórico | Conferir data, hora e contadores | Data e hora corretas (NTP), contadores coerentes | ☐ |

## B. Entradas opcionais (se cabeadas)

| # | Teste | Procedimento | Esperado | OK |
|---|---|---|---|---|
| B1 | Retorno | Com `cfgUsaRetorno` = TRUE, simular I0.0 com jumper de 24 V | Transmissor LIGADO ou DESLIGADO conforme o jumper | ☐ |
| B2 | Alarme de confirmação | Enviar LIGAR sem mudar I0.0 | Depois de `cfgConfirmacao_ms`, aparece o alarme. "Reconhecer" limpa | ☐ |
| B3 | Chave LOCAL | Com `cfgUsaChaveRemoto` = TRUE e I0.2 = 0 | Remoto mostra LOCAL, botões desabilitados e comandos rejeitados | ☐ |
| B4 | Falha | Simular I0.1 | Falha mostra **FALHA** | ☐ |

## C. Integração com o Atlas (janela de manutenção autorizada)

Antes de começar:
- [ ] Janela autorizada pela chefia, e operação e emissoras avisadas.
- [ ] Pinagem conferida no manual do Atlas: ON, OFF e GND.
- [ ] Tensão de circuito aberto e corrente da entrada remota medidas: ______ V / ______ mA.
- [ ] Transmissor reserva e procedimento de retorno manual disponíveis.

| # | Teste | Procedimento | Esperado | OK |
|---|---|---|---|---|
| C1 | DESLIGAR | Com o Atlas em operação, enviar DESLIGAR | Atlas desliga. Retorno (se houver) mostra DESLIGADO | ☐ |
| C2 | LIGAR | Enviar LIGAR | Atlas liga e volta ao ar. Retorno mostra LIGADO | ☐ |
| C3 | Repetição | Repetir C1 e C2 mais 2 vezes | Funcionamento consistente | ☐ |
| C4 | Tempo de pulso | Se algum comando falhar, aumentar `cfgPulso_ms` | Comando confiável com o menor pulso possível | ☐ |

Observações:

______________________________________________________________________

______________________________________________________________________

Assinatura: _______________________________
