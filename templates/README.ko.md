<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <strong>한국어</strong>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/{{GITHUB_REPO}}/{{DEFAULT_BRANCH}}/apps/extension/public/icon-128.png" alt="{{SITE_NAME}} 로고" width="80" height="80">
</p>

<h1 align="center">🔖 {{SITE_NAME}}</h1>

<p align="center">
  <strong>{{SITE_DESCRIPTION}}</strong>
</p>

<p align="center">
  <a href="{{LICENSE_FILE_URL}}"><img src="https://img.shields.io/badge/license-{{LICENSE_BADGE}}-blue?style=flat-square" alt="라이선스"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/stargazers"><img src="https://img.shields.io/github/stars/{{GITHUB_REPO}}?style=flat-square" alt="스타"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/releases"><img src="https://img.shields.io/github/v/release/{{GITHUB_REPO}}?style=flat-square" alt="릴리스"></a>
  <a href="{{SITE_URL}}"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="웹사이트"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-{{VERSION:react}}-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-{{VERSION:apps/extension:typescript}}-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-{{VERSION:wxt}}-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Vite-{{VERSION:vite}}-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-{{VERSION:tailwindcss}}-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-{{VERSION:zustand}}-764ABC?style=flat-square" alt="Zustand">
  <img src="https://img.shields.io/badge/shadcn%2Fui-000000?style=flat-square" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Nx-{{VERSION:nx}}-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-{{VERSION:bun}}-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Biome-{{VERSION:@biomejs/biome}}-60A5FA?style=flat-square" alt="Biome">
</p>

<p align="center">
{{BROWSER_BADGES:지원}}
  <img src="https://img.shields.io/badge/Safari-미지원-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 📚 문서

상세 문서는 **[{{DOCS_URL}}]({{DOCS_URL}})** 를 참조하세요:

- **시작하기** — 설치 및 설정 가이드
- **기능** — 상세 기능 문서
- **기여하기** — 프로젝트 기여 방법

---

## 🌐 웹사이트

랜딩 페이지와 다운로드 링크는 **[{{SITE_URL}}]({{SITE_URL}})** 를 방문하세요.

---

## 🌐 브라우저 지원

|                                                  브라우저                                                   |  지원 수준  | 비고                         |
| :---------------------------------------------------------------------------------------------------------: | :---------: | ---------------------------- |
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) | ⭐⭐⭐ 주요 | Manifest V3, 모든 기능       |
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   |  ⭐⭐ 보조  | Manifest V2, 사이드 패널은 Firefox 사이드바에 표시 |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   |  ⭐⭐ 보조  | Chromium 기반, 완전 호환     |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |  ❌ 미지원  | `bookmarks` API 미구현       |

> **Safari는 왜 미지원인가요?** Safari Web Extensions는 이 확장의 핵심 기능에 필수적인 `browser.bookmarks` API를 지원하지 않습니다.

---

## ✨ 기능

### ✅ 구현됨

