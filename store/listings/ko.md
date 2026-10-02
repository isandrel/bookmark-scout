# Korean Listing Copy (한국어)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-01 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 76 |
| Firefox Add-ons summary | 107 |
| Full description, Chrome and Edge | 1,695 |
| Full description, Firefox | 983 |

## Name

```text
북마크 스카우트
```

Read from `extName` in `apps/extension/public/_locales/ko/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged today:

```text
북마크를 빠르게 검색하고 특정 폴더에 저장합니다.
```

Optional replacement (requires editing `extDescription` and a new version):

```text
북마크를 빠르게 검색하고 정리하세요. 원클릭 폴더 저장, 중복 및 깨진 링크 찾기, 내 API 키로 쓰는 선택형 AI 기능을 제공합니다.
```

### Firefox Add-ons summary (250 characters maximum)

```text
툴바에서 북마크를 검색하고 정리하세요. 즉시 검색, 드래그 앤 드롭 폴더 트리, 원하는 폴더에 원클릭 저장, 그리고 직접 고른 제공업체와 API 키로 쓰는 선택형 AI 폴더 추천을 제공합니다.
```

## Search terms (Edge Add-ons)

```text
북마크 관리
북마크 검색
중복 북마크
깨진 링크
북마크 폴더
AI 북마크
북마크 가져오기
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout(북마크 스카우트)는 브라우저를 떠나지 않고 북마크를 찾고, 저장하고, 정리할 수 있는 확장 프로그램입니다.

툴바에서 검색과 저장
• 모든 북마크 즉시 검색(대소문자 구분, 단어 단위, 정규식 지원)
• 드래그 앤 드롭, 모두 펼치기/접기, 새 폴더 만들기를 지원하는 폴더 트리
• 현재 페이지를 원하는 폴더에 원클릭 저장(같은 폴더에는 중복 저장하지 않음)
• 오른쪽 클릭 메뉴로 링크를 최근 폴더에 저장
• 같은 트리와 검색을 쓰는 사이드 패널
• 브라우저의 Ctrl/Cmd 단축키를 가로채지 않는 키보드 단축키
• 확인 대화상자(기본값 켜짐)와 10초 실행 취소가 있는 삭제

북마크 관리자
브라우저의 북마크 페이지를 폴더 트리, 이동 경로, 정렬과 필터가 가능한 표, 너비를 조절할 수 있는 열, 저장된 검색(조건만 저장하고 항상 최신 결과를 보여 주는 스마트 보기)을 갖춘 관리자로 바꿉니다.

유지 관리 도구
• 중복 정리: 중복 그룹을 검토한 뒤 남는 사본 삭제
• URL 정리: 추적 매개변수 제거를 미리 보고 적용
• 깨진 링크 확인: 접속할 수 없는 링크 찾기
• 메타데이터 가져오기: 페이지 제목을 제안하고 선택한 것만 적용
• 개인정보 스캐너: 북마크에서 민감한 쿼리 매개변수, URL 프래그먼트, 이메일 주소, UUID 찾기
• 통계: 도메인, 폴더, 깊이, 중복
• HTML 또는 JSON 가져오기(미리 보기, 중복 처리 선택, 실행 취소 지원)
• HTML, JSON, Markdown, CSV로 내보내기(민감한 값을 가릴 수 있는 개인정보 검토 포함)

깨진 링크 확인과 메타데이터 가져오기는 처음 실행할 때 웹사이트 접근 권한(선택 권한)을 요청합니다. 설치할 때는 부여되지 않으며, 거부하면 검사를 진행하지 않습니다.

선택형 AI 도구(기본값 꺼짐)
설정에서 AI를 켜고 OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter, Ollama, CLIProxyAPI 또는 OpenAI 호환 엔드포인트를 선택하세요. API 키가 필요한 제공업체에는 본인의 키를 사용합니다.
• 현재 페이지에 맞는 폴더 추천(새 폴더 경로도 검토 후 생성)
• 저장하기 전에 검토하는 태그 추천과 짧은 요약
• 폴더 재구성 계획(기본적으로 적용 전에 미리 보기)
• 선택한 북마크를 AI 채팅용 Markdown 또는 XML로 내보내기(AI 없이 동작하며 아무것도 전송하지 않음)

AI 기능을 사용하면 해당 기능에 필요한 북마크 제목, URL, 폴더 이름이 브라우저에서 사용자가 선택한 제공업체로 직접 전송되며, 해당 제공업체의 약관에 따라 처리됩니다. Bookmark Scout로는 아무것도 전송되지 않습니다. API 키는 이 브라우저의 로컬 확장 프로그램 저장소에 보관되며 동기화되지 않습니다. 제공업체 사용에는 요금이 발생할 수 있습니다.

개인정보
• 계정, 분석, 추적, 광고가 없습니다
• 북마크는 브라우저 안에 머물고, 태그, 요약, 저장된 검색은 로컬 확장 프로그램 저장소에 보관됩니다
• 설정은 지원하는 브라우저에서 브라우저 계정을 통해 동기화됩니다
• AGPL-3.0 오픈 소스: https://github.com/isandrel/bookmark-scout

영어, 일본어, 한국어를 지원합니다. 라이트, 다크, 시스템 테마를 선택할 수 있습니다.

문서: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout(북마크 스카우트)는 브라우저를 떠나지 않고 북마크를 찾고 저장할 수 있는 확장 프로그램입니다.

툴바에서 검색과 저장
• 모든 북마크 즉시 검색(대소문자 구분, 단어 단위, 정규식 지원)
• 드래그 앤 드롭, 모두 펼치기/접기, 새 폴더 만들기를 지원하는 폴더 트리
• 현재 페이지를 원하는 폴더에 원클릭 저장(같은 폴더에는 중복 저장하지 않음)
• 오른쪽 클릭 메뉴로 링크를 최근 폴더에 저장
• 브라우저의 Ctrl/Cmd 단축키를 가로채지 않는 키보드 단축키
• 확인 대화상자(기본값 켜짐)와 10초 실행 취소가 있는 삭제

선택형 AI 폴더 추천(기본값 꺼짐)
설정에서 AI를 켜고 OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter, Ollama, CLIProxyAPI 또는 OpenAI 호환 엔드포인트를 선택하세요. API 키가 필요한 제공업체에는 본인의 키를 사용합니다. 현재 페이지에 맞는 폴더를 추천하고, 검토 후 새 폴더 경로를 만들 수도 있습니다.

추천을 요청하면 현재 페이지의 제목과 URL, 그리고 폴더 이름이 브라우저에서 사용자가 선택한 제공업체로 직접 전송되며, 해당 제공업체의 약관에 따라 처리됩니다. Bookmark Scout로는 아무것도 전송되지 않습니다. API 키는 이 브라우저의 로컬 확장 프로그램 저장소에 보관되며 동기화되지 않습니다. 제공업체 사용에는 요금이 발생할 수 있습니다.

개인정보
• 계정, 분석, 추적, 광고가 없습니다
• 북마크는 브라우저 안에 머뭅니다
• 설정은 Firefox Sync가 켜져 있으면 동기화됩니다
• AGPL-3.0 오픈 소스: https://github.com/isandrel/bookmark-scout

영어, 일본어, 한국어를 지원합니다. 라이트, 다크, 시스템 테마를 선택할 수 있습니다.

북마크 관리자, 유지 관리 도구, 가져오기/내보내기는 현재 Firefox에서 사용할 수 없습니다.
```

## Category

Same as `en.md`. Stores set the category once for all locales.
