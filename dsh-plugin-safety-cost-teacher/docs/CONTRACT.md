# dsh-safety-cost-teacher · 实现契约（Lead 定义，勿改）

目标：给 DSH Web UI 增加左侧栏入口「安全可靠评审」，点开是全页「安全、可靠性与成本老师」训练台。
宿主半提供 JSON RPC + skill + 4 个工具；浏览器半只做展示与记录。

## 目录与文件归属（写作用域）

```
dsh-plugin-safety-cost-teacher/
  package.json            Lead
  cordis.patch.yml        Lead
  icon.svg                Lead
  locale/zh.json          Lead
  locale/en.json          Lead
  lib/index.js            Lead          （宿主：RPC / skill / tools / 状态 / 复盘）
  lib/client.js           client-builder（浏览器：左侧栏入口 + 全页训练台）
  data/question-bank.json bank-author   （S01–S12 题库）
  skill/SKILL.md          Lead
  README.md               Lead
  scripts/selftest.mjs    Lead
```

只写自己归属的文件，不要动别人的文件，不要安装/启用插件（Lead 做）。

## 固定标识

- 包名 / 插件 id：`dsh-safety-cost-teacher`
- 面板 id：`safety-cost-teacher`
- RPC 路径：`/plugins/dsh-safety-cost-teacher/rpc`
- 左侧栏 label：`安全可靠评审`
- 页面标题：`安全、可靠性与成本老师`
- skill 名：`safety-cost-coach`
- 工具名：`screview_state` / `screview_begin` / `screview_record` / `screview_report`
- 状态文件：`<DSH_HOME>/safety-cost-coach/state.json`
- 复盘落盘：`<workspace>/面试记录/安全可靠复盘-<YYYYMMDD-HHmm>.md`

## 题库数据契约（data/question-bank.json，必须是 JSON 数组）

```json
{
  "id": "S01",
  "category": "power",            // power | motor | interface | emc | cost | system
  "title": "电池与供电安全",
  "focus": "12V 航模电池反接、短路、过放、过流、开关、保险丝、急停",
  "background": "12V 航模电池经降压模块给 5V/3.3V，电机和逻辑共地，整机无急停。",
  "asks": ["反接、短路、过放、过流分别有什么后果？", "保护措施与选型/动作阈值依据是什么？", "怎么验证保护真的起作用，判据是什么？", "成本、备件、可维护性怎么权衡？", "如果第一层保护失效，下一层防线是什么？"],
  "axes": [
    { "key": "electric", "label": "电气", "points": ["反接", "短路", "过流", "过放"] },
    { "key": "thermal",  "label": "热",   "points": ["保险丝/线束发热", "降压模块温升"] },
    { "key": "mechanical","label": "机械", "points": ["开关/航插松脱"] },
    { "key": "vibration","label": "振动", "points": ["电池绑带松动"] },
    { "key": "emc",      "label": "EMC",  "points": ["电机 PWM 回流干扰"] },
    { "key": "human",    "label": "人为", "points": ["反接", "带电插拔", "急停不可达"] }
  ],
  "checks": [
    { "step": "选型", "check": "主保险丝额定电流", "normal": "1.5–2× 持续工作电流，短路时 <10ms 熔断", "abnormal": "与工作电流同值（正常启动即误断）或大到短路不动作" },
    { "step": "动作", "check": "反接保护验证", "normal": "反接 30s 内无器件发热、上电后电压正常", "abnormal": "反接后降压模块/单片机损坏" }
  ],
  "framework": ["选型余量：电流/电压/温度留 1.5–2 倍余量", "..."],
  "traps": ["只说“加个保险丝”，不给额定值与熔断时间", "..."],
  "hint": "先问自己：这四类故障里，哪一种会直接烧到人/烧到板，哪一种只停机？",
  "reference": "标准框架：1) 识别… 2) 后果… 3) 三层保护… 4) 判据… 5) 成本…"
}
```

