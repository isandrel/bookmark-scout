import type { DocsCopy } from "../copy";

/** Docs UI copy in ko; see `en` in ../copy.ts for what each entry is. */
export const ko: DocsCopy = {
  nav: { website: "웹사이트" },

  release: { latest: "최신 GitHub 릴리스" },

  store: {
    listed: (product: string, store: string) =>
      `${store} 등록 페이지에서 ${product}를 설치하세요.`,
    notListed: (product: string, store: string) =>
      `${product}는 곧 ${store}에 출시됩니다.`,
    noneListed: (product: string) =>
      `${product}는 아직 어느 브라우저 스토어에도 등록되지 않았습니다.`,
    listedOn: (product: string) =>
      `${product}는 다음 스토어에 등록되어 있습니다:`,
  },

  home: {
    install: (product: string) => `${product} 설치`,
    addTo: (browser: string) => `${browser}에 추가 (무료)`,
    otherBrowsers: "다른 브라우저",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: ["중복", "깨진 링크", "가져오기", "단축키", "API 키"],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "페이지 찾기",
    label: "할 일로 문서 검색",
    placeholder: "무엇을 하고 싶으신가요?",
    idle: (total: number) =>
      `할 일을 고르거나, 입력해서 전체 ${total}개 페이지를 필터링하세요. Enter 키를 누르면 첫 번째 결과가 열립니다.`,
    count: (shown: number, total: number) => `${total}개 페이지 중 ${shown}개`,
    noMatch: (query: string) =>
      `“${query}”에 일치하는 페이지가 없습니다. 단어 수를 줄이거나, 페이지 맨 위의 검색을 사용해 모든 페이지의 내용을 검색하세요.`,
  },

  shortcut: {
    or: " 또는 ",
    notes: {
      mac: "Mac의 {keys}",
      other: "Windows와 Linux의 {keys}",
      pair: "{primary}({secondary})",
      click: "클릭",
    },
  },

  languages: {
    en: "영어",
    "zh-CN": "중국어 간체",
    es: "스페인어",
    fr: "프랑스어",
    "pt-BR": "브라질 포르투갈어",
    de: "독일어",
    ja: "일본어",
    ko: "한국어",
    "zh-TW": "중국어 번체",
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated: "이 페이지는 아직 번역되지 않아 영어로 표시됩니다.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      '두 개의 팝업: 검색창에 "fin"을 입력해 폴더에 저장에서 Fine-tuning 폴더(AI / LLMs)를 선택한 화면과, 다른 페이지에 대한 AI 추천(새 AI/LLMs/Inference 폴더와 기존 AI/LLMs 폴더)',
    "quick-save":
      "개발자 가이드 페이지 위쪽 모서리에 표시된 빠른 저장 알림: Agents(AI / Agents)에 저장되었고, 실행 취소와 이동할 폴더 Papers가 있음",
    manager:
      "AI / LLMs / Fine-tuning을 연 북마크 관리자: AI, Dev, Design, Tools, Reading list 폴더 트리, 검색창 하나, 사이트 아이콘이 붙은 북마크 표",
    duplicates:
      "관리자 위에 표시된 중복 정리 검토 화면. 각 그룹에서 남길 북마크에 유지 표시가 붙어 있음",
    settings:
      "설정의 기본 설정 탭: 빠른 저장 폴더, 저장할 폴더, 마우스 오른쪽 버튼 메뉴(꺼짐), 테마, 언어",
    "options-ai":
      "설정의 AI 탭: AI 기능이 켜져 있고, 서비스 추가 아래에 사용자가 추가한 AI 서비스 두 개가 있음. 키가 가려진 기본 클라우드 AI 서비스와 내 컴퓨터에서 실행되는 모델",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "한국어",
    "Ask AI(AI chat button)": "AI에게 묻기",
    "Back to Home(404 page)": "홈으로 돌아가기",
    "Choose a language(language switcher)": "언어 선택",
    "Choose a language(language switcher)(aria-label)": "언어 선택",
    "Close Banner(banner)(aria-label)": "배너 닫기",
    "Close Search(search dialog)(aria-label)": "검색 닫기",
    "Close Sidebar(aria-label)": "사이드바 닫기",
    "Close Sidebar(sidebar)(aria-label)": "사이드바 닫기",
    "Collapse Sidebar(sidebar)(aria-label)": "사이드바 접기",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "제목 링크를 복사했습니다",
    "Copied Link(accordion)(aria-label)": "링크를 복사했습니다",
    "Copied Markdown(page actions)": "Markdown을 복사했습니다",
    "Copied Text(code block)(aria-label)": "텍스트를 복사했습니다",
    "Copy Anchor Link(heading anchor)(aria-label)": "제목 링크 복사",
    "Copy Link(accordion)(aria-label)": "링크 복사",
    "Copy Markdown(page actions)": "Markdown 복사",
    "Copy Text(code block)(aria-label)": "텍스트 복사",
    "Dark(theme switcher)(aria-label)": "다크",
    "Default(type table)": "기본값",
    "Edit on GitHub(edit page)": "GitHub에서 편집",
    "Hide Sidebar(sidebar)": "사이드바 숨기기",
    "Last updated on(page footer)": "마지막 업데이트:",
    "Layout Tab(layout tab trigger)": "레이아웃 탭",
    "Light(theme switcher)(aria-label)": "라이트",
    "Next Page(pagination)": "다음",
    "No Headings(table of contents)": "제목 없음",
    "No results found(search dialog)": "검색 결과가 없습니다",
    "On this page(table of contents)": "이 페이지의 내용",
    "Open Search(search trigger)(aria-label)": "검색 열기",
    "Open Sidebar(sidebar)(aria-label)": "사이드바 열기",
    "Open in ChatGPT(page actions)": "ChatGPT에서 열기",
    "Open in Claude(page actions)": "Claude에서 열기",
    "Open in Cursor(page actions)": "Cursor에서 열기",
    "Open in GitHub(page actions)": "GitHub에서 열기",
    "Open in Scira AI(page actions)": "Scira AI에서 열기",
    "Open(page actions)": "열기",
    "Page Not Found(404 page)": "페이지를 찾을 수 없습니다",
    "Parameters(type table)": "매개변수",
    "Previous Page(pagination)": "이전",
    "Prop(type table)": "속성",
    "Read {url}, I want to ask questions about it.(page actions)":
      "{url}을(를) 읽어 주세요. 이 페이지에 대해 질문하고 싶습니다.",
    "Returns(type table)": "반환값",
    "Search(search dialog)": "검색",
    "Search(search trigger)": "검색",
    "Show Sidebar(sidebar)": "사이드바 표시",
    "System(theme switcher)(aria-label)": "시스템",
    "Table of Contents(inline table of contents)": "목차",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "찾으시는 페이지가 삭제되었거나, 이름이 바뀌었거나, 일시적으로 사용할 수 없는 상태일 수 있습니다.",
    "Toggle Menu(mobile menu)(aria-label)": "메뉴 열기/닫기",
    "Toggle Theme(theme switcher)(aria-label)": "테마 전환",
    "Type(type table)": "유형",
    "View as Markdown(page actions)": "Markdown으로 보기",
  },
};
