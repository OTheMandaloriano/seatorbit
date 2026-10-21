# Registro de Alterações (Changelog)

Todas as alterações relevantes deste projeto serão documentadas neste arquivo.

O formato baseia-se em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [7.2.0] - 2026-10-20

### Adicionado
- Gerenciamento de múltiplas contas e perfis de workspace para ChatGPT no Google Chrome.
- Alternância de contas com um clique por meio da API de cookies nativa do Manifest V3.
- Monitoramento de cotas em tempo real com leitura de janelas de 5 horas e 7 dias.
- Piloto automático de rotação com alternância autônoma ao atingir o limite de mensagens.
- Notificações toast com barra de expiração regressiva e aviso de renovação iminente de cota.
- Sistema de sintetizador sonoro via Web Audio API na API Offscreen com quatro temas nativos e suporte a upload de áudios customizados.
- HUD flutuante injetado no canto inferior direito do ChatGPT para alternância direta durante conversas.
- Interface visual estruturada com o sistema de design Midnight Precision.

### Segurança
- Isolamento total de credenciais na máquina local via `chrome.storage.local`.
- Zero envio de telemetria ou dados de sessão para servidores externos.
