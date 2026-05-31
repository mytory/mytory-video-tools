# Mytory Video Tools

> **🇬🇧 English:** [README.md](./README.md) · **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇯🇵 日本語:** [README.ja.md](./README.ja.md) · **🇨🇳 简体中文:** [README.zh-cn.md](./README.zh-cn.md) · **🇪🇸 Español:** [README.es.md](./README.es.md) · **🇧🇷 Português:** [README.pt.md](./README.pt.md) · **🇮🇩 Bahasa Indonesia:** [README.id.md](./README.id.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** est une application de bureau multiplateforme (Windows, macOS, Linux) pour le codage vidéo à haute vitesse et diverses tâches de manipulation multimédia. Elle est construite avec Electron et intègre les binaires FFmpeg/FFprobe.

---

## 1. Fonctionnalités

1. **Navigation par onglets latéraux** : Basculez entre 6 utilitaires multimédia principaux dans un tableau de bord élégant au thème sombre.
2. **Politique de sortie flexible** : Par défaut, les fichiers sont sauvegardés à côté de l'original avec un suffixe spécifique à la tâche. Des dossiers de sortie personnalisés peuvent également être configurés.
3. **Détection automatique de l'accélération matérielle** : Au démarrage, l'application analyse votre GPU et sélectionne l'encodeur matériel optimal pour votre plateforme (Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QSV, AMD AMF, etc.).

### 6 Outils Principaux

| Outil | Description |
|---|---|
| ⚡ **Changement de vitesse** | Modifie la vitesse de lecture vidéo (0,5x ~ 4,0x) avec préservation du ton. Prend en charge H.264, H.265/HEVC, VP9, AV1. |
| 🎵 **Extraction audio** | Extrait les pistes audio sans perte (Auto) ou convertit en MP3, AAC, OGG ou WAV. |
| 📸 **Capture d'image** | Capture d'une seule image, extraction par lots à intervalles réguliers et détection automatique de scènes avec réglage de la sensibilité. |
| 🔄 **Remuxeur** | Conversion rapide de format de conteneur (MP4, MKV, MOV) sans ré-encodage. |
| ✂️ **Coupe-vidéo** | Coupe un segment sans perte en définissant les points de début et de fin. Extrêmement rapide. |
| 📦 **Compresseur** | Compresse une vidéo à une taille de fichier cible avec diverses options de codec et de qualité. |

> **🖱️ Glisser-déposer global** : Faites glisser des fichiers n'importe où sur la fenêtre de l'application pour les ajouter instantanément à l'outil actif.

---

## 2. 🚀 Utilisateurs finaux : Installation et exécution

Si vous souhaitez simplement utiliser l'application sans la construire vous-même, suivez les étapes ci-dessous.

### Téléchargement
*   Visitez la page [GitLab Releases](lien_à_définir) et téléchargez le package pour votre système d'exploitation.
    *   **Windows :** `.exe` (installateur)
    *   **macOS :** `.dmg` (image disque)
    *   **Linux :** `.AppImage` (portable)

### ⚠️ Avertissement de sécurité (À lire)
Ce programme est distribué par un développeur individuel et n'est pas signé avec un certificat de signature de code payant. L'avertissement de sécurité que vous pourriez voir **n'est pas un défaut**. Veuillez suivre les instructions ci-dessous pour exécuter l'application.

*   **Windows :** Sur l'avertissement bleu de SmartScreen, cliquez sur **[Plus d'informations]** → **[Exécuter quand même]**
*   **macOS :** **Cliquez droit (ou Control+clic)** sur le fichier de l'application → Sélectionnez **[Ouvrir]** → Cliquez à nouveau sur **[Ouvrir]**

---

## 3. 🛠 Développeurs : Construction à partir des sources

Instructions pour configurer un environnement de développement et construire le projet.

### Prérequis
[Node.js](https://nodejs.org/) doit être installé sur votre système.

### Installer les dépendances
```bash
npm install
```

### Exécuter en mode développement
```bash
npm start
```

### Construire pour la distribution
```bash
# Crée des packages distribuables dans le dossier dist/
npm run dist
```

### Notes sur la signature de code macOS / construction CI

* `npm run dist` charge les variables d'environnement depuis `.env` via `dotenv`.
* L'identité de signature macOS est lue depuis la variable `CSC_NAME` dans `.env`. Cette variable spécifie le nom d'un certificat installé dans votre trousseau macOS local.
* Exemple de `.env` :
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `CSC_LINK` / `CSC_KEY_PASSWORD` dans `.gitlab-ci.yml` sont utilisés pour la signature basée sur P12 dans les environnements GitLab CI.

---

## 4. Structure des répertoires

```text
.
├── package.json          # Package npm et configuration de build
├── main.js               # Processus principal Electron
├── preload.js            # Script de préchargement d'isolation de contexte
├── .gitlab-ci.yml        # Configuration de build multiplateforme GitLab CI/CD
├── README.md             # Documentation du projet (Anglais)
├── README.ko.md          # Documentation du projet (Coréen)
├── README.ja.md          # Documentation du projet (Japonais)
├── README.zh-cn.md       # Documentation du projet (Chinois)
├── README.es.md          # Documentation du projet (Espagnol)
├── README.pt.md          # Documentation du projet (Portugais)
├── README.fr.md          # Documentation du projet (Français)
├── README.id.md          # Documentation du projet (Indonésien)
├── README.hi.md          # Documentation du projet (Hindi)
└── renderer/             # Processus de rendu (ressources frontend)
```

---

## 5. Licences open source

Cette application utilise les projets open source suivants et respecte les termes de leurs licences respectives.

*   **[Electron](https://www.electronjs.org/)** (Licence MIT) : Framework d'application de bureau
*   **[FFmpeg](https://ffmpeg.org/)** (Licence LGPL/GPL) : Moteur de traitement multimédia
    *   Cette application inclut FFmpeg via `ffmpeg-static`. Le code source de FFmpeg est disponible sur le site officiel.
*   **[Pico.css](https://picocss.com/)** (Licence MIT) : Framework CSS minimal pour le style de l'interface utilisateur
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (Licence MIT) : Fournisseurs de binaires FFmpeg/FFprobe

---

## 6. Licence

Copyright (c) 2026 mytory. Ce projet est sous licence **ISC License**. Voir le fichier [LICENSE](./LICENSE) pour plus de détails.

---

## 7. Contact

Pour toute question, rapport de bug ou suggestion de fonctionnalité, veuillez contacter :

*   **Email :** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog :** [https://mytory.net](https://mytory.net)
*   **GitHub/GitLab :** [@mytory](https://github.com/mytory)
