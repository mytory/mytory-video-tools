# Mytory Video Tools

> **🇬🇧 English:** [README.md](./README.md) · **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇯🇵 日本語:** [README.ja.md](./README.ja.md) · **🇨🇳 简体中文:** [README.zh-cn.md](./README.zh-cn.md) · **🇪🇸 Español:** [README.es.md](./README.es.md) · **🇫🇷 Français:** [README.fr.md](./README.fr.md) · **🇮🇩 Bahasa Indonesia:** [README.id.md](./README.id.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** é um aplicativo de desktop multiplataforma (Windows, macOS, Linux) para codificação de vídeo de alta velocidade e várias tarefas de manipulação de mídia. É construído com Electron e vem com binários FFmpeg/FFprobe integrados.

---

## 1. Recursos

1. **Navegação por abas na barra lateral**: Alterne entre 7 utilitários de mídia principais em um painel elegante com tema escuro.
2. **Política de saída flexível**: Por padrão, os arquivos são salvos junto ao original com um sufixo específico da tarefa. Pastas de saída personalizadas também podem ser configuradas.
3. **Detecção automática de aceleração de hardware**: Na inicialização, o aplicativo escaneia sua GPU e seleciona o codificador de hardware ideal para sua plataforma (Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QSV, AMD AMF, etc.).

### 7 Ferramentas Principais

| Ferramenta | Descrição |
|---|---|
| ⚡ **Mudança de velocidade** | Altera a velocidade de reprodução do vídeo (0,5x ~ 4,0x) com preservação de tom (antiesquilo). Suporta H.264, H.265/HEVC, VP9, AV1. |
| 🎵 **Extração de áudio** | Extrai faixas de áudio sem perdas (Automático) ou converte para MP3, AAC, OGG ou WAV. |
| 📸 **Captura de quadros** | Captura de quadro único, extração em lote em intervalos e detecção automática de cenas com controle de sensibilidade. |
| 🔄 **Remuxer** | Conversão rápida de formato de contêiner (MP4, MKV, MOV) sem recodificação. |
| 🔗 **Juntar vídeos** | Concatena sem perdas vários arquivos de vídeo com parâmetros de codificação idênticos. Perfeito para remontar segmentos divididos. |
| ✂️ **Divisor de vídeo** | Corta um segmento sem perdas definindo pontos de início e fim. Extremamente rápido. |
| 📦 **Compressor** | Comprime vídeo para um tamanho de arquivo alvo com várias opções de codec e qualidade. |

> **🖱️ Arrastar e soltar global**: Arraste arquivos para qualquer lugar na janela do aplicativo para adicioná-los instantaneamente à ferramenta ativa no momento.

---

## 2. 🚀 Usuários finais: Instalação e execução

Se você quiser apenas usar o aplicativo sem compilá-lo, siga as etapas abaixo.

### Download
*   Visite a página de [GitHub Releases](https://github.com/mytory/mytory-video-tools/releases) e baixe o pacote para seu sistema operacional.
    *   **Windows:** `.exe` (instalador)
    *   **macOS:** `.dmg` (imagem de disco) — Intel (x64) / Apple Silicon (arm64)
    *   **Linux:** `.AppImage` (portátil)

### ⚠️ Aviso de segurança (Leia por favor)
Este programa é distribuído por um desenvolvedor individual e não possui assinatura com certificado de código pago. O aviso de segurança que você pode ver **não é um defeito**. Siga as instruções abaixo para executar o aplicativo.

*   **Windows:** No aviso vermelho do SmartScreen, clique em **[Mais informações]** → **[Executar assim mesmo]**
*   **macOS:** **Clique com o botão direito (ou Control+clique)** no arquivo do aplicativo → Selecione **[Abrir]** → Clique em **[Abrir]** novamente

---

## 3. 🛠 Desenvolvedores: Compilação a partir do código fonte

Instruções para configurar um ambiente de desenvolvimento e compilar o projeto.

### Pré-requisitos
[Node.js](https://nodejs.org/) deve estar instalado em seu sistema.

### Instalar dependências
```bash
npm install
```

### Executar em modo de desenvolvimento
```bash
npm start
```

### Compilar para distribuição
```bash
# Cria pacotes distribuíveis na pasta dist/
npm run dist
```

### Notas sobre assinatura de código macOS / compilação CI

* `npm run dist` carrega variáveis de ambiente do `.env` via `dotenv`.
* A identidade de assinatura do macOS é lida da variável `CSC_NAME` no `.env`. Esta variável especifica o nome de um certificado instalado em seu chaveiro local do macOS.
* Exemplo de `.env`:
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `CSC_LINK` / `CSC_KEY_PASSWORD` no `.github/workflows/release.yml` são usados para assinatura baseada em P12 em ambientes GitHub Actions.

---

## 4. Estrutura de diretórios

```text
.
├── package.json          # Pacote npm e configuração de compilação
├── main.js               # Processo principal do Electron
├── preload.js            # Script de pré-carregamento de isolamento de contexto
├── .github/workflows/   # Fluxos de trabalho CI/CD do GitHub Actions
├── README.md             # Documentação do projeto (Inglês)
├── README.ko.md          # Documentação do projeto (Coreano)
├── README.ja.md          # Documentação do projeto (Japonês)
├── README.zh-cn.md       # Documentação do projeto (Chinês)
├── README.es.md          # Documentação do projeto (Espanhol)
├── README.pt.md          # Documentação do projeto (Português)
├── README.fr.md          # Documentação do projeto (Francês)
├── README.id.md          # Documentação do projeto (Indonésio)
├── README.hi.md          # Documentação do projeto (Hindi)
└── renderer/             # Processo renderizador (recursos frontend)
```

---

## 5. Licenças de código aberto

Este aplicativo utiliza os seguintes projetos de código aberto e cumpre os termos de suas respectivas licenças.

*   **[Electron](https://www.electronjs.org/)** (Licença MIT): Framework de aplicativo de desktop
*   **[FFmpeg](https://ffmpeg.org/)** (Licença LGPL/GPL): Mecanismo de processamento multimídia
    *   Este aplicativo inclui FFmpeg via `ffmpeg-static`. O código fonte do FFmpeg está disponível no site oficial.
*   **[Pico.css](https://picocss.com/)** (Licença MIT): Framework CSS mínimo para estilização de interface
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (Licença MIT): Provedores de binários FFmpeg/FFprobe

---

## 6. Licença

Copyright (c) 2026 mytory. Este projeto está licenciado sob a **ISC License**. Consulte o arquivo [LICENSE](./LICENSE) para obter detalhes.

---

## 7. Contato

Para perguntas, relatórios de bugs ou sugestões de recursos, entre em contato através de:

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub:** [@mytory](https://github.com/mytory)
