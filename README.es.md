# Mytory Video Tools

> **🇬🇧 English:** [README.md](./README.md) · **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇯🇵 日本語:** [README.ja.md](./README.ja.md) · **🇨🇳 简体中文:** [README.zh-cn.md](./README.zh-cn.md) · **🇧🇷 Português:** [README.pt.md](./README.pt.md) · **🇫🇷 Français:** [README.fr.md](./README.fr.md) · **🇮🇩 Bahasa Indonesia:** [README.id.md](./README.id.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** es una aplicación de escritorio multiplataforma (Windows, macOS, Linux) para codificación de video de alta velocidad y diversas tareas de manipulación de medios. Está construida con Electron e incluye archivos binarios FFmpeg/FFprobe integrados.

---

## 1. Características

1. **Navegación por pestañas en la barra lateral**: Cambia entre 6 herramientas multimedia principales en un elegante panel con tema oscuro.
2. **Política de salida flexible**: Por defecto, los archivos se guardan junto al original con un sufijo específico de la tarea. También se pueden configurar carpetas de salida personalizadas.
3. **Detección automática de aceleración por hardware**: Al iniciar, la aplicación escanea tu GPU y selecciona el codificador de hardware óptimo para tu plataforma (Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QSV, AMD AMF, etc.).

### 6 Herramientas Principales

| Herramienta | Descripción |
|---|---|
| ⚡ **Cambiador de velocidad** | Cambia la velocidad de reproducción del video (0.5x ~ 4.0x) con preservación de tono (antichipmunk). Compatible con H.264, H.265/HEVC, VP9, AV1. |
| 🎵 **Extracción de audio** | Extrae pistas de audio sin pérdida (Auto) o convierte a MP3, AAC, OGG o WAV. |
| 📸 **Captura de fotogramas** | Captura de un solo fotograma, extracción por lotes a intervalos y detección automática de escenas con control de sensibilidad. |
| 🔄 **Remuxer** | Conversión rápida de formato de contenedor (MP4, MKV, MOV) sin recodificación. |
| ✂️ **Divisor de video** | Corta un segmento sin pérdidas estableciendo puntos de inicio y fin. Extremadamente rápido. |
| 📦 **Compresor** | Comprime video a un tamaño de archivo objetivo con varias opciones de códec y calidad. |

> **🖱️ Arrastrar y soltar global**: Arrastra archivos a cualquier parte de la ventana de la aplicación para agregarlos instantáneamente a la herramienta activa actual.

---

## 2. 🚀 Usuarios finales: Instalación y ejecución

Si solo quieres usar la aplicación sin compilarla tú mismo, sigue los pasos a continuación.

### Descargar
*   Visita la página de [GitHub Releases](https://github.com/mytory/mytory-video-tools/releases) y descarga el paquete para tu sistema operativo.
    *   **Windows:** `.exe` (instalador)
    *   **macOS:** `.dmg` (imagen de disco) — Intel (x64) / Apple Silicon (arm64)
    *   **Linux:** `.AppImage` (portátil)

### ⚠️ Advertencia de seguridad (Lea esto)
Este programa es distribuido por un desarrollador individual y no está firmado con un certificado de firma de código de pago. La advertencia de seguridad que pueda ver **no es un defecto**. Siga las instrucciones a continuación para ejecutar la aplicación.

*   **Windows:** En la advertencia roja de SmartScreen, haga clic en **[Más información]** → **[Ejecutar de todas formas]**
*   **macOS:** **Haga clic derecho (o Control+clic)** en el archivo de la aplicación → Seleccione **[Abrir]** → Haga clic en **[Abrir]** nuevamente

---

## 3. 🛠 Desarrolladores: Compilación desde el código fuente

Instrucciones para configurar un entorno de desarrollo y compilar el proyecto.

### Requisitos previos
[Node.js](https://nodejs.org/) debe estar instalado en su sistema.

### Instalar dependencias
```bash
npm install
```

### Ejecutar en modo de desarrollo
```bash
npm start
```

### Compilar para distribución
```bash
# Crea paquetes distribuibles en la carpeta dist/
npm run dist
```

### Notas sobre firma de código macOS / compilación CI

* `npm run dist` carga variables de entorno desde `.env` a través de `dotenv`.
* La identidad de firma de macOS se lee de la variable `CSC_NAME` en `.env`. Esta variable especifica el nombre de un certificado instalado en su llavero local de macOS.
* Ejemplo de `.env`:
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `CSC_LINK` / `CSC_KEY_PASSWORD` en `.github/workflows/release.yml` se utilizan para la firma basada en P12 en entornos GitHub Actions.

---

## 4. Estructura de directorios

```text
.
├── package.json          # Paquete npm y configuración de compilación
├── main.js               # Proceso principal de Electron
├── preload.js            # Script de precarga de aislamiento de contexto
├── .github/workflows/   # Flujos de trabajo CI/CD de GitHub Actions
├── README.md             # Documentación del proyecto (Inglés)
├── README.ko.md          # Documentación del proyecto (Coreano)
├── README.ja.md          # Documentación del proyecto (Japonés)
├── README.zh-cn.md       # Documentación del proyecto (Chino)
├── README.es.md          # Documentación del proyecto (Español)
├── README.pt.md          # Documentación del proyecto (Portugués)
├── README.fr.md          # Documentación del proyecto (Francés)
├── README.id.md          # Documentación del proyecto (Indonesio)
├── README.hi.md          # Documentación del proyecto (Hindi)
└── renderer/             # Proceso renderizador (recursos frontend)
```

---

## 5. Licencias de código abierto

Esta aplicación utiliza los siguientes proyectos de código abierto y cumple con los términos de sus respectivas licencias.

*   **[Electron](https://www.electronjs.org/)** (Licencia MIT): Marco de aplicación de escritorio
*   **[FFmpeg](https://ffmpeg.org/)** (Licencia LGPL/GPL): Motor de procesamiento multimedia
    *   Esta aplicación incluye FFmpeg a través de `ffmpeg-static`. El código fuente de FFmpeg está disponible en el sitio web oficial.
*   **[Pico.css](https://picocss.com/)** (Licencia MIT): Marco CSS mínimo para el estilo de la interfaz de usuario
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (Licencia MIT): Proveedores de binarios FFmpeg/FFprobe

---

## 6. Licencia

Copyright (c) 2026 mytory. Este proyecto está licenciado bajo **ISC License**. Consulte el archivo [LICENSE](./LICENSE) para obtener más detalles.

---

## 7. Contacto

Para preguntas, informes de errores o sugerencias de funciones, comuníquese a través de:

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub:** [@mytory](https://github.com/mytory)
