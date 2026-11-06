# Registro de Alterações (Changelog)

Todas as alterações relevantes deste projeto serão documentadas neste arquivo.

O formato baseia-se em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [7.3.0] - 2026-11-06

### Adicionado
- Atualização automática da cota da conta em uso a cada 30 segundos no HUD, no popup e no alarme de segundo plano compatível.
- Indicadores por conta para redefinições disponíveis, créditos e disponibilidade de convite ou bônus quando informados pela plataforma.

### Corrigido
- Persistência da sessão ativa após a renovação do token e dos cookies de autenticação.
- Preservação de cookies de sessão sem convertê-los em cookies persistentes artificiais.
- Concorrência entre atualizações simultâneas de cotas, que podia produzir estado desatualizado.

### Alterado
- Ação manual de sincronização agora é identificada claramente como **Atualizar** e mostra quando ocorreu a última atualização.

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
