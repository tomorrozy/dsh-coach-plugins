# dsh-hardware-interview-teacher · 电控硬件面试老师（DSH 插件）

> 带**左侧栏入口**的 DeepSeek Harness 插件：把「RoboMaster 电控硬件评审」这一套逐项考察流程搬进 DSH。
> 只考硬件（供电/地/电平/上拉/驱动/保护/抗干扰/接插件/调试测量），不考软件函数逻辑。

题目来源：`Taurus 2027电控组三面.pdf`（手势控制小车）＋ `遥控/`、`FreeRTOS小车/` 两个 STM32F103 工程的硬件初始化配置。

![左侧栏面板](docs/screenshots/02-panel.png)

> 本机状态：已安装进 `desktop` 与 `web` 两个 profile，并已在运行中的 DeepSeek Harness 里加载（宿主半日志 + `/plugins/events` 客户端 graph 均可见 `dsh-hardware-interview-teacher`）。
> 若左侧栏还没出现「硬件面试」，刷新一次 GUI（或重启 DeepSeek Harness）即可；重启不会影响会话记录。
> 真实验证记录见 [docs/VERIFY.md](docs/VERIFY.md)。

## 它是什么

| 组成 | 说明 |
| --- | --- |
| 左侧栏入口 | 图标行「**硬件面试**」（`sidebar.panellist`，order 4），点击打开全局面板 |
| 硬件面试台（面板） | H01–H20 覆盖进度、当前题（来源/覆盖考核点/建议时间/计时）、提示与参考答案、逐题记录（通过/待加强/跳过）、工程硬件配置扫描、复盘预览与落盘、可复制的面试命令 |
| `hardware-interview-teacher` skill | 面试老师人设与流程（先拆点→每轮 1 题→最多 2 层追问→结束出复盘），会话里自动可见、可主动调用 |
| `hwinterview_*` 工具 | 会话里的「老师」用工具把逐题结果实时写进面板状态：`hwinterview_state` / `hwinterview_begin` / `hwinterview_record` / `hwinterview_report` |
| 状态 | `<DSH_HOME>/hardware-interview/state.json`（原子写） |
| 复盘 | `<workspace>/面试记录/硬件面试复盘-<YYYYMMDD-HHmm>.md` |

**分工**：面试对话在会话里进行（老师由 skill 驱动，点评/追问/判分靠模型）；面板负责清单、计时、选题、记录、扫描、复盘落盘。面板不自动判分——记录里的「通过/待加强/跳过」由老师（或你自己）写入，复盘评分按该记录计算。

## 目录结构

```
dsh-plugin-hardware-interview/
├── package.json                 # dsh.bundle.patch + dsh.client.inject
├── cordis.patch.yml             # 插入 profile 组合；config.workspace 指定扫描目录
├── lib/
│   ├── index.js                 # 宿主半：RPC、状态、扫描、skill、tools、复盘
│   └── client.js                # 客户端半：sidebar.panellist + main 面板
├── data/
│   ├── checklist.json           # H01–H20 硬件考核点（PDF 拆解，含出处/建议时间）
│   ├── question-bank.json       # 每个考核点的题面/提示/参考答案/追问/风险/排查框架
│   ├── code-hardware.json       # 两工程的硬件配置提取结果（只读展示，可重生成）
│   ├── code-hardware.md         # 上面这份的人工可读版（两工程对照 + 风险）
│   └── pdf-points.md            # PDF 硬件要求逐条 → H 编号映射
├── skill/SKILL.md               # 面试老师 skill 正文（人设 + 流程 + 工具约定）
├── scripts/
│   ├── install.ps1              # 装进 desktop/web profile（软链 + bundles 登记）
│   ├── uninstall.ps1            # 卸载（只移除本插件登记与链接）
│   ├── selftest.mjs             # 宿主半离线自测（RPC 往返 + 复盘落盘 + 扫描）
│   └── client-selftest.mjs      # 客户端半离线自测（模块格式 + slot 注册）
├── docs/
│   ├── VERIFY.md                # 隔离环境验证记录（版本/命令/RPC/截图说明）
│   └── screenshots/             # 面板截图
└── README.md
```

## 安装

### 一键安装（推荐）

```powershell
# 装进桌面客户端 profile；再执行一次 web 可同时装 web profile
powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\Desktop\Taurus car\dsh-plugin-hardware-interview\scripts\install.ps1" -Profile desktop
powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\Desktop\Taurus car\dsh-plugin-hardware-interview\scripts\install.ps1" -Profile web
```

> 本机已在 2026-10-24 执行过上述两条命令（profile 备份：`~/.dsh/profiles/*/package.json.bak-hiw-*`）。

脚本做三件事（幂等）：备份 profile 的 `package.json` → 登记依赖 `link:<插件目录>` 与 `dsh.profile.bundles` → 在 profile 的 `node_modules` 建 junction。

**装完必须重启对应进程**（插件在进程启动时组合）：

- 桌面客户端：退出 DeepSeek Harness，重新打开（会话会保留）；
- Web：重启 `dsh web` 后刷新页面。

