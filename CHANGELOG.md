# Changelog

## [1.0.0] - 2026-11-09

### Adicionado
- Programa do CLP S7-1200 em SCL: `UDT_WebAtlas`, DB `WebAtlas` não otimizado, `FB_AtlasCmd` e OB1 com WWW.
- Comando por pulso de relé em Q0.0 (LIGAR) e Q0.1 (DESLIGAR), com intertravamento e bloqueio pós-comando.
- Entradas opcionais: retorno de estado, falha sumária e chave Local/Remoto.
- Páginas definidas pelo usuário: tela de operação, `status.html` (JSON) e `cmd.html` (AWP_In_Variable).
- Simulador local `tools/mock_plc.py`.
- Documentação: escopo, ligação, configuração no TIA V21 e roteiro de testes.
