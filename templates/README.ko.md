<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <strong>한국어</strong>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/{{GITHUB_REPO}}/main/apps/extension/public/icon-128.png" alt="{{SITE_NAME}} 로고" width="80" height="80">
</p>

<h1 align="center">🔖 {{SITE_NAME}}</h1>

<p align="center">
  <strong>{{SITE_DESCRIPTION}}</strong>
</p>

<p align="center">
  <a href="https://github.com/{{GITHUB_REPO}}/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="라이선스"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/stargazers"><img src="https://img.shields.io/github/stars/{{GITHUB_REPO}}?style=flat-square" alt="스타"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/releases"><img src="https://img.shields.io/github/v/release/{{GITHUB_REPO}}?style=flat-square" alt="릴리스"></a>
  <a href="{{SITE_URL}}"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="웹사이트"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-0.20-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-4.1-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-5.0-764ABC?style=flat-square" alt="Zustand">
  <img src="https://img.shields.io/badge/shadcn%2Fui-0.9-000000?style=flat-square" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Nx-23-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-1.3-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Biome-2.3-60A5FA?style=flat-square" alt="Biome">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-지원-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-지원-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
  <img src="https://img.shields.io/badge/Edge-지원-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
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
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   |  ⭐⭐ 보조  | Manifest V2, 사이드바 미지원 |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   |  ⭐⭐ 보조  | Chromium 기반, 완전 호환     |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |  ❌ 미지원  | `bookmarks` API 미구현       |

> **Safari는 왜 미지원인가요?** Safari Web Extensions는 이 확장의 핵심 기능에 필수적인 `browser.bookmarks` API를 지원하지 않습니다.

---

## ✨ 기능

### ✅ 구현됨

- [x] 🤖 **AI 폴더 추천** — OpenAI, Anthropic, Google AI, Groq, Mistral, DeepSeek, OpenRouter, Ollama, CLIProxyAPI 또는 커스텀 OpenAI 호환 프로바이더로 구동되는 스마트 폴더 제안
- [x] 🔍 **즉시 검색** — 디바운스 검색과 폴더 필터링으로 빠르게 검색
- [x] 📂 **드래그 앤 드롭** — 직관적인 드래그 앤 드롭으로 정리
- [x] ⚡ **빠른 추가** — 원클릭으로 원하는 폴더에 저장
- [x] 📱 **사이드 패널** — Chrome 사이드 패널에서 접근
- [x] 🗂️ **전체 북마크 관리자** — Chrome 기본 북마크 페이지를 커스텀 테이블 기반 관리자로 대체
- [x] ⚙️ **옵션 페이지** — 외관, 검색, 동작, AI, 유지관리, 메타데이터, 보안, 분석, 데이터 설정 구성
- [x] 🌙 **다크 모드** — 라이트, 다크, 시스템 테마 설정 지원
- [x] 🎯 **모두 펼치기/접기** — 중첩 폴더 빠르게 조작
- [x] 📁 **폴더 생성** — 팝업에서 직접 생성
- [x] 🗑️ **항목 삭제** — 확인 후 삭제
- [x] 🔗 **중복 클리너** — 설정 가능한 매칭으로 중복 북마크를 찾아 추가 항목 삭제
- [x] 🧹 **URL 클리너** — 추적 파라미터 제거, 쿼리 문자열 정규화, URL 변경 미리보기
- [x] 💀 **죽은 링크 검사** — 선택한 북마크에서 접근할 수 없는 링크 스캔
- [x] 🧾 **메타데이터 가져오기** — 제목, 파비콘, 설명 메타데이터 가져오기
- [x] 🛡️ **개인정보 스캐너** — 민감한 쿼리 파라미터, 프래그먼트, 이메일, UUID 감지
- [x] 📊 **북마크 통계** — 도메인, 폴더, 프로토콜, 중복, 깊이 요약
- [x] 📤 **가져오기/내보내기** — HTML, JSON, Markdown, CSV로 내보내고 HTML 또는 JSON 가져오기
- [x] 🧠 **AI 도구** — LLM 컨텍스트 내보내기, 태그 제안, 요약, 폴더 재구성 계획
- [x] 🖱️ **컨텍스트 메뉴 저장** — 우클릭 메뉴에서 최근 폴더 또는 기본 폴더로 링크 저장
- [x] 🌍 **i18n** — 영어, 일본어, 한국어 지원
- [x] 🔄 **북마크 동기화** — 브라우저 내장 동기화로 기기 간 동기화
- [x] ⚙️ **설정 동기화** — `chrome.storage.sync`로 확장 설정 동기화

