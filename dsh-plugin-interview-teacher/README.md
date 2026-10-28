# dsh-interview-teacher

Taurus 2027 电控组三面 · **面试老师** 的 DSH 左侧栏入口插件。

- 左侧栏图标行：**面试老师**（`sidebar.panellist`，order 4）
- 点击打开全局面板（`main` keyed slot，key = `interview-teacher`）
- 面板只读展示：面试状态（状态/题号/模式/当前考核点）、81 点覆盖进度（按 D/S/L 分组）、
  分项得分、考核点清单、面试记录；并提供 8 个可复制的面试命令
- 数据来自宿主 RPC：`POST /plugins/dsh-interview-teacher/rpc`（method = `console`）

## 数据来源

| 数据 | 路径 |
|---|---|
| 面试状态 | `%USERPROFILE%\Desktop\Taurus car\面试记录\interview_state.md` |
| 考核点清单 | `%USERPROFILE%\.dsh\skills\taurus-interview\references\考核点清单.md` |
| 面试记录 | `%USERPROFILE%\Desktop\Taurus car\面试记录\` |

路径写死在 `lib/index.js` 顶部常量里，换机器改这三处即可。

## 结构

```
dsh-plugin-interview-teacher/
├── package.json          # dsh.bundle.patch + dsh.client.inject
├── cordis.patch.yml      # 把插件插入 profile 组合
├── lib/index.js          # 宿主半插件：读文件 + 解析 + JSON RPC
├── lib/client.js         # 客户端半插件：sidebar.panellist + main 页面
└── README.md
```

## 安装（已在本机装好）

插件以 junction 形式链进两个 profile 的 `node_modules`，并在 `package.json` 的
`dsh.profile.bundles` 里登记：

- `%USERPROFILE%\.dsh\profiles\desktop`（桌面客户端，当前 GUI）
- `%USERPROFILE%\.dsh\profiles\web`（`dsh web`，端口 3080）

安装/更新后需要**重启对应进程**才生效（插件是在进程启动时组合的）：

- 桌面客户端：退出 DeepSeek Harness 再打开
- Web：重启 `dsh web`

## 手动安装（换机器）

```powershell
$src = "C:\...\dsh-plugin-interview-teacher"
New-Item -ItemType Junction -Path "C:\Users\<user>\.dsh\profiles\web\node_modules\dsh-interview-teacher" -Target $src
# 然后把 "dsh-interview-teacher" 加进 profile package.json 的 dsh.profile.bundles
```

## 回滚

1. 从 profile `package.json` 的 `bundles` 里删掉 `dsh-interview-teacher`；
2. 删除 `node_modules\dsh-interview-teacher` junction；
3. 重启。

本机安装前的 desktop 配置备份：`profiles\desktop\package.json.bak-interview`。

## 已知边界

1. 面板是**只读控制台**，不替代会话：面试对话仍在会话里进行，命令按钮只把文本复制到剪贴板，
   需要你粘贴到输入框发送（DSH 未给 bundle 插件提供“注入并发送消息”的公开 API）。
2. 面板每 15 秒自动拉取一次状态；也可点「刷新状态」。
3. 命令按钮复制的是纯文本（`继续面试`、`结束面试` 等），与 `taurus-interview` 技能的命令表一致；「**开始面试**」按钮复制的是**专属开场提示词**（含文件性质识别、一次一题、记录与复盘规则），可直接粘到新会话开工。
