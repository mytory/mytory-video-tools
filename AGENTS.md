# AGENTS

여러 영상 도구를 담은 크로스 플랫폼 엘렉트론 앱. ffmpeg, ffprobe를 내장함.

## 커밋 규칙

커밋은 맘대로 하지 않습니다. 무조건 사용자의 승인을 받습니다. 사용자가 "커밋해"라고 해도 커밋 대상과 메시지를 사용자에게 보여준 뒤 진행합니다. 사용자의 승인을 받지 않은 메시지와 대상으로 커밋하지 않습니다.

푸시는 절대 스스로 하지 않습니다.

태그를 옮기는 것을 맘대로 하지 않습니다. 사용자가 옮기라고 명시적으로 지시할 때만 옮깁니다.

## 대화 규칙

대화도, 생각도 모두 한국어로 합니다.

## 다국어 시스템

두 계층으로 구성된 하이브리드 번역 시스템입니다.

### 1. 시스템 개요

| 계층 | 담당 | 파일 |
|---|---|---|
| **MytoryI18n** | HTML 정적 텍스트 (`data-mi18n-*` 속성) | `renderer/mytory-i18n/mytory-i18n.js` + `renderer/index.html` |
| **translations.js** | JS 동적 텍스트 (`t()` 함수) | `renderer/translations.js` + `renderer/app.js`의 `t()` |

두 계층의 언어 상태는 `applyLanguage()`에서 `MytoryI18n.setLanguage(lang)` 호출로 항상 동기화됩니다.

### 2. 지원 언어 (9개)

| 코드 | 언어 | 비고 |
|---|---|---|
| `en` | English | HTML 본문 기본값 (fallback 최종) |
| `ko` | 한국어 | `data-mi18n-ko` |
| `ja` | 日本語 | `data-mi18n-ja` |
| `zh-cn` | 简体中文 | 키에 하이픈 포함, `'zh-cn'` 따옴표 필요 |
| `es` | Español | |
| `pt` | Português | |
| `fr` | Français | |
| `id` | Bahasa Indonesia | |
| `hi` | हिन्दी | |

### 3. JS 동적 번역: `t()` 함수

`renderer/translations.js`에 모든 번역 데이터가 있습니다.

#### 기본 사용

```javascript
t('Conversion Complete')
```

`translations` 맵에서 `'Conversion Complete'` 키를 찾아 현재 언어로 반환합니다.

#### 하위 호환 (레거시)

```javascript
t('Conversion Complete', '인코딩 완료')
```

맵에 키가 있으면 맵 우선, 없으면 한국어/영어 fallback.

#### 템플릿 동적 문자열

런타임에 값이 결정되는 문자열은 `!`로 시작하는 템플릿 키를 사용합니다.
`templateTranslations`에 언어별 함수를 정의하고 호출 시 인자를 전달합니다.

```javascript
// translations.js에 정의:
const templateTranslations = {
    '!hardware_encoding': {
        en: (name) => \`Using hardware encoding: \${name}\`,
        ko: (name) => \`하드웨어 인코딩 사용 중: \${name}\`,
        ja: (name) => \`ハードウェアエンコードを使用中: \${name}\`,
        // ...
    },
};

// app.js에서 호출:
t('!hardware_encoding', encoders.h264)
```

### 4. HTML 정적 번역: `data-mi18n-*` 속성

HTML 본문은 **영어**를 기본값으로 합니다. 모든 언어의 번역은 `data-mi18n-{locale}` 속성에 넣습니다.

```html
<span class="label"
      data-mi18n-ko="배속 변환기"
      data-mi18n-ja="速度変換"
      data-mi18n-zh-cn="倍速转换">Speed Changer</span>
```

#### 속성 번역

```html
<img data-mi18n-ko-attr-src="ko.png" data-mi18n-ko-attr-alt="한국어" src="en.png" alt="English">
```

#### `data-mi18n-block` (언어별 블록)

HTML 구조 자체가 언어마다 달라야 할 때 사용합니다. 해당 언어일 때만 요소가 노출됩니다.

