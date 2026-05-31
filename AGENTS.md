# AGENTS

## 릴리즈 절차
1. 현재 `package.json` 버전을 확인합니다.
2. 변경사항을 확인하고, 다음 릴리즈 버전을 semver에 따라 결정합니다.
   - patch: 버그 수정
   - minor: 기능 추가
   - major: 호환성 깨는 변경
3. 결정한 이유를 사용자에게 보고하고 승인을 받습니다.
4. `package.json` 버전을 업데이트합니다.
5. `README.md` 파일을 업데이트합니다.
6. 변경사항을 커밋합니다.
7. 태그를 만듭니다: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
8. 사용자에게 `git push origin master --tags` 또는 필요한 브랜치/태그 푸시 명령을 안내합니다.
