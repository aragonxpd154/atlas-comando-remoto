# Ligação elétrica

## Tabela de I/O

| Borne CLP | Endereço | Tag | Ligação no Atlas / campo |
|---|---|---|---|
| DQ a.0 | Q0.0 | `DQ_Atlas_Ligar` | Entrada remota **ON / LIGAR** do Atlas |
| DQ a.1 | Q0.1 | `DQ_Atlas_Desligar` | Entrada remota **OFF / DESLIGAR** do Atlas |
| 1L | — | Comum do grupo de relés 1 | **GND** da interface de controle remoto do Atlas |
| DI a.0 | I0.0 | `DI_Atlas_Ligado` | Saída de estado "ligado / em ar" (opcional) |
| DI a.1 | I0.1 | `DI_Atlas_Falha` | Saída de falha sumária (opcional) |
| DI a.2 | I0.2 | `DI_Chave_Remoto` | Chave Local/Remoto no painel (opcional) |
| L+ / M | — | Alimentação 24 V DC | Fonte 24 V DC em trilho DIN |

> A pinagem do conector de controle remoto do Atlas deve ser tirada do **manual do transmissor**. Este documento não a assume. Confirme três coisas: quais pinos são ON, OFF e GND; a tensão de circuito aberto; e a corrente com o contato fechado.

## Esquema (saídas)

```
      CLP S7-1200 1214C DC/DC/RLY                     Harris Atlas
      ───────────────────────────                     ─────────────────────────────
                                                      Conector de controle remoto
      1L  ●────────────────────────────────────────●  GND
                │
                ├──┤ relé Q0.0 ├──●  DQ a.0 ───────●  Entrada ON  (LIGAR)
                │
                └──┤ relé Q0.1 ├──●  DQ a.1 ───────●  Entrada OFF (DESLIGAR)

      Q0.0 fecha  → entrada ON  vai a GND por cfgPulso_ms → Atlas liga
      Q0.1 fecha  → entrada OFF vai a GND por cfgPulso_ms → Atlas desliga
```

## Esquema (entradas opcionais, 24 V DC, lógica positiva)

```
   +24 V ──┬──[ contato de estado "ligado" do Atlas ]── DI a.0 (I0.0)
           ├──[ contato de falha do Atlas ]──────────── DI a.1 (I0.1)
           └──[ chave Local/Remoto (fechada = REMOTO) ]─ DI a.2 (I0.2)
   0 V (M) ─────────────────────────────────────────── 1M (comum das entradas)
```

Se o Atlas fornecer o estado como contato seco, ligue-o como mostrado acima. Se fornecer um sinal com tensão própria (TTL, por exemplo), use um relé ou um acoplador para isolar e converter para 24 V. Não ligue o sinal TTL direto na entrada de 24 V.

Depois de cabear as entradas, ajuste no DB `WebAtlas`, pelo TIA Portal:

- `cfgUsaRetorno := TRUE`, se I0.0 estiver cabeada;
- `cfgUsaChaveRemoto := TRUE`, se I0.2 estiver cabeada.

## Cuidados

1. **Comum compartilhado.** No 1214C DC/DC/RLY, as saídas a relé ficam em dois grupos, cada um com seu borne comum (1L e 2L). Q0.0 e Q0.1 estão no mesmo grupo, então compartilham o mesmo comum. Isso é ideal aqui, porque as duas vão para o GND do Atlas. Não use as outras saídas do mesmo grupo para equipamentos com terra diferente. Confira a divisão exata dos grupos no manual do sistema S7-1200.
2. **Sinal fraco.** Os relés internos são para cargas de até 2 A. Com sinais de poucos miliamperes, normalmente funcionam bem. Se surgir mau contato com o tempo, use um relé de interface com contato banhado a ouro.
3. **Cabo.** Use cabo blindado, com a blindagem aterrada em um só ponto (lado do CLP), separado dos cabos de potência e de RF.
4. **Identificação.** Identifique os cabos e os bornes (ON, OFF e GND) nos dois lados.
5. **Teste antes de conectar.** Com o conector do Atlas desligado, meça a continuidade entre DQ a.0 e 1L durante o pulso (veja [`TESTES.md`](TESTES.md)).
