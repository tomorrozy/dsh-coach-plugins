# dsh-test-teacher · 测试与验证老师（DSH 插件）

> 带**左侧栏入口**的 DeepSeek Harness 插件：把「给测试对象 → 你给测试方案与指标 → 老师点评追问 → 复盘」这套验证训练搬进 DSH。
> 只教**验证方法**（指标量化、条件构造、正常/异常判据、工具匹配、记录与回归），不教代码怎么写、不教元件怎么选、不替用户设计测试。

题目与工程证据来自 `Taurus 2027电控组三面.pdf`（8 个阶段的手势控制小车）＋ `遥控/`、`FreeRTOS小车/` 两个真实 STM32F103 工程：协议 `0xA5 / 0x0D / 13 字节 / 异或校验`、`PID kp=2.0 ki=1.5 kd=0`、`TIM2 20kHz PWM`、`TIM3/TIM4 编码器`、FreeRTOS `rx/ctrl/disp` 20ms 任务、`uart_init(115200)`。

## 它是什么

| 组成 | 说明 |
| --- | --- |
| 左侧栏入口 | 图标行「**测试验证**」（`sidebar.panellist`，order 8），点击打开全局面板 |
| 测试验证台（面板） | 当前测试对象（编号/被测系统/背景/**工程证据**）、五问、**教练底稿**（指标/条件/判据/工具/记录/回归/常见坏习惯，默认折叠）、标准测试框架、覆盖与七维分项、12 条题库、复制命令、复盘预览与落盘 |
| `test-verify-coach` skill | 测试与验证老师人设与流程（一次 1 题 → 六项点评 → 最多 2 层追问 → 结束出复盘），会话里自动可见、可主动调用 |
| `testcoach_*` 工具 | 会话里的“老师”用工具把进度实时写进面板：`testcoach_state` / `testcoach_begin` / `testcoach_record` / `testcoach_reference` / `testcoach_report` |
| 状态 | `<DSH_HOME>/test-teacher/state.json`（原子写） |
| 复盘 | `<workspace>/面试记录/测试验证复盘-<YYYYMMDD-HHmm>.md` |

**分工**：讲评、追问、判分在会话里进行（由 skill 驱动的模型完成）；面板负责题库、底稿、选题、记录、覆盖统计、复盘生成与落盘。面板不会自动判分——`通过/待加强/跳过` 与七维自评分由老师（或你自己）写入，复盘总分按已记录的自评分计算。

**底稿默认折叠**：指标、条件、判据、工具、记录、回归都在「教练底稿」里，点「显示参考答案」才展开——避免一打开面板就看到答案。

## 测试对象题库（12 条）

| 编号 | 分组 | 测试对象 |
| --- | --- | --- |
| T01 | 通信 | 通信协议边界：长度错、帧头错、帧尾错、校验错、半包、粘包、连续快速发送 |
| T04 | 通信 | 蓝牙/NRF 通信稳定性：距离、遮挡、连续时长、丢包率、延迟分布、频道冲突 |
| T06 | 通信 | 双机通信可靠性：长时间连续收发、断电重连、半包粘包、错误帧注入 |
| T07 | 通信 | 编码器测速准确性：低速/高速、正反转、丢脉冲、抖动、与理论值对比 |
| T02 | 控制 | PID 调好证明：阶跃响应、超调量、上升时间、稳态误差、抗扰恢复、不同目标速度 |
| T03 | 控制 | 姿态解算验证：静态零偏、动态跟随、yaw 零飘、振动噪声、温度漂移 |
| T05 | 控制 | 电机闭环测试：空载/负载、电池电压下降、堵转保护、启动电流、温升、正反转 |
| T09 | 控制 | 供电与复位测试：电池电压跌落、电机启动瞬间、复位次数、掉电重启 |
| T10 | 记录 | 整机连续运行测试：连续多久、故障率、温升、内存/栈余量、日志 |
| T11 | 记录 | 测试用例与记录表：怎么写用例、怎么记录、怎么回归、怎么判断“通过” |
| T12 | 记录 | 异常注入测试：拔线、反接、短路、错误指令、超范围数据 |
| T08 | 显示 | OLED 显示验证：刷新率、数据一致性、异常值显示、掉电恢复 |

模式：`全部对象` / `只练通信`(T01/T04/T06/T07) / `只练控制`(T02/T03/T05/T09) / `只练记录`(T10/T11/T12) / `只练显示`(T08，面板扩展——题库里 T08 不属于用户指定的三组)。

每条对象都带：`target`、`background`、`project`（工程证据，引用真实文件与数值）、`questions`（五问）、`metrics`（指标：名称/单位/正常/异常）、`conditions`（条件构造）、`criteria`（逐步：检查/正常/异常/工具）、`tools`、`record`（记录表字段）、`regression`（回归看哪几个数）、`traps`（常见坏习惯）、`hint`（只给 1 条方向）。

## 目录结构

```
dsh-plugin-test-teacher/
├── package.json                 # dsh.bundle.patch + dsh.client.inject + locale/icon 导出
├── cordis.patch.yml             # 插入 profile 组合；config.workspace 指定复盘落盘目录
├── lib/
│   ├── index.js                 # 宿主半：RPC、状态、skill、tools、复盘
│   └── client.js                # 客户端半：sidebar.panellist + main 面板
├── data/test-objects.json       # T01–T12 测试对象题库（指标/条件/判据/工具/记录/回归/工程证据）
├── skill/SKILL.md               # 测试与验证老师 skill 正文（人设 + 流程 + 工具约定）
├── locale/{zh,en}.json          # 插件管理器显示名与描述
├── icon.svg                     # 插件图标
├── scripts/
│   ├── selftest.mjs             # 宿主半离线自测（题库/统计/复盘/工具/RPC 装配）
│   ├── client-selftest.mjs      # 客户端半离线自测（模块格式 + slot 注册 + 区块文案）
│   └── verify-ui.mjs            # 真实渲染验证（Edge 无头 + puppeteer，截图 + 检查项）
├── docs/
│   ├── VERIFY.md                # 验证记录（环境、检查项、截图、限制、复现）
│   └── screenshots/             # 01-sidebar … 05-report 实测截图
└── README.md
```

## 安装与启用

本机用 DSH 自带的插件管理器安装（会登记依赖、bundle 与客户端注入，勿手改 profile）：

```
plugin_manager: install_bundle  target = %USERPROFILE%\Desktop\Taurus car\dsh-plugin-test-teacher
```

安装后左侧栏出现「测试验证」；若未出现，刷新 GUI（或重启 DeepSeek Harness），会话记录不受影响。

## 用法

**会话里直接说**：

- `开始测试` / `继续测试`：老师调 `testcoach_begin` 选题并出题（一次 1 题，附工程证据）；
- 按五问作答：指标 / 条件 / 判据 / 工具 / 记录与回归；
- `提示`（只给 1 条方向）、`参考答案`（调 `testcoach_reference` 给标准框架与底稿）、`跳过`（记 skipped 换题）；
- `只练通信` / `只练控制` / `只练记录` / `只练显示`：切模式；
- `结束测试`：调 `testcoach_report` 出 100 分制复盘；面板「结束并落盘复盘」写入 `面试记录/`。

**面板上可以**：切模式、重开/跳过当前题、点题库「练这题」、展开教练底稿、一键记录结论、看七维得分与覆盖、生成/复制/落盘复盘。

## 自测

```powershell
node scripts/selftest.mjs
node scripts/client-selftest.mjs
```

宿主自测用临时 `DSH_HOME`，覆盖题库校验、选题推进、记录统计、复盘七章、5 个工具的真实输出，并用假 `req/res` 打通 `POST /plugins/dsh-test-teacher/rpc`（state/begin/record/report/reference）；客户端自测用假 `window.__ModuleLoader__` + 假 React + 假 slots，校验模块 id、`sidebar.panellist`(id `test-teacher`, label `测试验证`)、`main` key 一致、样式 effect 与关键区块文案。

## 真实渲染验证

截图与检查项见 [`docs/VERIFY.md`](docs/VERIFY.md)：隔离 `dsh web` 实例（`.verify\home-tt`，端口 3139）+ Edge 无头浏览器，检查左侧栏入口、面板标题、12 条题库、出题、工程证据、底稿展开、记录写回、复盘生成，全部通过，0 pageerror / 0 console error / 0 失败请求；真实桌面 GUI（55957）侧已用 RPC 与 slot 检查确认宿主半、skill、5 个工具与 `test-teacher` 面板入口均已激活。

```powershell
$env:VERIFY_URL = "<运行中的 dsh web 带 token 的 URL>"
node scripts/verify-ui.mjs
```


## 与其他老师插件的关系

- 左侧栏「面试老师」：考**面试题覆盖**（需求 / 自写代码 / 库模板）；
- 左侧栏「硬件面试」：考**硬件接线与选型**（H01–H20）；
- 左侧栏「排错教练」：考**排错方法论**（现象 → 判据 → 隔离 → 记录）；
- 本插件：考**测试与验证**（指标 → 条件 → 判据 → 工具 → 记录回归）。四者数据各自独立，复盘都写在 `面试记录/`。
