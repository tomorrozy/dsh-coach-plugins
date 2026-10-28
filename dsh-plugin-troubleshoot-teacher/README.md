# dsh-troubleshoot-teacher · 排错方法论老师（DSH 插件）

> 带**左侧栏入口**的 DeepSeek Harness 插件：把「故障现象 → 你列排查顺序与判据 → 老师点评追问 → 复盘」这套排错训练搬进 DSH。
> 只教排错方法论（分层隔离、先供电后信号、先静态后动态、每步有判据、异常有分支、过程有记录），不教代码怎么写、不替你做排查。

题目来源：`Taurus 2027电控组三面.pdf`（手势控制小车）＋ `遥控/`、`FreeRTOS小车/` 两个 STM32F103 工程里真实存在的接口与配置（NRF24L01 引脚/通道/地址、USART、MPU6050 I2C、TIM3/TIM4 编码器、TB6612、FreeRTOS 任务与互斥锁）。

![左侧栏入口](docs/screenshots/01-sidebar.png)

> 本机状态：已用 `plugin_manager install_bundle` 装进 `desktop` profile（`application: applied`），并在运行中的 DeepSeek Harness 里生效：
> 技能目录出现 `troubleshoot-coach`，本会话工具表出现 `tscoach_*`，左侧栏 slot 树出现 `troubleshoot-teacher`。
> 真实渲染验证（隔离 web 实例 + Edge 无头浏览器截图）见 [docs/VERIFY.md](docs/VERIFY.md)。

## 它是什么

| 组成 | 说明 |
| --- | --- |
| 左侧栏入口 | 图标行「**排错教练**」（`sidebar.panellist`，order 6），点击打开全局面板 |
| 排错教练台（面板） | 当前现象（编号/现象/背景/四问）、**判据清单**（每步：层 → 检查 → 正常/异常 → 工具）、标准排查框架、覆盖与七维分项、16 条现象题库、一键记录、复盘预览与落盘、可复制的训练命令 |
| `troubleshoot-coach` skill | 排错老师人设与流程（一次 1 题 → 六项点评 → 最多 2 层追问 → 结束出复盘），会话里自动可见、可主动调用 |
| `tscoach_*` 工具 | 会话里的「老师」用工具把进度实时写进面板：`tscoach_state` / `tscoach_begin` / `tscoach_record` / `tscoach_report` |
| 状态 | `<DSH_HOME>/troubleshoot-coach/state.json`（原子写） |
| 复盘 | `<workspace>/面试记录/排错复盘-<YYYYMMDD-HHmm>.md` |

**分工**：讲评、追问、判分在会话里进行（由 skill 驱动的模型完成）；面板负责现象题库、判据清单、选题、记录、覆盖统计、复盘生成与落盘。面板不会自动判分——`通过/待加强/跳过` 与七维自评分由老师（或你自己）写入，复盘总分按已记录的自评分计算。

## 现象题库（16 条）

| 编号 | 类别 | 现象 |
| --- | --- | --- |
| P01 | 通信 | 双机通信不通：手带端发、小车端收不到、OLED 无显示 |
| P04 | 通信 | 无线时好时坏，距离稍远丢包/延迟 |
| P09 | 通信 | UART 能收不能发 / 发一会儿卡死 |
| P15 | 通信 | 协议帧头 0xA5、帧尾 0x0D 校验总是解包失败 |
| P02 | 电机 | 电机一转单片机复位或 OLED 花屏 |
| P06 | 电机 | 速度闭环振荡 / 超调 / 稳态误差大 |
| P10 | 电机 | 小车直线跑偏，差速补偿后仍偏 |
| P16 | 电机 | OLED 在电机启动时花屏 / 无显示 |
| P03 | 传感器 | MPU6050 静止跳动大 / 倾斜回不到零 |
| P05 | 传感器 | 编码器不计数 / 只加不减 / 数值乱跳 |
| P11 | 传感器 | I2C 偶尔读失败，重新上电又好 |
| P13 | 传感器 | 手势方向反了 / 死区附近完全不动 |
| P07 | 系统 | 电机启动瞬间串口丢帧 |
| P08 | 系统 | 电池电压下降后重启或电机无力 |
| P12 | 系统 | VOFA+ 波形正常但实际电机不跟随 |
| P14 | 系统 | FreeRTOS 任务间显示卡死 / 数据错乱 |

