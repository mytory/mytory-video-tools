# Mytory Video Tool (데스크톱 통합 앱)

**Mytory Video Tool**은 대용량 비디오의 배속 인코딩 및 다양한 미디어 조작을 지원하는 크로스 플랫폼(Windows, macOS, Linux) 데스크톱 애플리케이션입니다.

---

## 1. 주요 특징 및 제공 기능

1. **사이드바 탭 네비게이션**: 5가지 핵심 미디어 유틸리티를 하나의 세련된 다크 테마 대시보드 안에서 자유롭게 전환하며 사용할 수 있습니다.
2. **유연한 저장 정책**: 기본적으로 원본 비디오 파일과 동일한 경로에 작업 접미사를 붙여 고속 저장하며, 사용자가 원하는 커스텀 출력 폴더를 별도로 구성할 수 있습니다.
3. **하드웨어 가속 자동 감지**: 앱이 시작할 때 로컬 GPU 사양을 스캔하여 플랫폼별 최적의 하드웨어 인코더(Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QSV, AMD AMF 등)를 기본값으로 자동 셋팅합니다.

### 5가지 핵심 도구
* **⚡ 배속 변환기 (Speed Changer)**: 다람쥐 목소리 방지 기술(피치 유지)을 내장하여 0.5x ~ 4.0x 속도로 비디오 배속 인코딩을 수행합니다. (H.264, H.265/HEVC, VP9, AV1 코덱 지원)
* **🎵 오디오 추출기 (Audio Drop)**: 비디오 파일에서 오디오 트랙만 무손실 복사(Auto)하거나 다양한 형식(MP3, AAC, OGG, WAV)으로 변환해 추출합니다.
* **📸 장면 캡처 (Frame Capture)**: 프레임 단위 탐색 캡처, 지정 간격(Batch) 연속 추출 및 민감도 조절을 통한 장면 전환(Scene Detection) 자동 추출 기능을 제공합니다.
* **🔄 확장자 변환기 (Remuxer)**: 재인코딩 과정 없이 고속으로 비디오의 컨테이너 포맷(MP4, MKV, MOV)만 변경합니다.
* **✂️ 비디오 분할기 (Video Splitter)**: 인코딩 손실 없이 비디오의 원하는 영역 시작점과 종료점을 선택해 매우 빠르게 자릅니다.

---

## 2. 🚀 일반 사용자: 앱 설치 및 실행

프로그램을 직접 빌드하지 않고 완성된 파일을 사용하시려면 아래 절차를 따르세요.

### 다운로드
*   [GitLab Releases](링크_입력_예정) 페이지에서 본인의 운영체제에 맞는 파일을 다운로드합니다.
    *   **Windows:** `.exe` (설치 파일)
    *   **macOS:** `.dmg` (설치 파일)
    *   **Linux:** `.AppImage` (실행 파일)

### ⚠️ 보안 경고 관련 안내 (필독)
본 프로그램은 개인 개발자가 배포하는 오픈소스 소프트웨어로, 유료 개발자 인증서 서명이 되어 있지 않습니다. 실행 시 발생하는 보안 경고는 프로그램의 결함이 아니니 아래 방법으로 실행해 주세요.

*   **Windows:** 파란색 경고창에서 **[추가 정보]** 클릭 -> **[실행]** 버튼 클릭
*   **macOS:** 앱 파일 위에서 **마우스 오른쪽 버튼(또는 Control+클릭)** -> **[열기]** 선택 -> 다시 한번 **[열기]** 클릭

---

## 3. 🛠 개발자: 소스 빌드 및 실행

개발 환경을 구축하거나 직접 빌드하여 사용하시려는 분들을 위한 안내입니다.

### 종속성 설치
로컬 환경에 [Node.js](https://nodejs.org/)가 설치되어 있어야 합니다.

```bash
# 의존성 패키지 설치
npm install
```

### 개발 모드 실행
```bash
# 애플리케이션 실행
npm start
```

### 배포 패키지 직접 빌드
```bash
# 최종 배포 파일 생성 (dist/ 폴더 내에 생성됨)
npm run dist
```

---

## 4. 디렉터리 구조

```text
.
├── package.json          # npm 패키지 및 빌드 설정
├── main.js               # Electron 메인 프로세스
├── preload.js            # Context Isolation 보안 프리로드 스크립트
├── .gitlab-ci.yml        # GitLab CI/CD 멀티 플랫폼 빌드 설정
├── README.md             # 프로젝트 소개 및 매뉴얼
└── renderer/             # 렌더러 프로세스 (프론트엔드 리소스)

---

## 5. 오픈소스 라이선스 고지 (Open Source Licenses)

이 프로그램은 다음 오픈소스 프로젝트들을 사용하고 있으며, 각 프로젝트의 라이선스 규정을 준수합니다.

*   **[Electron](https://www.electronjs.org/)** (MIT License): 데스크톱 애플리케이션 프레임워크
*   **[FFmpeg](https://ffmpeg.org/)** (LGPL/GPL License): 멀티미디어 처리 엔진
    *   이 프로그램은 `ffmpeg-static`을 통해 FFmpeg 바이너리를 포함하고 있습니다. FFmpeg의 소스 코드는 공식 사이트에서 다운로드할 수 있습니다.
*   **[Pico.css](https://picocss.com/)** (MIT License): UI 스타일링을 위한 미니멀 CSS 프레임워크
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (MIT License): FFmpeg 바이너리 제공 라이브러리

---

## 6. 라이선스 (License)

Copyright (c) 2026 mytory. 본 프로젝트는 **ISC License**에 따라 자유롭게 이용할 수 있습니다. 자세한 내용은 [LICENSE](./LICENSE) 파일을 참조하세요.

---

## 7. 문의 및 연락처 (Contact)

질문, 버그 보고 또는 기능 제안이 있으시면 아래 채널을 통해 연락해 주세요.

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub/GitLab:** [@mytory](https://github.com/mytory)
```