> **🤖 AI 기능 안내**
>
> AI 추천과 AI 도구는 **기본적으로 비활성화**되어 있으며 수동으로 활성화해야 합니다:
>
> 1. **설정 → AI** 탭으로 이동
> 2. AI 기능을 활성화하고 선호하는 프로바이더 선택 (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter, Ollama, CLIProxyAPI 또는 커스텀 OpenAI 호환 엔드포인트)
> 3. 선택한 프로바이더가 요구하는 경우 자신의 API 키 입력
>
> ⚠️ **참고:** AI 기능은 북마크 제목, URL, 폴더 경로, 선택한 북마크 컨텍스트를 설정된 프로바이더로 전송할 수 있습니다. 프로바이더에 따라 API 비용이 발생할 수 있습니다. 결과는 실험적이므로 파괴적인 정리 변경을 적용하기 전에 검토하세요.

### 🚧 현재 집중 영역

- [ ] ⌨️ **키보드 단축키** — 더 빠른 키보드 중심 탐색과 작업 추가
- [ ] 🏷️ **영구 태그** — AI 생성 제안을 넘어 커스텀 태그 저장 및 관리
- [ ] 🧪 **자동화 테스트** — 북마크 워크플로를 위한 전용 단위/통합 테스트 추가
- [ ] 🛒 **스토어 배포** — Chrome Web Store, Firefox Add-ons, Edge Add-ons 등록 자료 준비

---

## 🛠️ 기술 스택

### 프레임워크 & 언어

|                                                       기술                                                        | 버전 | 설명                   |
| :---------------------------------------------------------------------------------------------------------------: | :--: | ---------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         | 19.2 | UI 라이브러리          |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) | 6.0  | 타입 안전한 JavaScript |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |  16  | 웹사이트 프레임워크    |

### 빌드 & 도구

|                                              기술                                               | 버전 | 설명              |
| :---------------------------------------------------------------------------------------------: | :--: | ----------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  | 0.20 | 확장 프레임워크   |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |  7   | 빌드 도구         |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |  23  | 모노레포 관리     |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   | 1.3  | JavaScript 런타임 |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             | 2.3  | 린팅 & 포맷팅     |

### UI & 스타일링

|                                                         기술                                                         | 버전  | 설명                   |
| :------------------------------------------------------------------------------------------------------------------: | :---: | ---------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |  4.1  | 유틸리티 우선 CSS      |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |  0.9  | Radix 기반 컴포넌트    |
|       ![Radix UI](https://img.shields.io/badge/Radix-161618?style=for-the-badge&logo=radixui&logoColor=white)        |  1.2  | 헤드리스 UI 프리미티브 |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)  | 12.23 | 애니메이션 라이브러리  |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |  1.8  | 아이콘 라이브러리      |

### 상태 & 데이터

|                                                          기술                                                          | 버전 | 설명            |
| :--------------------------------------------------------------------------------------------------------------------: | :--: | --------------- |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       | 5.0  | 상태 관리       |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                | 8.21 | 헤드리스 테이블 |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) | 2.x  | 드래그 앤 드롭  |

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
│   └── site.config.toml    # 중앙 설정 파일
└── templates/              # README 템플릿
```

---

## 🔐 권한

| 권한           | 목적                         |
| -------------- | ---------------------------- |
| `bookmarks`    | 북마크 읽기 및 쓰기          |
| `tabs`         | 빠른 추가용 탭 정보 가져오기 |
| `favicon`      | 웹사이트 파비콘 표시         |
| `storage`      | 사용자 설정 저장             |
| `sidePanel`    | Chrome 사이드 패널 활성화    |
| `contextMenus` | 우클릭 메뉴에서 링크 저장    |

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
