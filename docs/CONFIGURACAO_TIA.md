# Configuração no TIA Portal V21

Pré-requisitos:
- TIA Portal V21 com STEP 7 Basic (licença `6ES7822-0AE25-0YA5`), num PC Windows ou numa máquina virtual com placa de rede em modo bridge;
- CPU `6ES7214-1HG40-0XB0`;
- cabo de rede RJ45 comum (a programação é pela porta PROFINET).

> Os nomes dos menus podem variar um pouco conforme a versão do TIA e o firmware da CPU.

## 1. Criar o projeto e a CPU

1. **Create new project**, com o nome `AtlasComandoRemoto`.
2. **Add new device** › Controllers › SIMATIC S7-1200 › CPU › CPU 1214C DC/DC/RLY › `6ES7214-1HG40-0XB0`. Escolha a **versão de firmware igual à da etiqueta da CPU**.
3. Em **Properties › PROFINET interface › Ethernet addresses**, defina o IP, a máscara e o gateway da VLAN de gerência.
4. Em **Properties › Time of day**, defina o fuso **(UTC−03:00) Brasília**, sem horário de verão. Ative a sincronização por **NTP** e informe o servidor NTP da rede.

## 2. Tabela de tags

1. Abra **PLC tags › Show all tags** (ou Default tag table).
2. Clique no ícone **Import** e selecione `plc/tags_plc.xlsx`.
3. Confira as 5 tags: `DI_Atlas_Ligado` (I0.0), `DI_Atlas_Falha` (I0.1), `DI_Chave_Remoto` (I0.2), `DQ_Atlas_Ligar` (Q0.0) e `DQ_Atlas_Desligar` (Q0.1).

Se a importação falhar, crie as tags à mão, com nome, tipo `Bool` e o endereço da tabela.

## 3. Importar o programa (fontes SCL)

1. Em **Program blocks › External source files › Add new external file**, adicione `01_UDT_DB_WebAtlas.scl` e `02_FB_AtlasCmd.scl`.
2. Clique com o botão direito em cada um, **na ordem 01 e depois 02**, e escolha **Generate blocks from source**.
3. Confira os blocos criados:
   - `UDT_WebAtlas` (em PLC data types);
   - `WebAtlas` (DB global). Em Properties › Attributes, a opção **Optimized block access** deve estar **desmarcada**;
   - `FB_AtlasCmd` e o DB de instância `iAtlasCmd`.
4. **Ainda não importe o `03_OB1_Main.scl`.** Ele chama o DB do servidor web, que só existe depois do passo 5.

## 4. Servidor web: segurança

Em **CPU › Properties › Web server › General**:

- marque **Activate web server on this module**;
- marque **Permit access only with HTTPS**.

Usuários: em firmwares mais novos ficam em **Protection & Security › Users and roles**; em mais antigos, em **Web server › User management**.

- crie o usuário `operador_atlas` com senha forte;
- dê a ele as permissões para **abrir as páginas definidas pelo usuário** e **escrever valores de tags**;
- deixe o usuário **Everybody** (anônimo) **sem nenhum direito**.

## 5. Servidor web: páginas definidas pelo usuário

Em **CPU › Properties › Web server › User-defined pages**:

| Campo | Valor |
|---|---|
| HTML directory | pasta `web/atlas` deste repositório (caminho completo no PC) |
| Default HTML page | `index.html` |
| Application name | `atlas` |
| Files with dynamic content | `.htm;.html` |
| Web DB number | `333` |
| Fragment DB start number | `334` |

Clique em **Generate blocks**. Serão criados o DB333 (Web control DB) e os DBs de fragmento a partir do 334.

> **Sempre que alterar qualquer arquivo em `web/atlas`, clique de novo em Generate blocks** e faça o download. As páginas ficam dentro desses DBs, não na pasta.

## 6. OB1

1. Adicione `03_OB1_Main.scl` em External source files e escolha **Generate blocks from source**. Ele substitui o OB1 `Main` do projeto.
2. Se o Web DB number for diferente de 333, ajuste `WWW(CTRL_DB := 333)` no OB1.

## 7. Ajustar os parâmetros

Abra o DB **WebAtlas** e ajuste os **start values** conforme a instalação:

| Variável | Padrão | Quando mudar |
|---|---|---|
| `cfgPulso_ms` | 1000 | Conforme o tempo mínimo de fechamento indicado no manual do Atlas |
| `cfgBloqueio_ms` | 5000 | Se quiser um intervalo maior entre comandos |
| `cfgConfirmacao_ms` | 30000 | Tempo que o Atlas leva para mudar o estado de retorno |
| `cfgUsaRetorno` | FALSE | TRUE com I0.0 cabeada |
| `cfgUsaChaveRemoto` | FALSE | TRUE com I0.2 cabeada |

> O DB é não retentivo: na partida, os valores voltam aos *start values*. Por isso, os parâmetros devem ser ajustados nos start values, e não só em "monitor and modify". Os contadores também voltam a zero quando o CLP é desligado.

## 8. Compilar e carregar

1. Clique com o botão direito na CPU e escolha **Compile › Hardware and software (rebuild all)**. O resultado deve ter 0 erros.
2. **Download to device**, escolhendo a interface de rede do PC.
3. Coloque a CPU em **RUN**.

## 9. Acessar

1. Abra `https://<IP-do-CLP>/` e aceite o certificado (é autoassinado).
2. Faça login com `operador_atlas` no canto superior da página padrão.
3. Abra `https://<IP-do-CLP>/awp/atlas/index.html`, ou pelo menu **User pages**.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| A página mostra o texto `:="WebAtlas"...:` em vez dos valores | Os blocos não foram gerados de novo depois de mudar os arquivos, ou `.html` não está em "Files with dynamic content". |
| Os valores não aparecem ou dão erro de acesso | O DB `WebAtlas` está otimizado. Desmarque **Optimized block access**. |
| "Sem comunicação" na página | O WWW não é chamado no OB1, a sessão expirou ou há problema de rede. |
| "O CLP não confirmou o comando" | O usuário não fez login ou não tem permissão de escrita. |
| A página padrão abre, mas a /awp/atlas não | O Application name é diferente de `atlas`, ou a opção de páginas definidas pelo usuário não foi ativada. |