- [x] 🤖 **AI 폴더 추천** — OpenAI, Anthropic, Google AI, Groq, Mistral, DeepSeek, xAI, Azure OpenAI, OpenRouter, Ollama, CLIProxyAPI, models.dev 카탈로그의 약 200개 프로바이더 또는 커스텀 OpenAI 호환 프로바이더로 구동되는 스마트 폴더 제안. 새 폴더 제안은 검토 대화상자에서 확인하며, 확정하면 없는 폴더를 만들고 페이지를 저장
- [x] 🔍 **즉시 검색** — 디바운스 검색과 폴더 필터링으로 빠르게 검색
- [x] 📂 **드래그 앤 드롭** — 직관적인 드래그 앤 드롭으로 정리
- [x] ⚡ **빠른 추가** — 원클릭으로 원하는 폴더에 저장
- [x] 📱 **사이드 패널** — Chrome 사이드 패널에서 접근
- [x] 🗂️ **전체 북마크 관리자** — Chrome 기본 북마크 페이지를 커스텀 테이블 기반 관리자로 대체
- [x] ⚙️ **옵션 페이지** — 외관, 검색, 동작, AI, 유지관리, 메타데이터, 보안, 분석, 데이터 설정 구성
- [x] 🌙 **다크 모드** — 라이트, 다크, 시스템 테마 설정 지원
- [x] 🎯 **모두 펼치기/접기** — 중첩 폴더 빠르게 조작
- [x] 📁 **폴더 생성** — 팝업에서 직접 생성
- [x] ⌨️ **키보드 단축키** — 팝업에서 `/` 검색, 화살표 키로 폴더 이동·열기/닫기, Enter로 현재 페이지 저장. 관리자에서 `/` 필터, `?` 단축키 목록, Backspace 또는 Alt+↑ 상위 폴더, `j`/`k` 행 이동, `s` 저장된 검색 열기
- [x] 🔖 **저장된 검색** — 관리자의 필터, 정렬, 폴더 범위를 이름 있는 스마트 보기로 저장하고 열기, 이름 바꾸기, 삭제 가능. 조건만 저장되므로(이 기기에만, 동기화 안 함) 결과는 항상 현재 북마크를 반영. 삭제된 폴더는 알림과 함께 건너뜀
- [x] 🗑️ **항목 삭제** — 팝업이나 관리자에서 삭제. 확인 대화상자(기본값은 켜짐, 설정에서 끌 수 있음)와 10초 동안의 실행 취소 지원
- [x] 🔗 **중복 클리너** — 설정 가능한 매칭으로 중복 북마크를 찾아 추가 항목 삭제
- [x] 🧹 **URL 클리너** — 추적 파라미터 제거, 쿼리 문자열 정규화, URL 변경 미리보기
- [x] 💀 **죽은 링크 검사** — 선택한 북마크에서 접근할 수 없는 링크를 스캔하고, 복구(삭제, 리디렉션 대상, 보관된 사본, URL 편집)를 검토한 뒤 적용, 실행 취소 가능
- [x] 🧾 **메타데이터 가져오기** — 페이지 제목과 설명을 가져와 선택한 제목만 적용. 설명은 검토용으로만 표시되며 저장되지 않음
- [x] 🖼️ **사이트 아이콘 새로 고침** — 북마크한 각 사이트의 아이콘을 (제3자 아이콘 서비스 없이) 내려받고 결과를 검토한 뒤 이 기기에 저장. 브라우저에 캐시가 없는 사이트와 Firefox에서도 실제 아이콘 표시
- [x] 🛡️ **개인정보 스캐너** — 민감한 쿼리 파라미터, 프래그먼트, 이메일, UUID 감지
- [x] 📊 **북마크 통계** — 도메인, 폴더, 프로토콜, 중복, 깊이 요약
- [x] 📤 **가져오기/내보내기** — HTML, JSON, Markdown, CSV로 내보내고 HTML 또는 JSON 가져오기. 가져오기 전에 미리보기에서 대상 폴더, 개수, 중복을 확인하고 중복 건너뛰기 또는 모두 가져오기를 선택할 수 있으며 실행 취소도 지원. 민감한 값이 포함된 내보내기와 AI 컨텍스트 내보내기는 개인정보 검토를 열어 원본, 가린 사본, 취소 중에서 선택
- [x] 🧠 **AI 도구** — LLM 컨텍스트 내보내기(켜면 저장된 태그와 요약 포함), 태그 제안, 요약, 폴더 재구성 계획(기본적으로 적용 전에 미리보기)
- [x] 🖱️ **컨텍스트 메뉴 저장** — 설정에서 컨텍스트 메뉴를 켜면 우클릭 메뉴에서 최근 폴더 또는 기본 폴더로 링크 저장
- [x] 🌍 **i18n** — 영어, 중국어 간체, 중국어 번체, 일본어, 한국어, 스페인어, 독일어, 프랑스어, 브라질 포르투갈어 지원
- [x] 🔄 **북마크 동기화** — 브라우저 내장 동기화로 기기 간 동기화
- [x] ⚙️ **설정 동기화** — `chrome.storage.sync`로 확장 설정 동기화

> **🤖 AI 기능 안내**
>
> AI 추천과 AI 도구는 **기본적으로 비활성화**되어 있으며 수동으로 활성화해야 합니다:
>
> 1. **설정 → AI** 탭으로 이동
> 2. AI 기능을 활성화하고 선호하는 프로바이더 선택 (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, xAI, Azure OpenAI, OpenRouter, Ollama, CLIProxyAPI 또는 커스텀 OpenAI 호환 엔드포인트)
> 3. 선택한 프로바이더가 요구하는 경우 자신의 API 키 입력
>
> ⚠️ **참고:** AI 기능은 북마크 제목, URL, 폴더 경로, 선택한 북마크 컨텍스트를 설정된 프로바이더로 전송할 수 있습니다. 프로바이더에 따라 API 비용이 발생할 수 있습니다. 결과는 실험적이므로 파괴적인 정리 변경을 적용하기 전에 검토하세요.

### 🟡 부분 지원

