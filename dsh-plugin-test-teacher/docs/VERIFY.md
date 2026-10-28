# 验证记录 · dsh-test-teacher

> 目标：证明插件在**真实 DSH 运行时**里能加载、左侧栏出现入口、面板能渲染、RPC 数据正确、记录与复盘能走通。
> 结论：**宿主半 + 客户端半均通过**；真实桌面 GUI（55957）里宿主半、skill、`testcoach_*` 工具与客户端 slot 均已实测可用。

## 1. 环境

| 项 | 值 |
| --- | --- |
| 日期 | 2026-10-24 |
| DSH 运行时 | 桌面客户端 `DeepSeek Harness.exe` 内置运行时（`resources/runtime/cli/bin/dsh.cmd`） |
| 真实 GUI | `http://127.0.0.1:55957`（桌面客户端，profile `desktop`） |
| 截图实例 | `dsh web --no-open --port 3139`（隔离 `DSH_HOME`，不碰用户真实数据） |
| 隔离 HOME | `%USERPROFILE%\Desktop\Taurus car\.verify\home-tt` |
| profile bundles | `@deepseek-ai/dsh-base` → `@deepseek-ai/dsh-web-app` → `dsh-test-teacher` |
| 插件挂载 | `.verify\home-tt\profiles\web\node_modules\dsh-test-teacher` → 插件目录 junction |
| 浏览器 | Edge（msedge.exe）+ puppeteer-core，1440×900，headless |

> 注：桌面 GUI 的 Web 端口要求携带启动时打印的 token，外部无头浏览器无法直接复用（401「dsh web authentication required」），
> 因此截图在**同版本运行时 + 同一插件目录**的隔离实例上完成；真实 GUI 侧用 RPC 与 slot 检查验证（见第 3、4 节）。

## 2. 宿主半验证

安装（`plugin_manager install_bundle`）结果：`application: applied`、`warnings: []`、bundle `dsh-test-teacher 0.1.0`（`link:` 到工作区插件目录）。

隔离实例启动日志：

```
[dsh-test-teacher] 已注册 skill：test-verify-coach
[dsh-test-teacher] 已注册工具：testcoach_state / testcoach_begin / testcoach_record / testcoach_reference / testcoach_report
[dsh-test-teacher] RPC 已挂载 /plugins/dsh-test-teacher/rpc
dsh web: http://127.0.0.1:3139/?token=…
```

真实 GUI（55957）RPC 冒烟：

| 请求 | 结果 |
| --- | --- |
| `POST /plugins/dsh-test-teacher/rpc {"method":"state"}` | `ok:true`，`stats.total=12`，`modes=5`，`dimensions=7` |
| `POST … {"method":"begin","args":{"mode":"all"}}` | `ok:true`，`object.id=T01`，`object.metrics.length=6` |
| `POST … {"method":"nope"}` | `ok:false`，`unknown method "nope"` |
| `POST … {"method":"reset"}` | `ok:true`，`status=idle`，`attempted=0`（交付前恢复干净状态） |

会话内工具实测（真实 desktop profile）：`testcoach_state` 返回「状态 idle / 覆盖 0/12 / 七维均分 — / 未练 T01–T12」，与面板一致。

离线自测（`node scripts/selftest.mjs`、`node scripts/client-selftest.mjs`）全部通过，覆盖：

- 题库 12 条：五问、每组指标 ≥5、条件 ≥5、判据 ≥6（每条都有正常+异常）、工具 ≥3、记录 ≥4、回归 ≥3、工程证据；
- 分组符合用户指定：通信 T01/T04/T06/T07、控制 T02/T03/T05/T09、记录 T10/T11/T12、显示 T08；
- 记录/状态归一化（非法 id、verdict 兜底、秒数裁剪、七维 0–100 裁剪）；
- 选题推进（跳过已练、模式过滤）、统计（覆盖/分组/七维）、复盘七章与题号；
- 5 个工具真实输出：`testcoach_begin` 只给题干不含指标与判据、`testcoach_reference` 含七段底稿、`testcoach_record`/`state` 汇总；
- 用假 req/res 打通 HTTP 层：state / begin / record / report / reference / 未知方法。

## 3. 客户端半验证（截图为实测）

`node scripts/verify-ui.mjs`（`VERIFY_URL` 指向 3139 实例），检查项全部为 true：

| 检查项 | 结果 |
| --- | --- |
| 左侧栏出现「测试验证」入口 | ✅ |
| 点击后打开面板，标题「测试验证老师」 | ✅ |
| 面板列出 T01–T12（去重计数 12） | ✅ |
| 八个命令按钮齐全（开始测试/提示/参考答案/跳过/只练通信/只练控制/只练记录/结束测试） | ✅ |
| 空态提示「还没有当前题」 | ✅ |
| 点「只练通信」后当前对象为 T01/T04/T06/T07 之一 | ✅ |
| 当前对象卡显示「工程证据（可核对）」与五问 | ✅ |
| 「显示参考答案」展开底稿：指标（数值+单位+正常/异常）、判据（正常/异常/工具）、回归看哪几个数、常见坏习惯 | ✅ |
| 「记：待加强」写回状态（`stats.attempted ≥ 1`） | ✅ |
| 「生成复盘」输出 100 分制复盘（含「测试与验证能力总分」「测试对象覆盖矩阵」） | ✅ |
| pageerror / console error / 失败请求 | 0 / 0 / 0 |