```html
<span class="help-tip__bubble">
    <span data-mi18n-block="ko">한국어 도움말...</span>
    <span data-mi18n-block="en">English help...</span>
    <span data-mi18n-block="ja">日本語のヘルプ...</span>
</span>
```

`data-mi18n-block`에 여러 언어를 쉼표로 지정할 수 있습니다: `data-mi18n-block="en,ja"`

### 5. 언어 감지 및 저장

1. `localStorage.getItem('mytory-video-lang')` 확인
2. 없으면 `navigator.language` 감지 → 지원 언어 목록과 매칭
3. 매칭되는 언어가 없으면 `'en'`
4. 언어 선택기(`#langSelect`)에서 변경 시 `localStorage`에 저장

### 6. 새 언어 추가 절차

1. `renderer/translations.js`의 `LANG_ORDER` 배열에 언어 코드 추가
2. 모든 `translations` 키에 새 언어 항목 추가 (없으면 영어 fallback)
3. 각 `templateTranslations` 키에 언어별 함수 추가
4. `renderer/index.html`의 `#langSelect`에 `<option>` 추가
5. `renderer/app.js`의 `initApp()` 함수 내 `supportedLangs` 배열에 추가
6. HTML에 필요한 `data-mi18n-{locale}` 속성 추가
7. `data-mi18n-block` 블록이 있으면 새 언어 블록 추가
8. `README.{locale}.md` 파일 생성
9. `README.md`와 `README.ko.md`의 언어 링크 목록 업데이트

### 7. 번역 조회 우선순위 (fallback)

```
1. translations[key].{locale}  (예: zh-cn)
2. translations[key].{base}    (예: zh)
3. translations[key].en        (영어)
4. t(en, ko) 레거시 인자       (한국어 > 영어)
5. HTML 본문 텍스트            (영어)
```

### 8. 참고 문서

- `renderer/mytory-i18n/readme.md` — MytoryI18n 라이브러리 상세 문서
- `renderer/translations.js` — 전체 번역 맵
- `renderer/app.js`의 `t()` 함수 — 번역 조회 로직

## 글로벌 드래그 & 드롭 (화면 전체 드롭)

파일 드롭 공간이 화면 전체로 설정되어 있습니다. 각 도구 탭의 드롭존(`.dropzone`)은 시각적 가이드 역할만 하며, 실제 드래그/드롭 이벤트는 모두 `initApp()`에서 `document`에 등록한 **단일 글로벌 핸들러**로 처리됩니다.

### 동작 방식

1. **`dragenter` / `dragleave` 카운터**: 파일이 앱 창으로 진입하면 `body`에 `global-dragover` 클래스가 추가되고, 전용 오버레이(`#globalDropOverlay`)가 표시됩니다. 내부 요소 사이를 이동할 때의 잦은 진입/이탈을 카운터로 걸러냅니다.
2. **`drop` 이벤트**: `state.activeTab` 값을 읽어 현재 활성화된 도구에 맞게 파일을 전달합니다.
3. **settings 탭** 등 드롭이 불가능한 탭에서는 아무 일도 일어나지 않습니다.

### 처리 함수 매핑

| 탭 ID | 처리 함수 | 파일 수 |
|---|---|---|
| `speed-changer` | `processSpeedFiles(files)` | 다중 |
| `compressor` | `processCompressFiles(files)` | 다중 |
| `audio-drop` | `processAudioFiles(files)` | 다중 |
| `frame-capture` | `loadVideoForCapture(file)` | 단일 (첫 번째) |
| `remuxer` | `processRemuxFiles(files)` | 다중 |
| `splitter` | `loadVideoForSplit(file)` | 단일 (첫 번째) |
| `settings` | 무시 | — |

### 시각적 피드백

- 드래그 중: 화면 중앙에 반투명 오버레이(📥 아이콘 + 안내 문구) 표시
- 드롭 완료: 현재 탭의 드롭존에 `drop-received` 클래스가 1.2초간 적용됨 (`showDropReceivedFeedback` 함수)

### 새 도구 추가 시 주의사항

