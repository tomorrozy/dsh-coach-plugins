# DSH 面试教练插件集 · dsh-coach-plugins

> 把「电控岗面试训练」做成一套可反复练、可量化、能跨会话续的 AI 教练系统。
> 5 个 [DeepSeek Harness](https://github.com/deepseek-ai) 插件，带左侧栏面板 + 会话内老师 + 状态落盘。

这套插件源于一个真实的备战场景：把一个 STM32 手势控制小车项目，拆成 **81 个面试考核点**，
再用四个不同角度的「老师」反复训练 —— 硬件评审、排错方法论、测试验证、安全可靠性与成本。

---

## 五个插件

| 插件 | 左侧栏入口 | 技能（skill） | 状态工具 | 训练什么 | 题库 |
|---|---|---|---|---|---|
| [`dsh-plugin-hardware-interview`](dsh-plugin-hardware-interview/) | 硬件面试 | `hardware-interview-teacher` | `hwinterview_*` | 只考硬件：供电 / 地 / 电平 / 上拉 / 驱动能力 / 保护 / 抗干扰 / 接插件 / 测量 | H01–H20 |
| [`dsh-plugin-troubleshoot-teacher`](dsh-plugin-troubleshoot-teacher/) | 排错训练 | `troubleshoot-coach` | `tscoach_*` | 给故障现象，训练「排查顺序 + 每步判据 + 工具 + 异常分支」 | P01–P16 |
| [`dsh-plugin-test-teacher`](dsh-plugin-test-teacher/) | 测试验证 | `test-verify-coach` | `testcoach_*` | 测什么指标 / 怎么构造条件 / 正常异常判据 / 怎么记录与回归 | T01–T12 |
| [`dsh-plugin-safety-cost-teacher`](dsh-plugin-safety-cost-teacher/) | 安全可靠评审 | `safety-cost-coach` | `screview_*` | 风险点 → 失效后果 → 保护依据 → 验证判据 → 成本备件 → 下一层防线 | S01–S12 |
| [`dsh-plugin-interview-teacher`](dsh-plugin-interview-teacher/) | 面试控制台 | — | — | 只读面板：81 个考核点覆盖进度、当前题号、面试命令 | 81 点 |

---

## 设计思路

四个「老师」插件共用同一套架构，只是考核维度和题库不同：

```
┌─────────────────────── 会话里 ───────────────────────┐
│  模型扮演「老师」：出题 → 追问（最多 2 层）→ 判分       │
│  通过 skill 注入人设与流程；不替用户答题               │
└───────────────┬──────────────────────────────────────┘
                │ 调用 hwinterview_* / tscoach_* / …
┌───────────────▼──────────────────────────────────────┐
│  宿主半（lib/index.js）：JSON RPC 路由                │
│  · 状态机（未考/通过/待加强/跳过）                     │
│  · 原子写状态到 <DSH_HOME>/<plugin>/state.json        │
│  · 复盘落盘到 <workspace>/面试记录/                    │
└───────────────┬──────────────────────────────────────┘
                │ POST /plugins/<name>/rpc
┌───────────────▼──────────────────────────────────────┐
│  浏览器半（lib/client.js）：左侧栏 panel + main 面板   │
│  · 清单与进度、计时、提示与参考答案、复盘预览           │
└──────────────────────────────────────────────────────┘
```

**分工原则**：面板负责「记住」和「展示」，老师负责「问」和「判」，工具负责把两者接起来。
所以面试可以跨会话中断、续接，进度不会丢。

---

## 安装

### 前置

- DeepSeek Harness（桌面端或 Web 端）
- 仅自测需要：Node.js 18+

### 一键安装（推荐）

以硬件面试插件为例，其余四个同理（把目录名换掉即可）：

```powershell
# 装进桌面客户端 profile
powershell -ExecutionPolicy Bypass -File .\dsh-plugin-hardware-interview\scripts\install.ps1 -Profile desktop

# 装进 Web profile
powershell -ExecutionPolicy Bypass -File .\dsh-plugin-hardware-interview\scripts\install.ps1 -Profile web
```

脚本做三件事（幂等）：
1. 备份 profile 的 `package.json`
2. 登记 `link:<插件目录>` 依赖与 `dsh.profile.bundles`
3. 在 profile 的 `node_modules` 建 junction

装完刷新一次 GUI（或重启 DSH），左侧栏就会多出对应入口。

### 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\dsh-plugin-hardware-interview\scripts\uninstall.ps1 -Profile desktop
```

只移除登记与链接，插件目录、状态、复盘文件保留。

> 不是所有插件都带 `install.ps1`：`dsh-plugin-interview-teacher` 等可以按同样的手动方式登记
> （`package.json` 里写 `link:` 依赖 + 加入 `dsh.profile.bundles`）。

---

## 目录结构（以硬件面试插件为例）

```
dsh-plugin-hardware-interview/
├── package.json           # dsh.bundle.patch + dsh.client.inject
├── cordis.patch.yml       # 插入 profile 组合；config.workspace 指定扫描目录
├── lib/
│   ├── index.js           # 宿主半：RPC、状态机、扫描、skill、tools、复盘
│   └── client.js          # 客户端半：sidebar.panellist + main 面板
├── data/                  # 题库与考核点（JSON，可直接改用）
│   ├── checklist.json
│   ├── question-bank.json
│   └── code-hardware.json
├── skill/SKILL.md         # 老师人设与流程
├── scripts/               # install / uninstall / selftest
├── docs/                  # 验证记录与截图
└── README.md
```

**想改成自己领域的题库**：只改 `data/*.json` 和 `skill/SKILL.md` 即可，代码不用动。

---

## 自测

每个插件都有离线自测（不需要启动 DSH，用假的 cordis ctx 驱动宿主半）：

```powershell
cd dsh-plugin-hardware-interview
node scripts/selftest.mjs
```

### ⚠️ 关于测试结果

部分断言会**读取真实工作区**（待训工程源码、`面试记录/` 目录）。
本仓库不含这些用户数据，所以未准备示例工作区时，`hardware-interview` 与 `test-teacher`
的部分用例会失败 —— 这是**预期行为**，不是 bug。

指定自己的示例工作区：

```powershell
$env:DSH_TEST_WORKSPACE = 'D:\你的项目'
node scripts/selftest.mjs
```

`safety-cost-teacher` 与 `troubleshoot-teacher` 的自测不依赖工作区数据，应当全绿。

---

## 已知边界

- 面板**不自动判分**：记录里的「通过/待加强/跳过」由老师（模型）或你自己写入
- 题库面向 STM32F103 + MPU6050 + nRF24L01 + TB6612 这类电控小车，换领域请替换 `data/`
- 单个插件只保证在作者的 DSH 版本 + Node 18/20/24 下验证过

---

## 许可证

[MIT](LICENSE)

## 相关项目

- [gesture-control-car](https://github.com/tomorrozy/gesture-control-car) —— 这套题库对应的 STM32 手势识别小车（含 47 篇学习文档）
