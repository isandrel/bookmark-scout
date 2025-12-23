<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <strong>한국어</strong>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/isandrel/bookmark-scout/main/public/icon-128.png" alt="Bookmark Scout Logo" width="80" height="80">
</p>

<h1 align="center">🔖 Bookmark Scout</h1>

<p align="center">
  <strong>북마크를 빠르게 검색하고, 정리하고, 특정 폴더에 저장할 수 있는 모던 Chrome 확장 프로그램</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-지원-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-지원-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
  <img src="https://img.shields.io/badge/Edge-지원-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/Safari-미지원-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 🌐 브라우저 지원

| 브라우저 | 상태     | 비고                                    |
| -------- | -------- | --------------------------------------- |
| Chrome   | ✅ 지원   | Manifest V3 완전 지원                   |
| Firefox  | ✅ 지원   | Manifest V2 완전 지원                   |
| Edge     | ✅ 지원   | Manifest V3 완전 지원 (Chromium 기반)   |
| Safari   | ❌ 미지원 | Apple이 `bookmarks` API를 구현하지 않음 |

### Safari가 지원되지 않는 이유

Safari Web Extensions는 이 확장 프로그램의 핵심 기능에 필수적인 `browser.bookmarks` API를 지원하지 않습니다. Apple은 Safari 14(2020년)에서 Web Extension 지원을 발표했지만, bookmarks API는 구현되지 않았습니다. 이것은 Apple 플랫폼의 제한이며, WXT나 확장 프로그램 프레임워크의 문제가 아닙니다.

Safari API 지원 업데이트에 대해서는 [WebKit Bug Tracker](https://bugs.webkit.org/)를 참조하세요.

---

## ✨ 기능

### ✅ 현재 중점: 팝업 & 사이드 패널

- [x] 🔍 **즉시 검색** — 디바운스 검색과 폴더 필터링으로 북마크를 빠르게 검색
- [x] 📂 **드래그 앤 드롭** — 직관적인 드래그 앤 드롭으로 북마크와 폴더 정리
- [x] ⚡ **빠른 추가** — 한 번의 클릭으로 현재 탭을 원하는 폴더에 저장
- [x] 📱 **사이드 패널** — Chrome 사이드 패널에서 북마크에 접근
- [x] 🌙 **다크 모드** — 부드러운 전환 효과가 있는 아름다운 다크 테마
- [x] 🎯 **모두 펼치기/접기** — 중첩된 폴더를 빠르게 펼치거나 접기
- [x] 📁 **폴더 생성** — 팝업에서 직접 새 폴더 생성
- [x] 🗑️ **항목 삭제** — 확인 후 북마크와 폴더 삭제

### 🚧 로드맵

- [ ] 🗂️ **전체 북마크 관리자** — Chrome 기본 북마크 페이지를 모던한 테이블 뷰로 대체
- [ ] ⚙️ **옵션 페이지** — 확장 프로그램 설정 및 환경설정 커스터마이즈
- [ ] 🏷️ **태그** — 더 나은 정리를 위해 북마크에 커스텀 태그 추가
- [ ] 🔄 **동기화** — 클라우드 백업을 통한 크로스 디바이스 북마크 동기화
- [ ] 📊 **분석** — 북마크 사용 통계 보기
- [ ] 🔗 **중복 감지** — 중복된 북마크 찾기 및 제거
- [ ] 💀 **데드 링크 체커** — 깨진 링크 감지 및 정리
- [ ] 📤 **가져오기/내보내기** — JSON으로 북마크 백업 및 복원
- [ ] ⌨️ **키보드 단축키** — 단축키로 북마크 탐색 및 관리
- [ ] 🔒 **비공개 북마크** — 비밀번호로 보호된 북마크 폴더

---

## 🛠️ 기술 스택

| 레이어             | 기술                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **프레임워크**     | React 19 + TypeScript                                                                            |
| **빌드**           | [WXT](https://wxt.dev) + Rolldown-Vite + Nx (캐싱이 있는 monorepo)                               |
| **런타임**         | Bun 1.3                                                                                          |
| **상태 관리**      | [Zustand](https://zustand-demo.pmnd.rs/) (경량 상태 관리)                                        |
| **스타일링**       | TailwindCSS 4 + CSS 변수                                                                         |
| **UI 컴포넌트**    | [shadcn/ui](https://ui.shadcn.com) (Radix 프리미티브)                                            |
| **드래그 앤 드롭** | [@atlaskit/pragmatic-drag-and-drop](https://atlassian.design/components/pragmatic-drag-and-drop) |
| **애니메이션**     | Framer Motion                                                                                    |
| **테이블**         | TanStack React Table                                                                             |

> **📍 현재 중점:** 팝업 개발. 옵션 페이지와 북마크 오버라이드는 일시적으로 비활성화됨.

---

## 📦 설치

### 소스에서 설치

```bash
# 리포지토리 클론
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# 의존성 설치
bun install

# 확장 프로그램 빌드
bun run build
```

### Chrome에 로드

1. `chrome://extensions/` 열기
2. **개발자 모드** 활성화 (오른쪽 상단)
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. `dist` 폴더 선택

---

## 🚀 개발

```bash
# 개발 서버 시작
bun run dev

# 프로덕션용 빌드
bun run build

# 코드 린트
bun run lint
```

---

## 📁 프로젝트 구조

```
src/
├── components/
│   ├── page/
│   │   ├── BookmarksPage.tsx    # 전체 북마크 관리자
│   │   ├── OptionsPage.tsx      # 확장 프로그램 설정
│   │   └── PopupPage.tsx        # 메인 팝업 (검색 & DnD)
│   └── ui/                      # shadcn 컴포넌트
├── hooks/                       # 커스텀 React Hooks
├── lib/                         # 유틸리티 함수
├── popup.html                   # 팝업 엔트리
├── bookmarks.html               # 북마크 페이지 오버라이드
├── options.html                 # 옵션 페이지
└── sidepanel.html               # 사이드 패널
```

---

## 🔐 권한

| 권한        | 용도                          |
| ----------- | ----------------------------- |
| `bookmarks` | 북마크 읽기 및 쓰기           |
| `tabs`      | 빠른 추가를 위한 현재 탭 정보 |
| `favicon`   | 웹사이트 파비콘 표시          |
| `storage`   | 사용자 환경설정 저장          |
| `sidePanel` | Chrome 사이드 패널 활성화     |

---

## 🤝 기여

기여를 환영합니다! Pull Request를 자유롭게 제출해 주세요.

1. 리포지토리 포크
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'feat: 멋진 기능 추가'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

---

## 📄 라이선스

이 프로젝트는 GNU Affero General Public License v3.0에 따라 라이선스가 부여됩니다 - 자세한 내용은 [LICENSE](../LICENSE) 파일을 참조하세요.

---

<p align="center">
  <a href="https://github.com/isandrel">isandrel</a>이 ❤️로 만들었습니다
</p>