도구를 추가할 때는 `initApp()`의 글로벌 드롭 핸들러에 있는 `dzMap`과 `switch` 문에도 해당 도구의 처리 함수를 함께 등록해야 합니다.

## 릴리즈 절차

1. 현재 `package.json` 버전을 확인합니다.
2. 변경사항을 확인하고, 다음 릴리즈 버전을 semver에 따라 결정합니다.
   - patch: 버그 수정
   - minor: 기능 추가
   - major: 호환성 깨는 변경
3. 결정한 이유를 사용자에게 보고하고 승인을 받습니다.
4. `package.json` 버전을 업데이트합니다.
5. `docs/`의 소개 웹사이트를 업데이트합니다. 영어 페이지(`docs/index.html`)를 먼저 수정하고, 확정 후 다른 언어 페이지를 동기화합니다.
   - CSS/JS 파일이 변경되었다면 모든 언어 페이지의 `<link>`와 `<script>` 태그에 캐시 버스팅 파라미터(`?h=MD5`)를 추가합니다.
6. `README.md`와 `README.{lang}.md` 파일들을 업데이트합니다.
7. `docs/index.html`의 다운로드 섹션(`.download__platforms`)에 있는 모든 `.platform-card`와 `.platform-card__alt`의 `href`를 해당 릴리즈의 실제 asset URL로 업데이트합니다.
   - macOS ARM: `.../download/vX.Y.Z/...-vX.Y.Z-arm64.dmg`
   - macOS Intel: `.../download/vX.Y.Z/...-vX.Y.Z-x64.dmg`
   - Windows: `.../download/vX.Y.Z/...-Setup-vX.Y.Z.exe`
   - Linux: `.../download/vX.Y.Z/...-vX.Y.Z.AppImage`
8. 변경사항을 커밋합니다.
9. 태그를 만듭니다: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
9. 사용자에게 `git push origin master --tags` 또는 필요한 브랜치/태그 푸시 명령을 안내합니다.

## GitHub Pages 웹사이트 업데이트 규칙

`docs/` 디렉토리에 있는 소개 웹사이트는 다음 규칙에 따라 관리합니다.

### 업데이트 순서

1. **항상 영어(`docs/index.html`)를 먼저 수정합니다.**
2. 영어 페이지의 수정이 완전히 확정된 후에야 다른 언어 페이지를 업데이트합니다.
3. 웹사이트를 출시(배포)하기 전에 모든 언어 페이지가 영어 페이지와 동기화되었는지 확인합니다.

### 번역 페이지 관리

- 각 언어는 `docs/{locale}/index.html` 형식의 서브폴더로 관리합니다.
- 번역 페이지는 영어 페이지의 HTML 구조를 그대로 따르며, 텍스트만 해당 언어로 번역합니다.
- 이미지와 CSS/JS는 영어 페이지와 공유합니다.
- 번역이 완료되지 않은 언어는 영어 페이지와 동일한 구조로 두고 사용자가 직접 번역을 채웁니다.
- 새 언어를 추가할 때는 `docs/index.html`의 언어 선택기(`.lang-nav`)와 나머지 모든 언어 페이지의 언어 선택기에 해당 언어 링크를 추가해야 합니다.

### CSS/JS 캐시 버스팅

- 모든 언어 페이지에서 CSS(`styles.css`)와 JS(`script.js`) 링크에는 MD5 해시 파라미터(`?h=MD5`)를 붙입니다.
- 해시는 `md5 -q styles.css` 또는 `md5sum styles.css` 명령어로 계산합니다.
- CSS/JS가 변경되면 모든 언어 페이지의 해시 파라미터를 함께 업데이트해야 브라우저 캐시가 갱신됩니다.
- 앱 버전과 독립적이므로 CSS/JS 변경 시에만 업데이트합니다.

### 언어 선택기 업데이트 규칙

- 모든 언어 페이지는 동일한 언어 선택기(`.lang-nav`)를 가집니다.
- 언어 선택기의 링크는 상대 경로를 사용합니다.
- 새 언어를 추가하거나 언어 선택기 UI를 변경할 때는 **모든 언어 페이지**의 선택기를 함께 업데이트해야 합니다.
