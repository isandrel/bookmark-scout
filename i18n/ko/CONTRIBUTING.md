<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <a href="../zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <a href="../es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <a href="../fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <a href="../pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <strong lang="ko">한국어</strong> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Bookmark Scout에 기여하기

Bookmark Scout에 기여하려고 생각해 주셔서 감사합니다. 여러분 같은 분들 덕분에 이 확장 프로그램이 모두에게 더 좋아집니다.

## 📋 목차

- [행동 강령](#-행동-강령)
- [어떻게 기여할 수 있나요?](#-어떻게-기여할-수-있나요)
- [개발 환경 설정](#-개발-환경-설정)
- [풀 리퀘스트 절차](#-풀-리퀘스트-절차)
- [스타일 가이드라인](#-스타일-가이드라인)
- [국제화](#-국제화)
- [질문이 있나요?](#-질문이-있나요)

## 📜 행동 강령

이 프로젝트는 [행동 강령](../../CODE_OF_CONDUCT.md)을 따릅니다. 참여하는 모든 분은 서로 존중하고 포용하는 태도를 지켜 주시기 바랍니다. 용납할 수 없는 행동은 GitHub Issues로 신고해 주세요.

## 🎯 어떻게 기여할 수 있나요?

### 🐛 버그 신고

버그를 신고하기 전에 중복을 피하기 위해 기존 이슈를 먼저 확인해 주세요.

**버그를 신고할 때 포함할 내용:**

- 브라우저와 버전(Chrome, Firefox, Edge)
- 확장 프로그램 버전
- 재현 단계
- 예상한 동작과 실제 동작
- 해당되는 경우 스크린샷

[버그 신고 템플릿](../../.github/ISSUE_TEMPLATE/01-bug-report.yml)을 사용해 주세요.

### ✨ 기능 제안

기능 제안은 언제나 환영합니다. [기능 요청 템플릿](../../.github/ISSUE_TEMPLATE/02-feature-request.yml)을 사용해 주세요.

**좋은 기능 요청에 들어가는 내용:**

- 명확한 문제 설명
- 제안하는 해결 방법
- 검토해 본 다른 방법

### 🔧 코드 기여

작업할 거리를 찾고 있다면 다음 라벨이 붙은 이슈를 확인해 보세요.

- `good first issue` - 처음 기여하는 분께 알맞은 이슈
- `help wanted` - 도움이 필요한 이슈

## 💻 개발 환경 설정

Bookmark Scout를 사용하려면 [README](README.md#-설치)에 설명된 대로 브라우저 스토어나 GitHub 릴리스에서 설치하세요. 아래 단계는 개발 작업을 위해 소스에서 빌드하는 방법입니다. 기술 스택, 기능 현황, 릴리스 빌드, 프로젝트 구조는 [DEVELOPMENT.md](../../DEVELOPMENT.md)(영어)를 참고하세요.

### 사전 요구 사항

- [Bun](https://bun.sh)(최신 버전)
- 런타임 관리용 [mise](https://mise.jdx.dev/)
- 다음 브라우저 중 하나: Chrome, Firefox, Edge

### 설치

```bash
# 저장소 클론
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# 의존성 설치
bun install

# 개발 서버 시작(Chrome)
bun run dev
```

### 빌드

```bash
# 모든 브라우저용 빌드
bun run build

# Chrome용 빌드
bunx nx run extension:build:chrome

# Firefox용 빌드
bun run build:firefox

# Edge용 빌드
bun run build:edge
```

### 확장 프로그램 로드

**Chrome/Edge:**

1. `chrome://extensions` 또는 `edge://extensions`로 이동합니다
2. "개발자 모드"를 켭니다
3. "Load unpacked"(압축해제된 확장 프로그램 로드)를 클릭합니다
4. `apps/extension/dist/chrome-mv3`(Chrome) 또는 `apps/extension/dist/edge-mv3`(Edge)를 선택합니다

**Firefox:**

1. `about:debugging#/runtime/this-firefox`로 이동합니다
2. "Load Temporary Add-on"(임시 부가 기능 로드)을 클릭합니다
3. `apps/extension/dist/firefox-mv2`에 있는 `manifest.json` 파일을 선택합니다

## 🔄 풀 리퀘스트 절차

### 시작하기 전에

1. **main과 동기화**: 작업을 시작하기 전에 항상 rebase로 pull하세요
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **이슈 만들기**: 큰 변경은 구현하기 전에 먼저 논의해 주세요

3. **브랜치 만들기**: 정해진 이름 규칙을 따르세요
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### 커밋 메시지

[Gitmoji](https://gitmoji.dev/)를 붙인 [Conventional Commits](https://www.conventionalcommits.org/) 형식을 사용합니다.

`commit-msg` 훅과 **PR title** 검사가 이 형식을 확인하며, 허용되는 유형은 `config/commits.toml`에 있습니다.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| 이모지 | 유형       | 설명          |
| ------ | ---------- | ------------- |
| ✨     | `feat`     | 새 기능       |
| 🐛     | `fix`      | 버그 수정     |
| 📝     | `docs`     | 문서          |
| 💄     | `style`    | UI/스타일     |
| ♻️      | `refactor` | 코드 리팩터링 |
| ⚡     | `perf`     | 성능          |
| ✅     | `test`     | 테스트        |
| 🔧     | `chore`    | 유지 관리     |

### 풀 리퀘스트 만들기

1. **브랜치 푸시**
   ```bash
   git push -u origin feat/123-description
   ```

2. **GitHub CLI로 PR 만들기**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **CI 검사**가 통과할 때까지 기다립니다

4. 리뷰 의견이 있으면 **반영합니다**

### PR 체크리스트

- [ ] 코드가 프로젝트 스타일 가이드라인을 따름
- [ ] 셀프 리뷰 완료
- [ ] 관련 린트/빌드 검증 완료
- [ ] 변경한 영역에 테스트 모음이 있는 경우, 필요하면 테스트 추가/업데이트
- [ ] 필요하면 문서 업데이트
- [ ] 관련 이슈 연결

## 📐 스타일 가이드라인

### 코드 스타일

린트와 포매팅에는 [Biome](https://biomejs.dev/)을 사용합니다.

```bash
# 린트 검사
bun run lint

# 확장 프로그램 린트만 실행
bunx nx run extension:lint

# 확장 프로그램 테스트 전체 실행(Chrome을 빌드하고 Playwright Chromium을 설치함)
bun run test
```

테스트 명령은 단위 테스트와 헤드리스 Chromium E2E 테스트 모음(팝업, 사이드 패널, 북마크 관리자, 설정, 빠른 저장, 유지 관리, 보고서, 가져오기/내보내기, Ask AI, 여러 화면에 걸친 사용 흐름)을 실행합니다. CI는 브라우저를 직접 설정하지 않고 같은 테스트 모음을 실행하며, Edge 테스트 모음과 Firefox 스모크 테스트 모음도 함께 실행합니다. 네트워크에 의존하는 흐름과 AI 제공업체 흐름은 오프라인으로 실행됩니다. `[mocked provider contract]`라는 제목의 테스트는 AI 제공업체를 스텁으로 대체하고(Vitest `ai` 모의 객체와 Playwright로 라우팅한 OpenAI 호환 엔드포인트), 네트워크 요청은 라우트 모의로 처리합니다. 이 테스트는 Bookmark Scout의 요청/응답 계약, 옵트인 제한, 오류 처리를 확인할 뿐, 실제 제공업체나 웹사이트와의 호환성은 확인하지 않습니다.

그 밖의 테스트 모음과 각각이 다루는 변경:

```bash
# Edge와 Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# 로컬 AI 에이전트: MCP 브리지 자체 테스트, 그다음 컴파일된
# bookmark-scout-mcp를 Chromium의 확장 프로그램과 함께 테스트(Linux 및 macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# 큰 라이브러리에서의 지연 시간과 스크롤. 속도 관련 변경 전후에 실행
bunx nx run extension:test:perf

# 실제 제공업체를 대상으로 한 AI 기능. BS_LIVE_AI_* 변수가 설정되지 않으면 건너뜀
# (apps/extension/tests/live/README.md 참고)
bunx nx run extension:test:live
```

CI는 확장 프로그램이나 `packages/mcp-bridge`가 바뀌면 브리지 테스트를, 성능 테스트 모음은 매일, 실시간 AI 테스트 모음은 필요할 때만 실행합니다.

### Chrome 내장 AI

**내장 AI** 서비스는 Chrome 자체 모델(Gemini Nano, Prompt API의 `LanguageModel`)을 내 컴퓨터에서 실행합니다. 단위 테스트와 E2E 테스트는 가짜 `LanguageModel`(`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`)을 사용하며, 실제 모델은 직접 확인합니다.

1. [Chrome 하드웨어 요구 사항](https://developer.chrome.com/docs/ai/get-started#hardware)을 충족하는 컴퓨터에서 Chrome 138 이상을 사용하세요. 설정 > AI에서 이 서비스 아래에 있는 **이 컴퓨터 확인**은 현재 컴퓨터를 요구 사항과 비교합니다. 사양이 낮은 컴퓨터에서 시험하려면 `chrome://flags/#optimization-guide-on-device-model`을 **Enabled BypassPerfRequirement**로 설정하고 Chrome을 다시 시작하세요.
2. `bun run dev`가 여는 브라우저에서는 모델을 사용할 수 없다고 표시됩니다. 아래 스위치로 시작하거나, 실행기를 끄고 `chrome://extensions`에서 `apps/extension/dist/chrome-mv3-dev`를 내 Chrome 프로필에 로드하세요. 개발자별로 다른 이 파일은 Git에 넣지 마세요. `apps/extension/web-ext.config.ts`는 무시 대상입니다.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // 또는 내 프로필을 대신 사용: disabled: true,
   });
   ```

3. **설정** > **AI**에서 **내장 AI 사용**을 클릭한 다음 **모델 다운로드**를 클릭합니다. `chrome://on-device-internals`에서 모델 상태와 다운로드 진행 상황을 볼 수 있고, 모델에 프롬프트를 직접 보낼 수도 있습니다. 이 페이지는 `chrome://chrome-urls`에서 내부 디버깅 페이지를 켠 뒤에만 열립니다.
4. **AI 기능**과 **요청 기록**을 켜고, 아무 페이지에서 팝업을 연 뒤 폴더 추천 버튼을 클릭합니다. **AI 활동**에 프롬프트가 `ON-DEVICE`로 표시됩니다.
5. 페이지에서 AI 빠른 저장 단축키를 두 번 누릅니다. 두 저장 모두 **AI 활동**에 나타나며, 두 번째가 더 빠릅니다. AI 호스트 페이지(오프스크린 문서로, `chrome://extensions`에서 확장 프로그램의 뷰 아래에 표시됨)가 `apps/extension/config/ai/built-in.toml`의 `[quick_save] idle_timeout_ms` 동안 지시문을 불러온 상태로 유지하기 때문입니다.

### TypeScript

- 새 코드는 모두 TypeScript로 작성합니다
- 객체 타입에는 `interface`보다 `type`을 우선합니다
- 함수에는 반환 타입을 명시합니다

### React 컴포넌트

- 훅을 사용하는 함수형 컴포넌트를 사용합니다
- 컴포넌트는 작고 한 가지 역할에 집중하게 만듭니다
- 의미가 잘 드러나는 prop 이름을 사용합니다

### 파일 구성

```
apps/extension/src/
├── components/     # Reusable UI components
├── hooks/          # Custom React hooks
├── services/       # Bookmark actions, AI, browser integrations, import/export
├── stores/         # Zustand stores
├── lib/            # Storage, schemas, and low-level helpers
├── types/          # TypeScript types
└── entrypoints/    # Extension entry points
```

`packages/mcp-bridge`에는 로컬 AI 에이전트가 사용하는 MCP 서버이자 네이티브 메시징 호스트인 `bookmark-scout-mcp`가 있습니다. 확장 프로그램과 주고받는 메시지는 `packages/mcp-bridge/src/protocol.ts`에 정의되어 있습니다.

## 🌐 국제화

사용자에게 보이는 텍스트를 추가할 때:

1. `apps/extension/public/_locales/<locale>/messages.json`에 문자열을 추가합니다
2. `config/project.toml`의 `[locales] extension`에 나열된 모든 로캘에 추가합니다
3. 기존 i18n 헬퍼 `t("message_key")`를 사용합니다

`README.md`, 이 가이드, 그리고 `i18n/<language>/`에 있는 번역본은 `templates/`에서 생성됩니다. 생성된 파일이 아니라 템플릿을 수정하세요. [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown)(영어)을 참고하세요.

## 🤔 질문이 있나요?

- 기존 [이슈](https://github.com/isandrel/bookmark-scout/issues)를 확인하세요
- [토론](https://github.com/isandrel/bookmark-scout/discussions)을 시작하세요
- [질문 이슈](../../.github/ISSUE_TEMPLATE/04-question.yml)를 만드세요

## 🙏 감사합니다

모든 기여가 Bookmark Scout를 더 좋게 만듭니다. 예를 들면:

- 🐛 버그 신고
- ✨ 기능 제안
- 📝 문서 개선
- 🔧 코드 작성
- 🌐 번역

시간과 노력을 들여 주셔서 감사합니다.
