# dsh-safety-cost-teacher · 安全、可靠性与成本老师

DSH Web UI 插件：在**左侧栏新增入口「安全可靠评审」**，点开是全页评审训练台，配合会话里的
`safety-cost-coach` 技能与 `screview_*` 工具，一次一个评审对象地训练
**风险识别 → 失效后果 → 保护设计与依据 → 验证判据 → 成本/备件/可维护性 → 下一层防线**。

不教代码、不教算法、不替用户设计；只点评工程评审思路、逐层追问、最后出 100 分制复盘。

## 左侧栏入口

- 入口 id：`safety-cost-teacher`，标签「安全可靠评审」，order 7，盾牌 + 对勾图标（`icon.svg`）
- 点开由 `main` 槽位按 key `safety-cost-teacher` 渲染全页训练台
- 与「硬件面试台」「排错教练」等入口并列，互不干扰

## 训练台（浏览器半）8 个区块

1. Header：状态 / 覆盖 `x/12` / 总分
2. 模式工具条：全部对象 · 只练电源 · 只练电机 · 只练连接 · 只练无线与EMC · 只练成本 + 重开 / 下一题 / 刷新
3. 当前评审对象：Sxx 徽标、评审重点、工程背景、**必答 5 条**、**六轴风险清单**（电气/热/机械/振动/EMC/人为）、追问层级提示、记：通过/待加强/跳过
4. 验证判据：每条给「正常 / 异常」两行判据，正常绿、异常红
5. 覆盖与八维分项 + 该对象写死的**标准评审框架**（说“参考答案”时给）
6. 题库：S01–S12 按类别分组，显示当前题与结论
7. 会话命令：一键复制「开始评审 / 提示 / 跳过 / 参考答案 / 只练电源 / 只练电机 / 只练连接 / 只练无线与EMC / 只练成本 / 换项目 / 结束评审」
8. 复盘：生成 / 结束并落盘 / 复制

## 题库 S01–S12

| 编号 | 对象 | 类别 | 训练模式 |
| --- | --- | --- | --- |
| S01 | 电池与供电安全 | 供电安全 | power |
| S02 | 降压模块可靠性 | 供电安全 | power |
| S03 | 电机堵转与过流 | 电机与驱动 | motor |
| S04 | 电机启动与电源跌落 | 供电安全 | power/motor |
| S05 | 驱动板散热与降额 | 电机与驱动 | motor |
| S06 | 无线模块供电与天线 | 无线与EMC | emc |
| S07 | 接插件与振动可靠性 | 连接与布线 | connect |
| S08 | 线束与布线 | 连接与布线 | connect |
| S09 | EMC 与干扰 | 无线与EMC | motor/emc |
| S10 | 电池管理与保护 | 供电安全 | power |
| S11 | 成本与物料 | 成本与维护 | cost |
| S12 | 整机可靠性与维护 | 整机可靠性 | connect/cost |

每条都带：`focus`、一句 `background`、5 条必答、6 轴风险点、4–6 条带数值的验证判据、
5–7 条按对象写死的评审框架、3–4 条“坏回答原话”、1 条 `hint`、5 行 `reference`（仅老师可见）。

模式只决定抽题范围：`power`=S01/S02/S04/S10，`motor`=S03/S04/S05/S09，`connect`=S07/S08/S12，
`emc`=S06/S09，`cost`=S11/S12。

## 会话里的用法

```
开始评审         → 出下一题，面板同步
提示             → 只给 1 条方向
跳过             → 记 skipped 并换对象
参考答案         → 给该对象的标准评审框架（不展开细节）
只练电源 / 只练电机 / 只练连接 / 只练无线与EMC / 只练成本
换项目           → 用新系统替换评审对象
结束评审         → 100 分制复盘
```

模型侧工具：

| 工具 | 作用 |
| --- | --- |
| `screview_state` | 读模式 / 当前对象 / 覆盖 / 八维均分 / 未练清单 |
| `screview_begin` | 设定模式并选中对象（不给 id 自动跳下一个未练） |
| `screview_record` | 写 verdict + 用时 + 一句点评 + 八维评分，面板实时同步 |
| `screview_report` | 生成 8 段式复盘（不写文件） |

## 数据与落盘

| 内容 | 路径 |
| --- | --- |
| 题库 | `data/question-bank.json`（1401 行，12 条） |
| 技能正文 | `skill/SKILL.md`（注册为 `safety-cost-coach`） |
| 进度状态 | `<DSH_HOME>/safety-cost-coach/state.json`（原子写） |
| 复盘落盘 | `<workspace>/面试记录/安全可靠复盘-YYYYMMDD-HHmm.md` |
| RPC | `POST /plugins/dsh-safety-cost-teacher/rpc` |

`workspace` 在 `cordis.patch.yml` 的 `config.workspace` 里配置，默认
`%USERPROFILE%\Desktop\Taurus car`。

## 文件结构

```
dsh-plugin-safety-cost-teacher/
  package.json / cordis.patch.yml / icon.svg
  locale/zh.json · locale/en.json        # 插件管理页显示名与图标
  lib/index.js                           # 宿主半：RPC / skill / 工具 / 状态 / 复盘
  lib/client.js                          # 浏览器半：左侧栏入口 + 全页训练台
  data/question-bank.json                # S01–S12 题库
  skill/SKILL.md                         # 老师人设与流程
  scripts/selftest.mjs                   # 离线自检（10 项）
  docs/CONTRACT.md                       # 宿主/浏览器/题库的实现契约
```

## 验证记录（本机实测）

- `node scripts/selftest.mjs`：10 项全过（12 条题库字段、模式 id 组、统计、复盘 8 章 + 12 行覆盖矩阵、坏习惯命中）
- `plugin_manager install_bundle`：`application: applied`，无 warnings
- Client `Slots.listSubTree`：`sidebar.panellist` occupant `safety-cost-teacher`（order 7，active）；`main` key `safety-cost-teacher`（active）
- RPC 实测：`state` 返回 6 模式 / 12 对象 / 8 分项；`current` 含 5 asks、6 axes、6 checks、7 framework，且不泄漏 `reference`/`traps`
- 记录与复盘实测：`record` 后总分 61、覆盖 1/12；`report` 输出 8 个章节 + 12 行覆盖矩阵（含「第1题」）；`finish` 成功写入 `面试记录/安全可靠复盘-*.md`（88 行）后已清理测试文件
- 未做浏览器截图验证（本会话无浏览器控制），面板视觉请在左侧栏实际点开确认

## 安装 / 卸载

已安装到 `desktop` profile（link 模式，改文件即生效，重开 Workspace 后刷新页面）。

```powershell
# 重新安装
# plugin_manager: action=install_bundle, target=%USERPROFILE%\Desktop\Taurus car\dsh-plugin-safety-cost-teacher
# 卸载
# plugin_manager: action=remove_bundle, target=dsh-safety-cost-teacher
```