截图（`docs/screenshots/`，1440×900）：

| 文件 | 内容 |
| --- | --- |
| `01-sidebar.png` | 左侧栏导航中出现「测试验证」入口 |
| `02-panel.png` | 面板首屏：标题、模式工具栏、当前对象空态、覆盖与七维、标准测试框架、题库 |
| `03-question.png` | 出题后：T01 题面、被测系统、背景、工程证据、五问、记录按钮 |
| `04-reference.png` | 教练底稿展开：指标卡、条件清单、逐步判据（正常/异常/工具） |
| `05-report.png` | 复盘卡：题库状态、八个命令、100 分制复盘正文 |

## 4. 装进真实桌面 GUI 后

- `plugin_manager install_bundle` → `application: applied`；profile `desktop` 的 `package.json` 已登记依赖与 bundle，`node_modules\dsh-test-teacher` 为 junction。
- 真实页面 slot 检查（`cordis_inspect_query` → client `Slots.listSubTree`，root `sidebar.panellist`）：
  `{"registrant":"Gb","id":"test-teacher","order":8,"active":true}` —— 客户端半已在**当前正在用的页面**里注册并激活。
- 本会话的工具列表里已出现 `testcoach_state / testcoach_begin / testcoach_record / testcoach_reference / testcoach_report`；
  skill 目录里已出现 `test-verify-coach`。
- 交付前已 `reset`：`~/.dsh/test-teacher/state.json` 为 `idle`、0 条记录，用户从第 1 题干净开始。

## 5. 过程中发现并已修的问题

1. **工程证据前缀重复**：题库 `project` 字段自带「工程证据：」，面板又加了一次标题，显示成「工程证据（可核对）：工程证据：…」；已在 `normalizeTestObject` 里剥掉前缀。
2. **五问双编号**：面板用 `<ol>` 包裹自带「1）」的题干，渲染成「1. 1）…」；改为 `list-style:none` 只保留题干自带编号。
3. **状态文件路径换行难看**：「状态文/件」被折行；改为卡片底部单独一行 `word-break:break-all` 的 note。
4. **判据行工具被推到最右**（`margin-left:auto` 在大宽度卡片里脱离上下文）；改为紧跟步骤标签。
5. **桌面 GUI 无法用外部无头浏览器截图**：55957 需要启动时打印的 token（401），改用隔离 `dsh web` 实例截图 + 真实 GUI RPC/slot 检查。

## 6. 已知限制

- 桌面客户端里**已经打开的页面**若没刷新，新插件的图标可能不出现；刷新一次 GUI（F5 / 重开窗口）即可。宿主半、skill、工具已立即可用。
- 面板不调用模型：讲评、追问、七维评分由 `test-verify-coach` skill 在会话里完成；面板只负责题库、底稿、记录、覆盖与复盘落盘。
- 题库里的「工程证据」是出题时引用的真实代码事实（协议 0xA5/0x0D/13 字节、PID kp2.0/ki1.5/kd0、TIM2 20kHz、TIM3/TIM4 编码器、FreeRTOS 20ms 任务等），随代码改动可能过期，以源码为准。

## 7. 复现

```powershell
# 1) 建隔离 HOME + profile（只放 junction，不复制任何凭据）
$home = "%USERPROFILE%\Desktop\Taurus car\.verify\home-tt"
New-Item -ItemType Directory -Force -Path "$home\profiles\web\node_modules" | Out-Null
@'
{ "name": "dsh-profile-web", "private": true,
  "dependencies": { "dsh-test-teacher": "link:USER_HOME/Desktop/Taurus car/dsh-plugin-test-teacher" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-test-teacher"] } } }
'@ | Set-Content "$home\profiles\web\package.json" -Encoding UTF8
New-Item -ItemType Junction -Path "$home\profiles\web\node_modules\dsh-test-teacher" `
  -Target "%USERPROFILE%\Desktop\Taurus car\dsh-plugin-test-teacher" | Out-Null

# 2) 启动隔离实例并抓带 token 的 URL
$env:DSH_HOME = $home
& "%USERPROFILE%\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" web --no-open --port 3139

# 3) 另开一个终端跑截图脚本
$env:VERIFY_URL = "<日志里的 URL>"
node "dsh-plugin-test-teacher\scripts\verify-ui.mjs"
```

截图脚本会先 `reset`、做完检查再 `reset`，不把验证数据留在状态文件里；验证结束后关掉 3139 实例即可（`.verify\edge-profile-test-teacher` 为临时浏览器数据，可删）。