- [x] 🏷️ **태그와 요약** — 북마크 상세 정보에서 태그와 요약을 저장, 편집, 삭제하거나 검토한 AI 제안을 저장. 이 브라우저의 로컬 확장 저장소에만 저장되며 동기화, 검색, 북마크 내보내기에는 포함되지 않음(켜면 AI 컨텍스트 내보내기에는 포함)
- [x] 🎛️ **AI 도구 한도** — 태그 수와 스타일, 요약 길이, 재구성 폴더 한도는 프로바이더에 지시로 전송되며, 결과가 이를 따르는지는 검사하지 않음
- [x] 🦊 **Firefox와 Edge** — CI는 Edge에서 전체 브라우저 테스트를, Firefox에서 스모크 테스트(팝업, 사이드 패널 페이지, 관리자, 설정, 가져오기/내보내기, 보고서)를 실행. 이 두 작업은 아직 필수 검사가 아님. Firefox에서는 브라우저 아이콘 캐시를 쓸 수 없어(파비콘 API 없음) '사이트 아이콘 새로 고침'으로 저장한 아이콘이나 일반 아이콘을 표시하며, 북마크 페이지를 대체할 수 없어 관리자는 팝업의 '북마크 관리자 열기' 버튼으로 열 수 있음

### 🚧 현재 집중 영역

- [ ] 🧪 **브라우저 테스트** — Firefox 스모크 테스트를 전체 테스트에 가깝게 확대(컨텍스트 메뉴, 드래그 앤 드롭, 네트워크 및 AI 도구)
- [ ] 🛒 **스토어 배포** — 등록 문구(영어·일본어·한국어), 권한 설명, 개인정보 공개 항목, 개인정보 처리방침 초안, 스크린샷, 제출 체크리스트를 [`store/`](../store/)에 준비함. 제출은 수동이며 승인 대기 중. Firefox 버전에는 영구 부가 기능 ID와 데이터 수집 선언을 설정함

---

## 🛠️ 기술 스택

### 프레임워크 & 언어

|                                                       기술                                                        | 버전 | 설명                   |
| :---------------------------------------------------------------------------------------------------------------: | :--: | ---------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         | {{VERSION:react}} | UI 라이브러리          |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) | {{VERSION:apps/extension:typescript}}  | 타입 안전한 JavaScript |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |  {{VERSION:next}}  | 웹사이트 프레임워크    |

### 빌드 & 도구

|                                              기술                                               | 버전 | 설명              |
| :---------------------------------------------------------------------------------------------: | :--: | ----------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  | {{VERSION:wxt}} | 확장 프레임워크   |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |  {{VERSION:vite}}   | 빌드 도구         |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |  {{VERSION:nx}}  | 모노레포 관리     |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   | {{VERSION:bun}}  | JavaScript 런타임 |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             | {{VERSION:@biomejs/biome}}  | 린팅 & 포맷팅     |

### UI & 스타일링

|                                                         기술                                                         | 버전  | 설명                   |
| :------------------------------------------------------------------------------------------------------------------: | :---: | ---------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |  {{VERSION:tailwindcss}}  | 유틸리티 우선 CSS      |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |  —  | Base UI 기반 컴포넌트    |
|       ![Base UI](https://img.shields.io/badge/Base_UI-161618?style=for-the-badge)        |  {{VERSION:@base-ui/react}}  | 헤드리스 UI 프리미티브 |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |  {{VERSION:lucide-react}}  | 아이콘 라이브러리      |

### 상태 & 데이터

|                                                          기술                                                          | 버전 | 설명            |
| :--------------------------------------------------------------------------------------------------------------------: | :--: | --------------- |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       | {{VERSION:zustand}}  | 상태 관리       |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                | {{VERSION:@tanstack/react-table}} | 헤드리스 테이블 |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) | {{VERSION:@atlaskit/pragmatic-drag-and-drop}}  | 드래그 앤 드롭  |

### 배포 & 인프라

|                                                       기술                                                        | 버전 | 설명           |
| :---------------------------------------------------------------------------------------------------------------: | :--: | -------------- |
|       ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)       |  -   | CI/CD & 호스팅 |
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white) |  -   | CDN & DNS      |

---

## 📦 설치

### GitHub 릴리스에서

