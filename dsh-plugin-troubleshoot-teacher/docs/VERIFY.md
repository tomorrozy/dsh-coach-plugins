# 验证记录 · dsh-troubleshoot-teacher

> 目标：证明插件在**真实 DSH 运行时**里能加载、左侧栏入口能出现、面板能渲染并交互、RPC 数据正确。
> 结论：**宿主半 + 客户端半均通过**（隔离 web 实例 + Edge 无头浏览器实测；同时已在用户当前 `desktop` profile 安装并生效）。

## 1. 环境

| 项 | 值 |
| --- | --- |
| 日期 | 2026-10-24 |
| DSH 版本 | 0.2.1-rc.3（桌面客户端内置运行时） |
| 安装方式 | `plugin_manager` → `install_bundle`，target = 插件目录；返回 `application: applied` |
| 当前 profile | `desktop`（真实 GUI `http://127.0.0.1:55957`） |
| 验证实例 | `dsh --profile web --no-open --port 3138`（隔离 `DSH_HOME`，不触碰用户 `~/.dsh`） |
| 隔离 HOME | `%USERPROFILE%\Desktop\Taurus car\.verify\tscoach` |
| 浏览器 | Edge（msedge.exe）+ puppeteer-core，1440×1000，headless |

## 2. 宿主半验证

安装返回：`application: applied`，`enabled: true`，`warnings: []`。

隔离实例启动日志：

```
[dsh-troubleshoot-teacher] 已注册 skill：troubleshoot-coach
[dsh-troubleshoot-teacher] 已注册工具：tscoach_state / tscoach_begin / tscoach_record / tscoach_report
[dsh-troubleshoot-teacher] RPC 已挂载 /plugins/dsh-troubleshoot-teacher/rpc
```

真实 GUI 侧（`desktop` profile，无需重启）：

- 技能目录出现 `troubleshoot-coach`；
- 本会话工具表出现 `tscoach_state / tscoach_begin / tscoach_record / tscoach_report`；
- `tscoach_state` 实调返回：`覆盖 0/16`、状态文件 `%USERPROFILE%\.dsh\troubleshoot-coach\state.json`；
- 客户端 slot 树 `sidebar.panellist` 出现占用者 `troubleshoot-teacher`（order 6，active）。

## 3. 客户端半验证（截图为实测）

`node scripts/verify-ui.mjs`（`VERIFY_URL` 指向 3138 实例）：

| 检查项 | 结果 |
| --- | --- |
| 左侧栏出现「排错教练」入口 | ✅ |
| 点击后打开全局面板，标题「排错方法论老师」 | ✅ |
| 当前现象 P01 双机通信不通（现象/背景/四问/建议时间） | ✅ |
| 判据清单 6 步，每步含 层 / 检查 / 正常 / 异常 / 工具 | ✅ |
| 标准排查框架 7 条 + 关联硬件考点 H05/H10 | ✅ |
| 现象题库 16 条，按类别分组，可点「练这题」 | ✅ |
| 面板内点「记：待加强」→ 覆盖变 1/16、P01 显示「待加强」、toast 提示 | ✅ |
| 复盘 RPC 生成 100 分制报告（含覆盖矩阵与坏习惯） | ✅ |
| 浏览器 console error / pageerror / 失败请求 | 0 / 0 / 0 |

截图（`docs/screenshots/`）：

| 文件 | 内容 |
| --- | --- |
| `01-sidebar.png` | 左侧栏「排错教练」入口 |
| `02-panel.png` | 面板顶部：当前现象 + 四问 + 判据清单 |
| `03-criteria.png` | 判据清单（供电/地/信号/协议/执行/显示 六层） |
| `04-bank.png` | 现象题库与训练命令 |
| `05-progress.png` | 记录后：覆盖 1/16、待加强标记、复盘与落盘入口 |

## 4. 离线自测

```
node scripts/selftest.mjs        # 题库归一化/记录裁剪/统计/复盘/RPC 装配/资源清单
node scripts/client-selftest.mjs # 模块 id、slot 注册、sidebar 与 main key 一致、组件可创建
```

均通过；宿主自测用临时 `DSH_HOME`，不污染真实状态。

## 5. 验后修复

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| 四问重复编号 | `<ol>` 编号与数据里的“1）2）…”叠加成“1. 1）” | 题库 `questions` 去掉手写序号，只由 `<ol>` 编号（16 条 × 4 问） |
| 生成复盘抛错 | 复盘“下一轮建议”排序对未练现象调用 `averageScore(undefined)`，`生成复盘` 会 500 | `averageScore` 对 `undefined/null` 返回 `undefined`；补两条回归测试（含未练现象、空记录） |
| 侧栏图标偏弱 | 自绘放大镜在 20px 下细节偏细 | 图标放大到 20×20、加粗描边、加内部折线 |

## 6. 已知限制

- 隔离实例的验证截图来自 headless Edge，**未做深浅色主题对照**；面板样式全部使用 `--dsw-alias-*` 主题变量，理论上跟随主题。
- 面板的「生成复盘 / 结束并落盘复盘」按钮走 RPC，已在隔离实例用 RPC 验证并修掉上述抛错；按钮点击路径与「记：待加强」同构，未逐一点击截图。
- 真实 GUI（55957）的左侧栏入口与技能/工具已注册生效；若左侧栏未刷新显示，刷新一次页面即可（客户端模块在页面加载时注入）。
- 隔离实例与临时 `DSH_HOME` 验证后已关闭并清理；用户真实状态目录 `~/.dsh/troubleshoot-coach/` 保持空状态。
