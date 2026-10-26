#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "이 설치 스크립트는 macOS에서만 실행할 수 있습니다." >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Node.js 20 이상이 필요합니다. https://nodejs.org/ 에서 설치한 뒤 다시 실행하세요." >&2
    exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
    echo "Node.js 20 이상이 필요합니다. 현재 버전: $(node --version)" >&2
    exit 1
fi

case "$(uname -m)" in
    arm64) ARCH=arm64 ;;
    x86_64) ARCH=x64 ;;
    *) echo "지원하지 않는 Mac 아키텍처입니다: $(uname -m)" >&2; exit 1 ;;
esac

cd "$PROJECT_DIR"
echo "의존성을 설치합니다..."
npm ci

echo "macOS ${ARCH} 앱을 빌드합니다..."
npm install --no-save --force \
    "@img/sharp-darwin-${ARCH}@0.34.5" \
    "@img/sharp-libvips-darwin-${ARCH}@1.2.4"
npm run dist:test -- --mac --"$ARCH"

APP_PATH="$(find "$PROJECT_DIR/dist" -type d -name 'Mytory Video Tools.app' -prune -print -quit)"
if [[ -z "$APP_PATH" ]]; then
    echo "dist/에서 빌드 결과 앱을 찾을 수 없습니다." >&2
    exit 1
fi

INSTALL_PATH="/Applications/Mytory Video Tools.app"
echo "앱을 ${INSTALL_PATH}에 설치합니다. macOS가 관리자 암호를 요청할 수 있습니다."
sudo rm -rf "$INSTALL_PATH"
sudo ditto "$APP_PATH" "$INSTALL_PATH"
echo "설치가 끝났습니다: $INSTALL_PATH"
echo "앱을 처음 열 때 macOS 보안 경고가 표시되면 앱을 우클릭하고 '열기'를 선택하세요."
