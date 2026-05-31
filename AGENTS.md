# AGENTS

여러 영상 도구를 담은 크로스 플랫폼 엘렉트론 앱. ffmpeg, ffprobe를 내장함.

## 대화 규칙

대화도, 생각도 모두 한국어로 합니다.

## 다국어 사용

`renderer/mytory-i18n/mytory-i18n.js` 라이브러리를 사용해 다국어 지원을 합니다.

따라서 다국어 관련 작업을 하기 전에는 `renderer/mytory-i18n/readme.md` 파일을 읽고 진행하세요.

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
5. `README.md`와 `README.{lang}.md` 파일들을 업데이트합니다.
6. 변경사항을 커밋합니다.
7. 태그를 만듭니다: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
8. 사용자에게 `git push origin master --tags` 또는 필요한 브랜치/태그 푸시 명령을 안내합니다.
