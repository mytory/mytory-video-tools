---
name: build-store-appx-from-macos
description: macOS에서 Mytory Video Tools의 Microsoft Store용 x64 AppX를 Windows GitHub Actions로 빌드하고 검증·다운로드한다. Windows 로컬 빌드와 스토어 제출은 포함하지 않는다.
---

# macOS에서 Store AppX 빌드

이 프로젝트의 AppX 설정은 `codex/ms-store-preparation` 브랜치와 PR #1에 있다. 먼저 현재 PR 상태와 기본 브랜치의 워크플로 존재 여부를 확인한다. 이미 머지되었다면 기본 브랜치의 `workflow_dispatch`를 사용한다.

## PR 경로

- 작업 트리를 보존하기 위해 임시 worktree에 빌드 브랜치를 체크아웃한다.
- 빌드할 릴리즈 커밋/태그를 그 브랜치에 머지한다. 태그를 이동하거나 강제 푸시하지 않는다.
- 사용자가 빌드를 요청한 범위에서 빌드 브랜치를 푸시한다. PR 머지는 AppX 생성에 필요하지 않다.
- `.github/workflows/store-appx.yml`은 master 대상 PR에서 `package.json`, `package-lock.json`, `build/**`, 워크플로 변경에 반응한다. PR이 없거나 경로 변경이 없다면 푸시만으로 실행된다고 가정하지 않는다.
- `gh run list --workflow store-appx.yml`에서 이번 푸시의 실행을 식별하고, head SHA와 PR merge ref가 요청한 릴리즈를 포함하는지 확인한다. 과거 성공 실행을 내려받지 않는다.
- 실행 성공 후 `gh run download <run-id> -D dist/store-appx`로 산출물을 받는다.

## 검증

Windows CI는 `npm ci`, `npm run dist:store:appx`, `build/verify-store-appx.ps1` 순서로 실행한다. 로컬 다운로드 후 ZIP 내부 `AppxManifest.xml`의 버전(`X.Y.Z.0`), x64 아키텍처, 설정 파일의 Identity/Publisher를 확인한다. `app.asar`, Windows용 ffmpeg/ffprobe, AppxBlockMap과 필수 assets 포함 여부 및 SHA-256을 기록한다.

macOS 로컬 빌드는 지원 Windows VM 또는 pwsh/Wine 환경이 필요하므로 이 도구들이 없으면 Windows CI를 사용한다. 파일 확장자만 MSIX로 바꾸지 않는다. 기존 패키지는 덮어쓰지 않는다. 실패가 반복되면 원인을 확인하며 최대 5회에서 중단하고 보고한다.

완료 보고에는 버전, 실행 URL, 로컬 AppX 경로, 검증 결과를 포함한다. Partner Center 제출과 인증서·심볼 요구사항은 실제 제출 결과 없이 성공했다고 주장하지 않는다.

## 후속 작업

Windows PC에서 직접 `npm run dist:store:appx`로 빌드하는 절차는 별도 프로젝트 스킬로 작성한다. 실제 Windows 환경에서 빌드·검증한 뒤 SDK 및 도구 요구사항을 기록한다.