硬性要求：
- 12 条，id 必须是 S01…S12，与下面题目一一对应，顺序无关但 id 唯一。
- asks 恒为 5 条（风险点/失效后果→保护依据→验证判据→成本备件→下一层防线）。
- axes 6 条（electric/thermal/mechanical/vibration/emc/human），每条 points 2–5 个具体风险点。
- checks 4–6 条，normal/abnormal 必须可测、尽量带数值（电流/电压/温升/时间/丢包率）。
- framework 5–7 条，是按该对象写死的评审顺序，不是通用套话。
- traps 3–4 条，写“学员常见坏回答”的原话。
- hint 1 条方向，不展开方案。
- reference 3–6 行，标准评审框架要点，用于用户说“参考答案”。
- 全部中文，严格工程语气，不客套；不虚构与该小车项目无关的器件型号。

## RPC 契约（浏览器半据此渲染；宿主半由 Lead 实现）

POST `RPC_PATH`，body `{ method, args }` → `{ ok: true, value } | { ok: false, error }`。
方法：

| method | args | value |
| --- | --- | --- |
| `state` | `{}` | 见下 |
| `bank` | `{}` | `{ bank: Sxx[], modes }` |
| `begin` | `{ mode?, id? }` | `{ state, stats, phenomenon }` |
| `record` | `{ id, verdict, seconds?, note?, scores? }` | `{ state, stats }` |
| `skip` | `{ id?, seconds?, note? }` | `{ state, stats }` |
| `next` | `{}` | `{ state, stats, phenomenon }` |
| `setMode` | `{ mode }` | `{ state, stats }` |
| `report` | `{}` | `{ report, stats, state }` |
| `finish` | `{}` | `{ report, reportPath, stats, state }` |
| `reset` | `{}` | `{ state, stats }` |
| `copyPrompt` | `{}` | `{ prompt, bytes }` |

`state` 返回：

```json
{
  "state": {
    "version": 1, "status": "idle|running|finished", "mode": "all",
    "current": "S01|null", "startedAt": null, "updatedAt": null,
    "records": [{ "id": "S01", "verdict": "passed|weak|skipped", "seconds": 0,
                  "note": "", "score": 88, "ordinal": 1,
                  "scores": { "risk": 90, "consequence": 80 }, "at": "...", "title": "电池与供电安全" }],
    "log": []
  },
  "stats": {
    "total": 12, "attempted": 1, "passed": 0, "weak": 1, "skipped": 0,
    "unattempted": 11, "coverage": 8, "score": 85, "scored": 1, "totalSeconds": 150,
    "byCategory": [{ "key": "power", "label": "供电安全", "total": 4, "done": 1 }],
    "dimensions": [{ "key": "risk", "label": "风险识别", "value": 90, "samples": 1 }]
  },
  "current": null,
  "bankSummary": [{ "id": "S01", "category": "power", "categoryLabel": "供电安全", "title": "电池与供电安全", "focus": "..." }],
  "modes": [{ "id": "all", "label": "全部对象" }, { "id": "power", "label": "只练电源" }],
  "dimensions": [{ "key": "risk", "label": "风险识别", "max": 100 }],
  "paths": { "state": "...", "bank": "...", "skill": "...", "workspace": "..." },
  "now": "ISO"
}
```

`current`（非空时）是题目详情：

```json
{ "id": "S01", "category": "power", "categoryLabel": "供电安全",
  "title": "电池与供电安全", "focus": "...", "background": "...",
  "asks": ["...×5"], "axes": [{ "key": "electric", "label": "电气", "points": ["..."] }],
  "checks": [{ "step": "选型", "check": "...", "normal": "...", "abnormal": "..." }],
  "framework": ["...×5-7"] }
```

固定枚举（panel 与 report 共用）：

