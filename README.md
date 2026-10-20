# dsh-quotalk

为 DeepSeek Harness Desktop 增加划词追问：选中回答里的文字或代码，点击 **在侧边聊天中提问**。

选中阅读区域里的文字后，追问按钮出现在选区旁边。解释、举例和连续追问都在 DSH 原生右侧页签里进行，主回答继续留在眼前。

交互参考 Codex 的划词工具，使用 DSH 的公开插件接口独立实现，没有使用 Codex 内部组件。本版从 [deepseek-quotalk](https://github.com/Dengzi555/deepseek-quotalk) 的上下文处理代码适配，原网页版项目保持不变。

## 当前功能

- **输入框保持原生行为**：主输入框和侧边输入框中的框选、复制、编辑不显示插件追问菜单。
- **在侧边聊天中提问**：打开原生右侧“追问”页签，引用上方折叠显示，直接输入问题或点击“解释一下 / 举个例子”。
- **流式回复**：直接调用 Harness 的模型服务，不新开 DeepSeek 网页，不切换窗口。收到模型完成标记后立即结束回答状态。
- **上下文范围**：仅当前回答、最近 2 轮、最近 4 轮、当前会话已加载的全部对话。过长内容会截取。
- **独立追问**：不同选词各自保留本次运行中的问答；切换选词不会将上一条回答写进新选词中。重复选中同一段可继续聊。
- **阅读操作**：Enter 发送、Shift + Enter 换行、中文输入法保护、停止回复、侧边聊天内回到最新。回答过程中可编辑下一条问题，当前回答结束或停止后再发送。
- **原生布局**：跟随 DSH 的主题和右侧栏布局；关闭、宽度调整和窄屏展示使用 DSH 自己的页签控件。没有桌宠、动画素材、独立悬浮聊天窗和额外主题开关。

插件复用当前会话选择的模型；如果模型选择投影不可用，会使用该会话最近一次完整回答的模型。**是否免费取决于你在 DSH 中使用的模型和额度。** 本版不调用免费网页版账号额度，不需要向插件另填 API Key。

## 从 GitHub 安装

在已经安装好 DSH 命令的终端执行（`desktop` 为官方桌面端 profile）：

```powershell
dsh plugin --profile desktop add github:Dengzi555/dsh-quotalk
```

安装后按提示重启 DSH Desktop，并在插件管理中确认已启用。插件已经提交构建产物，安装时无需编译。

若终端找不到 `dsh`，在官方桌面端的“应用 → 管理 dsh 命令…”中安装命令，再重新打开终端。

## 从本地目录安装

适配基准：官方 DeepSeek Harness `dsh-v0.2.0-rc.2`，与你本机运行时的版本一致。已按该版本的右侧页签、会话快照和 LLM 流接口核对实现。

1. 将整个 `dsh-quotalk` 文件夹放到固定位置。根目录应包含 `package.json`、`cordis.patch.yml`、`lib/` 等。
2. 在 DSH Desktop 的插件管理中安装这个**本地插件包目录**。如果桌面发行版提供“本地目录/本地包来源”入口，选择或填写本文件夹的绝对路径。不同发行版的入口可能不同。
3. 若桌面端没有本地目录安装入口，可在已经能运行 `dsh` 的终端执行：

   ```powershell
   dsh plugin --profile desktop add "C:\你的固定目录\dsh-quotalk"
   ```

   `desktop` 应是你桌面端实际使用的 profile；其他桌面发行版请按自身配置替换。若终端提示找不到 `dsh`，请使用该发行版提供的 CLI 入口或插件管理界面。
4. 确认插件包及其中 `dsh-quotalk` 插件已启用，按客户端提示重启 DSH Desktop。
5. 打开正常工作的主对话，选择模型并完成一次回答。选中回答中至少两个字符，即可看到两个操作按钮。

交付包含 `lib/client.js` 构建产物，安装前无需 npm install 或编译，也没有依赖安装脚本。**这不是浏览器扩展，不使用 Edge/Chrome 的“加载解压缩的扩展”。** 安装后不要移动或删除插件目录。

本地目录安装不会修改原网页版 deepseek-quotalk 项目；两份插件独立维护。

## 上下文与数据

只读取当前 DSH 会话中已加载的用户文字和助手文字，不读取其他会话、整个工作区、文件内容、工具结果或模型思考。未加载的历史不属于“全部”。若会话结构无法识别，只保留选中段落，不假装关联了完整对话。

所选引用、上下文和侧边问答会随请求发送给你在 DSH 中选择的模型提供方。插件自己不读取密钥，不提供工具，不执行命令，不向主对话追加消息，不会读取或改写主输入框草稿。

追问历史保存在插件内存中，关闭侧边页签后重新划词可恢复本次运行的内容；刷新或重启后清空。切换主会话会停止旧会话正在进行的插件请求，避免把新主会话上下文混入旧追问。

服务端接口仅允许本机同源 DSH 页面访问，并使用每次运行生成的请求校验令牌；不支持远程域名、反向代理地址或 `file://` 桌面包装。目标是官方 Desktop 的本机服务模式。

## 开发与验证

需要 Node.js 20 或更高版本：

```powershell
npm run build
npm test
```

可选真实浏览器回归：`npm run test:browser`。它使用隔离的无头 Edge 页面验证选区行为，不操作 DSH 窗口或个人浏览器资料；可通过 `BROWSER_PATH` 指定其他 Chromium 浏览器。

- `src/selection.js`：选区菜单与监听清理。
- `src/sidebar.js`：紧凑的原生右侧页签内容。
- `src/store.js`：每个会话、每条引用的追问隔离。
- `src/bridge.js`：公开会话快照、模型选择与流式客户端。
- `src/core.js`：原项目复用的上下文长度限制与追问提示组装。
- `lib/index.js`：Host 插件，调用 `ctx.llm.stream`，处理取消与流式完成。
- `scripts/build.mjs`：无需第三方依赖，将源码组装为 DSH ModuleLoader 格式。

React 由 DSH 提供。包中没有浏览器 manifest、动画视频、安装 ZIP、node_modules 或原网页版安装截图。

23 项自动测试覆盖了官方接口形状的样例、模拟划词与 React 元素、上下文、模型选择、流式结束、输入框选区排除和错误。用户已在本机 DSH Desktop 安装，并确认可以使用。此反馈与自动测试不代表已覆盖所有桌面发行版及模型；不同版本的插件 API 变化可能需要进一步适配。

真实 Edge DOM 的 10 个回归场景覆盖了普通回答、嵌套输入框、各种 contenteditable 写法、键盘选区、旧菜单清除和跨编辑区选区。

若没有划词菜单，先检查包与插件是否已启用、Host/Client 激活是否报错及 DSH 版本。若侧边栏不回答，先确认主对话使用同一模型可以正常回答。

## 许可与参考

代码与文档采用 [MIT License](LICENSE)，来源说明见 [NOTICE.md](NOTICE.md)。

官方接口参考：[DeepSeek Harness RC.2](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2)、[右侧页签注册接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/client/ui-sidebar-right/src/client/tab-registry.ts)、[LLM 流接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/llm/llm/src/types.ts)。
