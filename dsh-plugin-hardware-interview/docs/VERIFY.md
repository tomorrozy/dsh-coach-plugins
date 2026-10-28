# 验证记录 · dsh-hardware-interview-teacher

> 目标：证明插件在**真实 DSH 运行时**里能加载、左侧栏入口能出现、面板能渲染、RPC 数据正确、复盘能落盘。
> 结论：**宿主半 + 客户端半均通过**（隔离 web 实例、Edge 无头浏览器实测）。

## 1. 环境

| 项 | 值 |
| --- | --- |
| 日期 | 2026-10-24 |
| DSH 版本 | 0.2.1-rc.3（桌面客户端 `DeepSeek Harness.exe` 内置运行时） |
| 验证实例 | `dsh web`（隔离 DSH_HOME），端口 3137 |
| 隔离 HOME | `%USERPROFILE%\Desktop\Taurus car\.verify\home`（不触碰用户真实 `~/.dsh`） |
| profile bundles | `@deepseek-ai/dsh-base` → `@deepseek-ai/dsh-web-app` → `dsh-hardware-interview-teacher` |
| 插件挂载 | `.verify\home\profiles\web\node_modules\dsh-hardware-interview-teacher` → 插件目录 junction |
| 浏览器 | Edge（msedge.exe）+ puppeteer-core，1440×900，headless |
| 启动命令 | `$env:DSH_HOME="%USERPROFILE%\Desktop\Taurus car\.verify\home"; dsh web --no-open --port 3137` |

> 注：DSH 默认沙箱内 Chromium 无法启动（`FATAL:mojo ... 拒绝访问 0x5`，puppeteer `spawn EPERM`），
> 截图是在完整文件权限环境下跑 `scripts\verify-ui.mjs` 得到的；这属于验证环境限制，不是插件问题。

## 2. 宿主半验证

启动日志（`.verify\home.log`，`home.err.log` 为空）：

```
[dsh-hardware-interview-teacher] 已注册 skill：hardware-interview-teacher
[dsh-hardware-interview-teacher] 已注册工具：hwinterview_state / hwinterview_begin / hwinterview_record / hwinterview_report
[dsh-hardware-interview-teacher] RPC 已挂载 /plugins/dsh-hardware-interview-teacher/rpc
dsh web: http://127.0.0.1:3137/?token=…
```

RPC 冒烟（`POST /plugins/dsh-hardware-interview-teacher/rpc`，body `{"method":"state"}`）：

- HTTP 200，`ok: true`
- `value.checklist.length === 20`（H01–H20）
- `value.stats.groups.length === 6`（供电与地 / 接口电平 / 电机驱动 / 传感器·无线 / 调试排错 / 安全规范）
- `value.modes.length === 4`（all / power / interface / motor）
- `value.bank.length === 20`（题库全部命中）
- `value.paths.workspace === "%USERPROFILE%\Desktop\Taurus car"`，状态文件落在隔离 HOME 下
- 完整响应：`.verify\rpc-state.json`

另外 `begin` → `record` → `finish` 走通：复盘写入 `面试记录\硬件面试复盘-<时间>.md`（自测里断言存在且含已考点）。

## 3. 客户端半验证（截图为实测）

`node dsh-plugin-hardware-interview\scripts\verify-ui.mjs`（`VERIFY_URL` 指向 3137 实例）：

| 检查项 | 结果 |
| --- | --- |
| 左侧栏出现「硬件面试」入口 | ✅ |
| 点击后打开全局面板，标题「电控硬件面试老师」 | ✅ |
| 面板列出 H01–H20（去重计数 20） | ✅ |
| 「扫描工程硬件配置」返回真实证据（源文件 53 / 证据 90 / 材料识别到 PDF 与两个工程） | ✅ |
| 「开始面试」出现当前题（来源 / 覆盖考核点 / 建议时间 / 计时） | ✅ |
| 「通过并下一题」写入记录（H01 通过，覆盖 1/20，分项得分更新） | ✅ |
| 「预览复盘」生成 100 分制报告（总分、分项、最佳 3 点、风险点、覆盖矩阵） | ✅ |
| 浏览器 pageerror / console error / 失败请求 | 0 / 0 / 0 |

