# Simplified Chinese Listing Copy (简体中文)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-10 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 50 |
| Firefox Add-ons summary | 90 |
| Full description, Chrome and Edge | 1,656 |
| Full description, Firefox | 887 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/zh_CN/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

`extDescription`; changing it needs a new version. Ships with the next version after 0.3.2 (50 characters):

```text
快速将网页保存到合适的文件夹：输入文件夹名称的一部分，或让 AI 建议一个。另有书签搜索和清理工具。
```

### Firefox Add-ons summary (250 characters maximum, 90 characters)

```text
快速将网页保存到合适的书签文件夹：输入文件夹名称的一部分，即使是文件夹树深处的文件夹也能找到，用键盘就能保存，或让可选的 AI 建议文件夹。另有工具栏和侧栏中的即时搜索与文件夹树。
```

## Search terms (Edge Add-ons)

```text
保存到文件夹
书签管理器
书签搜索
重复书签
失效链接
书签文件夹
AI 书签
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout 能在几秒钟内把每个网页保存到合适的文件夹，并让你无需离开浏览器，就能查找和整理书签。

几秒钟内保存到合适的文件夹
• 输入任意文件夹名称的一部分，即使是文件夹树深处的文件夹也能找到，无需离开键盘就能将当前网页保存到那里
• 输入 work/react 这样的路径；有小的拼写错误也能找到文件夹，最近使用过的文件夹排在前面
• 已在该文件夹中的网页不会重复保存
• 可选的 AI 会为网页建议最合适的文件夹，或建议一个新的文件夹路径，经你确认后才会创建
• 可选的右键菜单（在设置中开启“右键菜单”），可将链接保存到最近使用的文件夹

在工具栏中搜索
• 即时搜索所有书签，支持区分大小写、全字匹配和正则表达式
• 文件夹树支持拖放、全部展开和收起，以及新建文件夹
• 侧边栏提供同样的文件夹树、搜索和匹配的文件夹
• 键盘快捷键不会占用浏览器的 Ctrl/Cmd 快捷键
• 删除前显示确认对话框（默认开启），并可在 10 秒内撤消

书签管理器
Bookmark Scout 将浏览器的书签页面替换为一个管理器，提供文件夹树、路径导航、可排序和筛选的表格、可调整宽度的列，以及已保存的搜索（只保存筛选条件、始终显示最新结果的智能视图）。

维护工具
• 重复书签清理：先检查重复组，再移除多余的副本
• 网址清理：预览并移除跟踪参数
• 失效链接检查：找出无法访问的链接，然后检查修复方案（删除、使用重定向目标、指向存档副本或修改网址），并可撤消
• 元数据获取：建议网页标题，只应用你选中的标题
• 隐私扫描：找出书签中的敏感查询参数、网址片段、电子邮件地址和 UUID
• 统计：域名、文件夹、层级深度和重复项
• 刷新网站图标：获取每个网站自己的图标，不使用第三方图标服务
• 从 HTML 或 JSON 导入，支持预览、重复项处理和撤消
• 导出为 HTML、JSON、Markdown 或 CSV，可选的隐私检查能对敏感值做脱敏处理

失效链接检查、元数据获取、刷新网站图标以及 AI 设置中的“读取网页内容”会在首次使用时请求可选的网站访问权限。安装时绝不会授予此权限，请求不会附带 Cookie，拒绝后只是关闭相应功能。

可选的 AI 工具（默认关闭）
在设置中开启 AI，然后选择云端 AI 服务商、任何兼容 OpenAI 的端点，或在你自己电脑上运行的模型服务器；服务商需要 API 密钥时，使用你自己的密钥。
• 为当前网页建议文件夹，包括经你确认后创建新的文件夹路径
• 标签建议和简短摘要，保存前由你审核
• 文件夹重组方案，默认在做出任何更改前先预览
• 将所选书签导出为 Markdown 或 XML 上下文，供 AI 对话使用（无需 AI，不发送任何内容）
• 询问 AI：就你的书签进行对话；AI 可以查找匹配的书签、你的文件夹名称和当前网页
• 读取网页内容（默认关闭）：除标题和网址外，还发送每个网页的可读文本，以获得更好的建议
• 本地 AI 智能体（默认关闭）：让你电脑上的 AI 智能体（如 Claude Code）通过单独安装的开源程序 bookmark-scout-mcp 查找你的书签；它们请求的每次更改都要等你批准

使用 AI 功能时，所需的数据会从你的浏览器直接发送给你选择的服务商，并受该服务商条款的约束：书签标题、网址、文件夹名称以及已保存的标签和摘要；当前网页的标题和网址；你在“询问 AI”中发送的消息；以及仅在开启“读取网页内容”时，相关网页的文本。不会向 Bookmark Scout 发送任何内容。API 密钥保存在此浏览器的本地扩展程序存储中，不会同步。使用服务商可能会产生费用。

隐私
• 无需账号，没有分析、跟踪或广告
• 书签保留在你的浏览器中；标签、摘要和已保存的搜索保存在本地扩展程序存储中
• 在浏览器支持的情况下，设置会通过你的浏览器账号同步
• 基于 AGPL-3.0 开源：https://github.com/isandrel/bookmark-scout

支持 9 种界面语言。提供浅色、深色和跟随系统主题。

文档：https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout 能在几秒钟内把每个网页保存到合适的文件夹，并让你无需离开浏览器，就能查找书签。

几秒钟内保存到合适的文件夹
• 输入任意文件夹名称的一部分，即使是文件夹树深处的文件夹也能找到，无需离开键盘就能将当前网页保存到那里
• 输入 work/react 这样的路径；有小的拼写错误也能找到文件夹，最近使用过的文件夹排在前面
• 已在该文件夹中的网页不会重复保存
• 可选的 AI 会为网页建议最合适的文件夹，或建议一个新的文件夹路径，经你确认后才会创建
• 通过右键菜单将链接保存到最近使用的文件夹

在工具栏中搜索
• 即时搜索所有书签，支持区分大小写、全字匹配和正则表达式
• 文件夹树支持拖放、全部展开和收起，以及新建文件夹
• 在 Firefox 侧栏中使用同样的文件夹树、搜索和匹配的文件夹，浏览网页时侧栏保持打开
• 键盘快捷键不会占用浏览器的 Ctrl/Cmd 快捷键
• 删除前显示确认对话框（默认开启），并可在 10 秒内撤消

可选的 AI 文件夹建议（默认关闭）
在设置中开启 AI，然后选择云端 AI 服务商、任何兼容 OpenAI 的端点，或在你自己电脑上运行的模型服务器；服务商需要 API 密钥时，使用你自己的密钥。之后，Bookmark Scout 会为当前网页建议文件夹，并可在你确认后创建新的文件夹路径。

请求建议时，当前网页的标题和网址以及你的文件夹名称会从你的浏览器直接发送给你选择的服务商，并受该服务商条款的约束。不会向 Bookmark Scout 发送任何内容。API 密钥保存在此浏览器的本地扩展程序存储中，不会同步。使用服务商可能会产生费用。

隐私
• 无需账号，没有分析、跟踪或广告
• 书签保留在你的浏览器中
• 启用 Firefox Sync 后，设置会通过它同步
• 基于 AGPL-3.0 开源：https://github.com/isandrel/bookmark-scout

支持 9 种界面语言。提供浅色、深色和跟随系统主题。

书签管理器可从工具栏弹出窗口在新标签页中打开。
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the Simplified Chinese pages (the `/zh-CN/` route is assumed; confirm it once the website ships this locale):

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/zh-CN/support/ |
| Privacy policy URL | https://bookmark-scout.com/zh-CN/privacy/ |
| Support email | support@bookmark-scout.com |