- modes：`all` 全部对象 / `power` 只练电源（S01,S02,S04,S10）/ `motor` 只练电机（S03,S04,S05,S09）/ `connect` 只练连接（S07,S08,S12）/ `emc` 只练无线与EMC（S06,S09）/ `cost` 只练成本（S11,S12）。
- categories：`power` 供电安全 / `motor` 电机与驱动 / `interface` 连接与布线 / `emc` 无线与EMC / `cost` 成本与维护 / `system` 整机可靠性。
- verdicts：`passed` 通过 / `weak` 待加强 / `skipped` 跳过。
- dimensions（8）：`risk` 风险识别 / `consequence` 失效后果 / `protect` 保护设计与依据 / `verify` 验证判据 / `wiring` 连接与布线 / `emc` EMC意识 / `cost` 成本与可维护性 / `expression` 表达逻辑。

## 浏览器半要求（lib/client.js）

- 形态照抄 `dsh-plugin-troubleshoot-teacher/lib/client.js`：`window.__ModuleLoader__.load({ id: 'dsh-safety-cost-teacher', factory })`，
  `require('react')`，`const h = react.createElement`，`exports.apply` / `exports.inject = ['slots','locale','layout']`。
- `ctx.slots.inject('sidebar.panellist', ...)` 注册 `{ name:'sidebar.panellist', id:'safety-cost-teacher', order:7, label:'安全可靠评审' }`，图标用自绘 SVG（盾牌 + 对勾/闪电，18×18，currentColor）。
- `ctx.slots.inject('main', function* () { yield ctx.slots.register({ name:'main', key:'safety-cost-teacher' }, Page) })`。
- 样式用 `ctx.effect` 注入 `<style data-plugin="dsh-safety-cost-teacher">`，只用主题 token（`--dsw-alias-*`、`--dsw-font-family-mono`），带兜底色值；不得 import Harness Client 包。
- 12s 轮询 `rpc('state')`；所有按钮走 RPC；错误显示在页面上；toast 2s 自动消失。
- 页面结构（自上而下）：
  1. Header：标题「安全、可靠性与成本老师」+ 一行说明；右侧 chips：状态、覆盖 `x/12`、总分。
  2. 模式工具条：6 个模式按钮（当前模式高亮）+ 重开当前题 / 下一题 / 刷新。
  3. 当前评审对象卡：Sxx 徽标 + title + focus + background；5 条 asks 编号列表；
     六轴风险清单（电气/热/机械/振动/EMC/人为，每轴 points 一行）；底部提示：建议熟练回答时间 2-3 分钟、追问 30 秒-1 分钟、
     缺失效后果或缺验证判据追问第 1 层、缺冗余/环境适应/成本权衡追问第 2 层；三个按钮：记：通过 / 记：待加强 / 跳过。
  4. 验证判据卡：checks 逐条（step + check + 正常/异常 两行，正常绿色、异常红色），无 checks 时给空状态。
  5. 两列：覆盖与分项（覆盖条、按类别 done/total、通过/待加强/跳过、练习用时、状态文件、8 个分项小格）/
     标准评审框架（current.framework 有序列表，标题带「说“参考答案”时给」tag）。
  6. 题库卡：按 category 分组列 12 条，每行 id + title + 当前/结论 pill + 「练这题」按钮。
  7. 命令卡：复制到剪贴板并提示「已复制，粘贴到输入框发送」——开始评审 / 提示 / 跳过 / 参考答案 / 只练电源 / 只练电机 / 只练连接 / 只练无线与EMC / 只练成本 / 换项目 / 结束评审。
  8. 复盘卡：生成复盘 / 结束并落盘复盘 / 复制复盘；报告用 `<pre>` 展示。
- 文案全部中文；不要英文残留；不要出现「排错」「硬件面试」等其它插件的词。

## 验证

Lead 安装后用 `cordis_inspect_query` 查 Client `Slots.listSubTree` 确认 `sidebar.panellist` 里有本次注册、`main` 上有 key；
浏览器半用 node 做语法检查（`node --check`）；题库用 `scripts/selftest.mjs` 校验 12 条与字段完整。
