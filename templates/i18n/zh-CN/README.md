{# source: 4d963e58c520 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="{{ site.name }} 徽标" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">几秒钟内，把每个网页保存到合适的书签文件夹。</h3>

<p align="center">
  输入文件夹名称中的几个字，或按一下快捷键，网页就会保存到它所属的文件夹。<br>
  免费使用，无需账号，没有广告。不会向开发者发送任何内容。
</p>

<p align="center">
{{ md.store_badges("添加至 {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/网站-访问-{{ site.brand_color }}?style=flat-square" alt="网站"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/指南-阅读-{{ site.brand_color }}?style=flat-square" alt="指南"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/开源-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="开源许可证"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="{{ site.name }} 弹出窗口：输入“fin”即可找到 AI / LLMs 中的 Fine-tuning 文件夹，按 Enter 即可将网页保存到那里。旁边是针对一篇提示缓存文章的可选 AI 建议，其中包括一个新文件夹。" width="800">
  </picture>
</p>

## ✨ 功能

- 📁 **输入名称，保存到合适的文件夹**。输入几个字后按 Enter 即可，嵌套很深的文件夹也能找到，有小的拼写错误也能匹配。
- ⚡ **一个快捷键即可保存**。在任意网页上按 {{ shortcuts["commands.quick-save"].both }}，页面上会出现一条简短提示，显示网页保存到了哪里，并提供**撤消**和其他可以移动到的文件夹。
- 🔎 **找到保存过的任何内容**。在工具栏、侧边栏或整页的书签管理器中，边输入边搜索所有书签。
- 🧹 **整理多年积攒的书签**。移除重复的书签，找出已失效的链接，并去除网址中的跟踪代码。每项更改都会先显示给你查看，而且可以撤消。
- ✨ **可选的 AI 建议**。让 AI 替你选择文件夹：可以使用自己的 AI 账号，也可以使用在自己电脑上运行的免费 AI 模型，例如 Chrome 内置的模型。在你开启之前，AI 始终处于关闭状态。
- 🔒 **从设计上保护隐私**。无需账号，没有广告，没有跟踪，也不会向开发者发送任何内容。即使离线，也能保存和搜索。

🌍 支持的语言：{{ locales|map(attribute="name")|join(" · ") }}

## 📦 安装

{{ md.store_links("即将上架 {store}。在此之前，可以[手动安装]({docs}/installation#{id})（适合高级用户）。") }}

然后保存第一个网页：

1. **固定扩展程序**。点击浏览器工具栏中的拼图图标，然后点击 {{ site.name }} 旁边的固定图标。
2. **打开想保存的网页**，然后点击 {{ site.name }} 图标。
3. **输入文件夹名称中的几个字**，然后按 Enter：网页会保存到列表中的第一个文件夹。如需选择其他文件夹，请先按 ↓。就这么简单。

下次只需在网页上按 {{ shortcuts["commands.quick-save"].both }}即可。更多用法请参阅[保存和整理指南]({{ docs_url }}/guides/save-and-organize)。

## 🔒 隐私

{{ site.name }} 无需账号，也没有服务器，因此开发者永远不会收到你的书签、设置或任何其他内容。书签的读取和修改都在浏览器中完成。只有在使用需要联网的功能时，数据才会离开浏览器，例如 AI（发送给你选择的 AI 公司）或失效链接检查（访问已加入书签的网站）。详情请参阅[隐私政策]({{ pages.privacy }})。

## 🔐 权限

浏览器会请求以下权限：

- **安装时**：“读取和更改您的书签”。这是 {{ site.name }} 开始工作唯一需要的权限。
- **仅在使用需要更多权限的功能时**，{{ site.name }} 会先简短说明原因，再由浏览器询问。例如，检查失效链接时会请求访问这些网站，从侧边栏保存时会请求查看当前打开的标签页。如果拒绝，只有该功能无法使用。

请参阅[每项权限及其用途]({{ docs_url }}/permissions)。

## ❓ 常见问题

**真的免费吗？**<br>
是的。没有广告，没有付费方案，代码也公开供任何人阅读。如果使用某家 AI 公司的账号开启 AI，该公司可能会收取使用费。

**必须使用 AI 吗？**<br>
不必。保存、搜索和清理都无需 AI 即可使用。

**能在 Firefox、Edge 或 Safari 中使用吗？**<br>
Firefox 和 Edge：可以（请参阅[安装](#-安装)）。Safari：不行，因为 Safari 不允许扩展程序操作书签。

更多解答请参阅[常见问题]({{ docs_url }}/faq)。

## 💬 帮助和链接

- 🌐 网站：[{{ site.url }}]({{ site.url }})
- 📖 指南：[{{ docs_url }}]({{ docs_url }})
- ✉️ 电子邮件：[{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 发现问题或有好的想法？[在 GitHub 上告诉我们]({{ site.repo.new_issue }})

{{ site.name }} 由独立开发者 [@{{ site.author.name }}]({{ site.author.url }}) 制作，而不是一家公司：没有广告，无需账号，并且开源。

## 🛠️ 面向开发者和 AI 智能体

从源代码构建、技术栈、项目状态和测试请参阅 [DEVELOPMENT.md]({{ links.DEVELOPMENT }})（英文）。如果想参与贡献，请阅读 [CONTRIBUTING.md]({{ links.CONTRIBUTING }})。你电脑上的 AI 编程智能体（例如 Claude Code）在获得你的批准后，可以搜索和整理你的书签：请参阅[配合本地 AI 智能体使用]({{ docs_url }}/guides/local-agents)。

---

<p align="center">
  基于 <a href="{{ root }}LICENSE">{{ site.license.spdx }} 许可证</a>免费开源。
</p>