每条现象都带：`symptom`、`background`、四问、`layers`（供电→地→信号→协议→执行→显示）、`criteria`（每步正常/异常/工具）、`steps`、`traps`（常见跳步）、`hint`（只给 1 条方向）、`reference`（参考答案用标准框架）。

## 目录结构

```
dsh-plugin-troubleshoot-teacher/
├── package.json                 # dsh.bundle.patch + dsh.client.inject + locale/icon 导出
├── cordis.patch.yml             # 插入 profile 组合；config.workspace 指定复盘落盘目录
├── lib/
│   ├── index.js                 # 宿主半：RPC、状态、skill、tools、复盘
│   └── client.js                # 客户端半：sidebar.panellist + main 面板
├── data/phenomena.json          # P01–P16 现象题库（判据/框架/常见跳步）
├── skill/SKILL.md               # 排错老师 skill 正文（人设 + 流程 + 工具约定）
├── locale/{zh,en}.json          # 插件管理器显示名与描述
├── icon.svg                     # 插件图标
├── scripts/
│   ├── selftest.mjs             # 宿主半离线自测（题库/统计/复盘/RPC 装配）
│   ├── client-selftest.mjs      # 客户端半离线自测（模块格式 + slot 注册）
│   └── verify-ui.mjs            # 真实渲染验证（Edge 无头浏览器 + 截图）
├── docs/
│   ├── VERIFY.md                # 隔离实例验证记录（检查项/截图/限制）
│   └── screenshots/             # 面板与侧栏截图
└── README.md
```

## 安装与启用

本机用 DSH 自带的插件管理器安装（会登记依赖、bundle 与客户端注入，勿手改 profile）：

```
plugin_manager: install_bundle  target = %USERPROFILE%\Desktop\Taurus car\dsh-plugin-troubleshoot-teacher
```

安装后左侧栏出现「排错教练」；若未出现，刷新 GUI（或重启 DeepSeek Harness），会话记录不受影响。

## 用法

**会话里直接说**：

- `开始排错` / `继续排错`：老师调 `tscoach_begin` 选题并出题（一次 1 题）；
- 按四问作答：排查顺序 / 每步判据 / 工具 / 正常与异常分支；
- `提示`（只给 1 条方向）、`参考答案`（给标准排查框架）、`跳过`（记 skipped 换题）；
- `只练通信` / `只练电机` / `只练传感器`：切模式（comms / motor / sensor）；
- `结束排错`：调 `tscoach_report` 出 100 分制复盘；面板「结束并落盘复盘」写入 `面试记录/`。

**面板上可以**：切模式、重开/跳过当前题、直接点题库「练这题」、一键记录结论、看判据清单与七维得分、生成/复制/落盘复盘。

## 自测

```powershell
node scripts/selftest.mjs
node scripts/client-selftest.mjs
```

宿主自测用临时 `DSH_HOME`，不污染真实状态；客户端自测用假 `window.__ModuleLoader__` + 假 React + 假 slots，校验模块 id、`sidebar.panellist` 与 `main` key 一致、组件可创建元素树。

## 与其他插件的关系

- 左侧栏「硬件面试」：考**硬件接线与选型**（H01–H20）；
- 左侧栏「面试老师」：考**面试题覆盖**（需求/自写代码/库模板）；
- 本插件：考**排错方法论**（现象 → 判据 → 隔离 → 记录）。三者数据各自独立，复盘都在 `面试记录/`。