截图（`docs/screenshots/`）：

| 文件 | 内容 |
| --- | --- |
| `01-sidebar.png` | 左侧栏导航中出现「硬件面试」入口（DSH 默认外壳） |
| `02-panel.png` | 面板首屏：标题、工具栏、当前题空态、H01–H07、覆盖进度、面试模式、面试命令 |
| `03-scan.png` | 工程扫描：材料识别 + 按 H 编号分组的引脚/外设证据 |
| `04-question.png` | 开始面试后：H01 题面、来源、考核点、计时 00:02 / 建议 02:30、提示/参考答案按钮 |
| `05-report.png` | 记录一题后预览复盘：总分、分项表、风险点、覆盖矩阵 |

## 4. 装进真实桌面客户端后

- `scripts\install.ps1 -Profile desktop` / `-Profile web` 执行成功（2026-10-24 21:38）；
  profile 备份在 `~/.dsh/profiles/*/package.json.bak-hiw-20261024-213820`，
  `node_modules\dsh-hardware-interview-teacher` junction 指向插件目录，bundles 已含插件名。
- 桌面客户端（55957）**在该 profile 变更后重建了插件图**：
  - `POST http://127.0.0.1:55957/plugins/dsh-hardware-interview-teacher/rpc {"method":"state"}` → `ok:true`，`checklist.length === 20`，状态文件为真实 `~/.dsh/hardware-interview/state.json`；
  - `GET /plugins/events` 的 graph 里出现
    `{"id":"dsh-hardware-interview-teacher","url":"plugins/??dsh-hardware-interview-teacher/client.js&rev=2d217910fe5e","inject":["@deepseek-ai/dsh-client-ui-layout","@deepseek-ai/dsh-client-locale"]}`，
    说明浏览器半也已被登记，刷新页面即可看到左侧栏入口。
  - 本会话里 `hardware-interview-teacher` skill 与 4 个 `hwinterview_*` 工具已经可用。

## 5. 过程中发现并已修的问题

1. **首次启动「预览版说明」弹窗挡点击**：验证脚本改用精确按钮点击（`clickButton('继续')`），面板验证才通过；这与插件无关，但说明面板入口在首次启动后需要先关弹窗。
2. **面板内按钮在滚动后点击坐标失效**：验证脚本改为先 `scrollIntoView` 再取坐标（`clickText`/`clickButton` 均已修）。
3. **低覆盖时评分误导**：只考 1 题也会显示 100 分。宿主半已改为「覆盖率 < 60% 时不给档位，只标『已考项得分』」，复盘说明同步更新。
4. SKILL.md 的 YAML frontmatter 会原样进模型正文：宿主半注册 skill 前已剥离 frontmatter。

## 5. 已知限制

- 桌面客户端（55957）里的**已有进程不会自动热加载新插件**：装进 desktop profile 后需要重启 DeepSeek Harness 才出现入口（本记录验证的是同版本运行时的隔离 web 实例，组合逻辑相同）。
- 面板不调用模型：点评/追问/判分在会话里由 `hardware-interview-teacher` skill 驱动；面板只负责清单、计时、记录、扫描、复盘落盘。
- 扫描器是启发式正则，仅给证据线索，最终以源码为准。

## 6. 复现

```powershell
# 1) 隔离 HOME + profile（已存在 .verify/home 可跳过）
$env:DSH_HOME = "%USERPROFILE%\Desktop\Taurus car\.verify\home"
& "%USERPROFILE%\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" web --no-open --port 3137

# 2) 从日志抓带 token 的 URL，跑截图脚本（需要可启动 Edge 的环境）
$env:VERIFY_URL = "<日志里的 URL>"
node "dsh-plugin-hardware-interview\scripts\verify-ui.mjs"
```