> 实测：桌面客户端在 profile 变更后会重建插件图，宿主半可即时加载；客户端入口若未出现，刷新页面/重启即可。

### 手动安装

```powershell
$plugin = "%USERPROFILE%\Desktop\Taurus car\dsh-plugin-hardware-interview"
$profile = "%USERPROFILE%\.dsh\profiles\desktop"

# 1) 链接
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-hardware-interview-teacher" -Target $plugin

# 2) 编辑 $profile\package.json
#    dependencies 增加 "dsh-hardware-interview-teacher": "link:<插件路径>"
#    dsh.profile.bundles 追加 "dsh-hardware-interview-teacher"
```

### 配置扫描目录

默认扫描 `%USERPROFILE%\Desktop\Taurus car`（`lib/index.js` 的 `DEFAULT_WORKSPACE`，也是 `cordis.patch.yml` 里的 `config.workspace`）。换机器/换目录：

1. 改 `cordis.patch.yml` 的 `workspace`；或
2. 在面板顶部点「切换工程目录」（仅本次进程有效）。

## 使用

1. 左侧栏点「**硬件面试**」→ 面板打开。
2. 点「**扫描工程硬件配置**」→ 从 `遥控/`、`FreeRTOS小车/` 提取引脚/外设/电平/PWM/编码器证据（只提硬件）。
3. 点「**开始面试**」→ 进入第一题并开始计时；面板显示来源、H 编号、考核点、建议时间。
4. 在会话里对老师说「开始面试」→ 老师按 `SKILL.md` 流程逐题提问并调用 `hwinterview_record` 记录；面板实时同步。
5. 每题可点「提示 / 参考答案」；答完点「通过并下一题 / 待加强并下一题 / 跳过」。
6. 「预览复盘」→ 100 分制评分 + 分项 + 覆盖矩阵 + 风险点 + 下一轮重点题；「结束面试并落盘」写入 `面试记录/`。

会话命令（面板「面试命令」可一键复制）：`开始面试`、`继续面试`、`提示`、`参考答案`、`跳过`、`只看供电`、`只看接口`、`只看电机`、`重拆硬件点`、`结束面试`。

## 数据与口径

- `data/checklist.json`：20 个硬件考核点（18 必考 + 2 选考），分组为供电与地 / 接口电平 / 电机驱动 / 传感器·无线 / 调试排错 / 安全规范；每题带 PDF 出处与建议时间。
- `data/question-bank.json`：每点 1 道主问题 + 提示 + 参考答案框架 + 2 层追问 + 风险/改进建议/排查框架。
- 复盘评分（面板与工具一致）：`得分 = (通过×1 + 待加强×0.6 + 跳过×0) / 已考必考点 × 100`，未考不扣分、覆盖率单列；这是**覆盖度评分**，不是模型判分。
- 扫描器规则集中在 `lib/index.js` 的 `scanWorkspace()`，只匹配 GPIO/USART/I2C/SPI/PWM/编码器/NVIC/GPIO 模式等硬件配置行。

## 截图

| 文件 | 内容 |
| --- | --- |
| [01-sidebar.png](docs/screenshots/01-sidebar.png) | 左侧栏出现「硬件面试」入口 |
| [02-panel.png](docs/screenshots/02-panel.png) | 面板首屏：当前题、H01–H07、覆盖进度、面试模式、面试命令 |
| [03-scan.png](docs/screenshots/03-scan.png) | 工程扫描：真实材料识别 + 按 H 编号分组的硬件配置证据 |
| [04-question.png](docs/screenshots/04-question.png) | 开始面试后的当前题（来源 / 考核点 / 计时 / 建议时间） |
| [05-report.png](docs/screenshots/05-report.png) | 记录一题后预览复盘（总分、分项、风险点、覆盖矩阵） |

## 自测

```powershell
cd "%USERPROFILE%\Desktop\Taurus car\dsh-plugin-hardware-interview"
node scripts/selftest.mjs         # 宿主半：纯函数 + RPC 往返 + 复盘落盘 + 真工程扫描
node scripts/client-selftest.mjs  # 客户端半：模块格式 + sidebar/main slot 注册
```

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\Desktop\Taurus car\dsh-plugin-hardware-interview\scripts\uninstall.ps1" -Profile desktop
```

移除 junction 与 `package.json` 里的依赖/ bundles 登记；插件目录、状态与复盘文件保留（手动删 `<DSH_HOME>\hardware-interview\` 与对应的 `面试记录\硬件面试复盘-*.md`）。改完重启生效。

## 已知边界

1. **必须重启进程**才生效（bundle 插件在启动时组合）。
2. 面板不判分、不自动出题文案：判分/点评在会话里由老师完成；面板只同步状态。
3. 复盘评分基于记录里的自评结论；「最容易被淘汰的风险点」按必考项中未通过/未考的顺序确定，不含模型主观判断。
4. PDF 不实时解析：`data/checklist.json`、`data/pdf-points.md` 是预拆解结果；换题目需重生成这两个文件（可用 `pymupdf` 抽文本后重跑拆解）。
5. 扫描器是启发式正则，只用于给面试提供证据线索；最终以源码为准。
