{# source: 755c10623769 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="{{ site.name }} 로고" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">모든 페이지를 알맞은 북마크 폴더에, 몇 초 만에.</h3>

<p align="center">
  폴더 이름을 몇 글자 입력하거나 단축키 하나만 누르면, 페이지가 알맞은 폴더에 저장됩니다.<br>
  무료이며, 계정도 광고도 없습니다. 개발자에게는 아무것도 전송되지 않습니다.
</p>

<p align="center">
{{ md.store_badges("{browser}에 추가") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/웹사이트-방문-{{ site.brand_color }}?style=flat-square" alt="웹사이트"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/가이드-읽기-{{ site.brand_color }}?style=flat-square" alt="가이드"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/오픈%20소스-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="오픈 소스 라이선스"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="{{ site.name }} 팝업. &quot;fin&quot;을 입력하면 AI / LLMs 안의 Fine-tuning 폴더가 찾아지고, Enter를 누르면 그곳에 페이지가 저장됨. 옆에는 프롬프트 캐싱에 관한 글에 대한 선택형 AI 추천(새 폴더 포함)." width="800">
  </picture>
</p>

## ✨ 할 수 있는 일

- 📁 **이름을 입력해 알맞은 폴더에 저장.** 몇 글자 입력하고 Enter를 누르세요. 다른 폴더 깊숙이 들어 있는 폴더도 찾아 주며, 오타가 조금 있어도 괜찮습니다.
- ⚡ **단축키 하나로 저장.** 어느 페이지에서나 {{ shortcuts["commands.quick-save"].both }}를 누르세요. 저장된 곳을 알려 주는 작은 메시지에서 **실행 취소**하거나 다른 폴더로 옮길 수 있습니다.
- 🔎 **저장한 북마크를 바로 찾기.** 툴바, 사이드 패널, 또는 전체 화면 북마크 관리자에서 입력하는 즉시 모든 북마크를 검색합니다.
- 🧹 **몇 년 치 북마크를 깔끔하게.** 중복을 지우고, 더 이상 열리지 않는 링크를 찾고, 웹 주소에서 추적용 코드를 없앱니다. 모든 변경은 적용하기 전에 확인할 수 있고, 실행 취소도 됩니다.
- 🕘 **모든 변경을 보고 삭제한 것을 되찾기.** 기록에는 Bookmark Scout 밖에서 한 변경까지 북마크의 모든 변경이 나오고, 브라우저를 다시 시작한 뒤에도 삭제한 것을 되돌릴 수 있습니다. 기록은 내 컴퓨터에만 남습니다.
- ✨ **AI 추천은 선택 사항.** 내 AI 계정이나, Chrome에 내장된 AI처럼 내 컴퓨터에서 돌아가는 무료 AI 모델로 AI가 폴더를 골라 주게 할 수 있습니다. AI는 직접 켜기 전까지 꺼져 있습니다.
- 🔒 **개인정보를 생각한 설계.** 계정, 광고, 추적이 없고, 개발자에게는 아무것도 전송되지 않습니다. 저장과 검색은 인터넷 연결 없이도 됩니다.

🌍 지원 언어: {{ locales|map(attribute="name")|join(" · ") }}

## 📦 설치

{{ md.store_links("{store}에 곧 출시됩니다. 그전까지는 [직접 설치]({docs}/installation#{id})할 수 있습니다(고급).") }}

설치했다면 첫 페이지를 저장해 보세요.

1. **고정하기.** 브라우저 툴바의 퍼즐 조각 아이콘을 클릭한 다음, {{ site.name }} 옆의 핀을 클릭합니다.
2. **보관하고 싶은 페이지를 열고** {{ site.name }} 아이콘을 클릭합니다.
3. **폴더 이름을 몇 글자 입력하고** Enter를 누릅니다. 목록의 첫 번째 폴더에 페이지가 저장됩니다. 다른 폴더를 고르려면 먼저 ↓를 누르세요. 끝입니다.

다음부터는 그 페이지에서 {{ shortcuts["commands.quick-save"].both }}만 누르면 됩니다. 자세한 내용은 [저장과 정리 가이드]({{ docs_url }}/guides/save-and-organize)를 참고하세요.

## 🔒 개인정보

{{ site.name }}에는 계정도 서버도 없으므로, 북마크나 설정을 비롯한 어떤 것도 개발자에게 전달되지 않습니다. 북마크는 브라우저 안에서 읽고 변경됩니다. 데이터는 그것이 필요한 기능을 사용할 때만 브라우저 밖으로 나갑니다. 예를 들어 AI(내가 고른 AI 회사로 전송)나 끊긴 링크 확인(북마크한 웹사이트에 접속)이 그렇습니다. 자세한 내용은 [개인정보 처리방침]({{ pages.privacy }})을 참고하세요.

## 🔐 권한

브라우저가 묻는 내용:

- **설치할 때:** "북마크 읽기 및 변경". {{ site.name }}를 쓰기 시작하는 데 필요한 것은 이것뿐입니다.
- **더 많은 권한이 필요한 기능을 쓸 때만**, {{ site.name }}의 짧은 설명 뒤에 묻습니다. 예를 들어 끊긴 링크 확인은 해당 웹사이트에 접근할 권한을, 사이드 패널에서 저장하기는 열려 있는 탭을 확인할 권한을 요청합니다. 거절해도 그 기능만 꺼집니다.

[모든 권한과 필요한 이유]({{ docs_url }}/permissions)를 확인하세요.

## ❓ 자주 묻는 질문

**정말 무료인가요?**<br>
네. 광고도 유료 요금제도 없고, 코드는 누구나 읽을 수 있게 공개되어 있습니다. AI 회사 계정으로 AI를 켜면 그 회사가 사용료를 청구할 수 있습니다.

**AI가 꼭 필요한가요?**<br>
아니요. 저장, 검색, 정리는 모두 AI 없이 동작합니다.

**Firefox, Edge, Safari에서 쓸 수 있나요?**<br>
Firefox와 Edge에서는 쓸 수 있습니다([설치](#-설치) 참고). Safari는 확장 프로그램이 북마크를 다룰 수 없어서 지원하지 않습니다.

더 많은 답은 [FAQ]({{ docs_url }}/faq)에 있습니다.

## 💬 도움말과 링크

- 🌐 웹사이트: [{{ site.url }}]({{ site.url }})
- 📖 가이드: [{{ docs_url }}]({{ docs_url }})
- ✉️ 이메일: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 문제를 발견했거나 아이디어가 있다면 [GitHub에서 알려 주세요]({{ site.repo.new_issue }})

{{ site.name }}는 회사가 아닌 개인 개발자 [@{{ site.author.name }}]({{ site.author.url }})가 만듭니다. 광고도 계정도 없으며, 오픈 소스입니다.

## 🛠️ 개발자와 AI 에이전트를 위한 안내

소스에서 빌드하기, 기술 스택, 개발 현황, 테스트는 [DEVELOPMENT.md]({{ links.DEVELOPMENT }})(영어)에 있습니다. 기여하고 싶다면 [CONTRIBUTING.md]({{ links.CONTRIBUTING }})를 읽어 주세요. Claude Code 같은 내 컴퓨터의 AI 코딩 에이전트가 승인을 거쳐 북마크를 검색하고 정리하게 할 수도 있습니다. [로컬 AI 에이전트와 함께 사용하기]({{ docs_url }}/guides/local-agents)를 참고하세요.

---

<p align="center">
  <a href="{{ root }}LICENSE">{{ site.license.spdx }} 라이선스</a>의 무료 오픈 소스입니다.
</p>