[GitHub 릴리스](https://github.com/{{GITHUB_REPO}}/releases)에서 최신 버전 다운로드:

```bash
# GitHub CLI로 릴리스 에셋 다운로드
gh release download --repo {{GITHUB_REPO}} --pattern "bookmark-scout-*-chrome.zip"

# Chrome ZIP 파일 압축 해제
unzip bookmark-scout-*-chrome.zip -d bookmark-scout
```

릴리스 에셋은 브라우저별로 게시됩니다:

- `bookmark-scout-*-chrome.crx` — Chrome 개발자 모드 사이드로드용
- `bookmark-scout-*-chrome.zip` — Chrome 압축해제 설치 또는 Web Store 패키징용
- `bookmark-scout-*-firefox.zip` — Firefox 임시 애드온 설치용
- `bookmark-scout-*-edge.zip` — Edge 압축해제 설치용

### 소스에서

```bash
# 저장소 클론
gh repo clone {{GITHUB_REPO}}
cd bookmark-scout

# 의존성 설치
bun install

# 확장 빌드
bun run build
```

### Chrome에 로드

1. `chrome://extensions/` 열기
2. **개발자 모드** 활성화 (오른쪽 상단)
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 압축 해제한 릴리스 폴더를 선택하거나, 소스에서 빌드한 경우 `apps/extension/dist/chrome-mv3` 선택

---

## 🚀 개발

```bash
# 확장 개발 서버 시작
bun run dev

# 웹사이트 개발 서버 시작
bun run dev:website

# 전체 빌드
bun run build:all

# 린트
bun run lint
```

---

## 📁 프로젝트 구조

```
bookmark-scout/
├── apps/
│   ├── extension/          # 브라우저 확장 (WXT)
│   │   ├── src/
│   │   │   ├── components/ # React 컴포넌트
│   │   │   ├── entrypoints/ # popup, sidepanel, options, bookmarks
│   │   │   ├── hooks/      # 커스텀 React Hooks
│   │   │   ├── stores/     # Zustand 스토어
│   │   │   └── services/   # 북마크 API 서비스
│   │   └── wxt.config.ts
│   ├── website/            # Next.js 마케팅 사이트
│   │   └── app/
│   └── docs/               # Fumadocs 문서 사이트
│       └── content/docs/
├── packages/
│   └── config/             # 공유 설정
├── config/
│   ├── project.toml        # 모든 앱이 공유하는 프로젝트 정보
│   └── web.toml            # 웹사이트와 문서 호스팅
└── templates/              # README 템플릿
```

---

## 🔐 권한

설치할 때는 동작에 꼭 필요한 권한만 요청합니다. 나머지는 모두 선택 사항이며, 해당 기능을 켜거나 실행할 때 요청합니다.

| 권한           | 요청 시점                    | 목적                         |
| -------------- | ---------------------------- | ---------------------------- |
| `bookmarks`    | 설치 시                      | 북마크 읽기 및 쓰기          |
| `storage`      | 설치 시                      | 사용자 설정 저장             |
| `activeTab`    | 설치 시                      | 툴바 버튼을 누를 때 현재 탭 읽기 |
| `sidePanel`    | 설치 시(Chrome, Edge)        | 사이드 패널 활성화           |
| `tabs`         | 사이드 패널에서 현재 페이지를 저장할 때 | 활성 탭의 제목과 URL 읽기 |
| `contextMenus` | 컨텍스트 메뉴를 켤 때(Firefox는 설치 시) | 우클릭 메뉴에서 링크 저장 |
| `favicon`      | '브라우저 아이콘 캐시 사용'을 켤 때(Chrome, Edge) | 브라우저 캐시의 아이콘 표시 |
| 웹사이트 접근  | 깨진 링크 확인, 메타데이터 가져오기, 사이트 아이콘 새로 고침 실행 시 또는 '페이지 내용 읽기'를 켤 때 | 북마크한 페이지를 쿠키 없이 가져오기 |

Firefox에서는 AI를 켜면 AI 제공업체에 필요한 데이터 공유에 대한 동의를 먼저 요청합니다.

---

## 🤝 기여하기

기여를 환영합니다! 가이드라인은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참조하세요.

```bash
# 저장소 포크 및 클론
gh repo fork {{GITHUB_REPO}} --clone

# 기능 브랜치 생성
git checkout -b feature/amazing-feature

# 변경사항 커밋
git commit -m 'feat: 멋진 기능 추가'

# 푸시 및 PR 생성
git push origin feature/amazing-feature
gh pr create --title "feat: 멋진 기능 추가"
```

---

## 📄 라이선스

이 프로젝트는 **GNU Affero General Public License v3.0** 하에 라이선스됩니다 - 자세한 내용은 [LICENSE](../LICENSE) 파일을 참조하세요.

---

## ⭐ 스타 히스토리

<a href="https://star-history.com/#{{GITHUB_REPO}}&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date" />
   <img alt="스타 히스토리 차트" src="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date" />
 </picture>
</a>

---

<p align="center">
  <a href="{{AUTHOR_URL}}">{{AUTHOR_NAME}}</a> 이 ❤️ 를 담아 제작
</p>
