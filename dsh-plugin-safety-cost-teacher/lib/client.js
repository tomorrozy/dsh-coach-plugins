/**
 * dsh-safety-cost-teacher — 浏览器半（client half）。
 *
 * 本文件是「安全、可靠性与成本老师」插件的浏览器半，只负责展示与记录：
 *   1. 在左侧栏 `sidebar.panellist` 注册入口（id: safety-cost-teacher，label: 安全可靠评审，
 *      order: 7，图标为自绘盾牌 + 对勾 SVG）；
 *   2. 在 `main` 槽位按 key `safety-cost-teacher` 注册全页训练台；
 *   3. 全部数据来自宿主半 RPC：POST /plugins/dsh-safety-cost-teacher/rpc
 *      （method: state / begin / record / skip / next / setMode / report / finish / reset ...），
 *      题库来自 data/question-bank.json，进度落盘在左侧栏状态文件。
 *
 * 只 require 平台种子模块 `react`，不引入任何第三方依赖；样式经 ctx.effect 注入，
 * 类名统一 `.sc-` 前缀，颜色只用主题 token（--dsw-alias-*、--dsw-font-family-mono）并带兜底色。
 * 本页不做讲评：讲评与追问发生在会话里，面板负责出题、判据、台账与复盘。
 */

window.__ModuleLoader__.load({
  id: 'dsh-safety-cost-teacher',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const h = react.createElement;

    const PANEL_ID = 'safety-cost-teacher';
    const RPC_PATH = '/plugins/dsh-safety-cost-teacher/rpc';
    const REFRESH_MS = 12000;

    const VERDICT_LABELS = { passed: '通过', weak: '待加强', skipped: '跳过' };
    const STATUS_LABELS = { idle: '未开始', running: '进行中', finished: '已结束' };

    const AXIS_LABELS = {
      electric: '电气',
      thermal: '热',
      mechanical: '机械',
      vibration: '振动',
      emc: 'EMC',
      human: '人为',
    };

    // 模式兜底：即使 RPC 的 modes 缺失，也保证 6 个模式按钮齐全。
    const MODES_FALLBACK = [
      { id: 'all', label: '全部对象' },
      { id: 'power', label: '只练电源' },
      { id: 'motor', label: '只练电机' },
      { id: 'connect', label: '只练连接' },
      { id: 'emc', label: '只练无线与EMC' },
      { id: 'cost', label: '只练成本' },
    ];

    // 分项兜底：契约固定 8 项，值为空时由 stats.dimensions 补齐。
    const DIMENSIONS_FALLBACK = [
      { key: 'risk', label: '风险识别' },
      { key: 'consequence', label: '失效后果' },
      { key: 'protect', label: '保护设计与依据' },
      { key: 'verify', label: '验证判据' },
      { key: 'wiring', label: '连接与布线' },
      { key: 'emc', label: 'EMC意识' },
      { key: 'cost', label: '成本与可维护性' },
      { key: 'expression', label: '表达逻辑' },
    ];

    const CSS = [
      '.sc-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 22px) 26px 40px;color:var(--dsw-alias-label-primary,#1b1f27);background:var(--dsw-alias-bg-base,#fff)}',
      '.sc-inner{max-width:1000px;margin:0 auto}',
      '.sc-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}',
      '.sc-head svg{flex:none;margin-top:3px}',
      '.sc-title{font-size:20px;font-weight:650;margin:0}',
      '.sc-sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:4px;line-height:1.5}',
      '.sc-chips{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.sc-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-secondary,#5c6470);white-space:nowrap}',
      '.sc-chip b{font-weight:600;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.sc-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}',
      '.sc-ghost{font:inherit;font-size:12px;padding:5px 10px;border-radius:7px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-secondary,#5c6470);cursor:pointer}',
      '.sc-ghost:hover{color:var(--dsw-alias-label-primary,#1b1f27);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.sc-ghost.on{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}',
      '.sc-ghost:disabled{opacity:.5;cursor:default}',
      '.sc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}',
      '.sc-card{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-elevated,#fafbfc);margin-bottom:12px}',
      '.sc-card h3{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.sc-tag{font-size:11px;font-weight:500;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.sc-obj{display:flex;align-items:flex-start;gap:12px}',
      '.sc-badge{flex:none;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:12px;font-weight:600;padding:4px 8px;border-radius:7px;background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}',
      '.sc-obj-title{font-size:16px;font-weight:640;line-height:1.45}',
      '.sc-obj-focus{font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary,#5c6470);margin-top:4px}',
      '.sc-obj-bg{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:6px}',
      '.sc-subhead{margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);display:flex;align-items:center;gap:8px}',
      '.sc-asks{margin:0;padding-left:18px;font-size:13px;line-height:1.85;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.sc-axes{display:flex;flex-direction:column;gap:5px}',
      '.sc-axis{display:flex;gap:10px;font-size:12.5px;line-height:1.7}',
      '.sc-axis em{flex:none;font-style:normal;font-weight:600;min-width:46px;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.sc-axis span{flex:1;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.sc-crit{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
      '.sc-crit-row{border-left:3px solid var(--dsw-alias-line-normal,#e7e9ee);padding:2px 0 2px 10px}',
      '.sc-crit-head{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:3px}',
      '.sc-step{font-weight:640;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.sc-check{font-size:13px;line-height:1.6}',
      '.sc-na{font-size:12px;line-height:1.6;margin-top:2px}',
      '.sc-na i{font-style:normal;font-weight:600}',
      '.sc-ok{color:var(--dsw-alias-state-success-primary,#12a150)}',
      '.sc-bad{color:#c4302b}',
      '.sc-list{margin:0;padding-left:18px;font-size:12.5px;line-height:1.85;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.sc-metrics{display:flex;align-items:baseline;gap:8px}',
      '.sc-big{font-size:26px;font-weight:680;line-height:1}',
      '.sc-small{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.sc-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-sunken,#eceef2);overflow:hidden;margin-top:9px}',
      '.sc-bar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.sc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;padding:3px 0}',
      '.sc-row span:first-child{color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.sc-row span:last-child{font-weight:560;text-align:right;word-break:break-all}',
      '.sc-dims{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:4px}',
      '.sc-dim{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff)}',
      '.sc-dim b{display:block;font-size:16px;font-weight:660}',
      '.sc-dim em{display:block;font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:1px}',
      '.sc-bank{display:flex;flex-direction:column;gap:4px;max-height:360px;overflow:auto}',
      '.sc-group{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);padding:8px 6px 3px;border-bottom:1px solid var(--dsw-alias-line-normal,#e7e9ee)}',
      '.sc-bank-row{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 6px;border-radius:7px}',
      '.sc-bank-row:hover{background:var(--dsw-alias-bg-sunken,#eceef2)}',
      '.sc-bank-row code{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c);min-width:30px}',
      '.sc-bank-row .sc-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sc-pill{font-size:10.5px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.sc-pill.passed{color:#12a150;border-color:#9cd8b6}',
      '.sc-pill.weak{color:#e0a500;border-color:#ecd58c}',
      '.sc-pill.skipped{color:#8a919c}',
      '.sc-pill.cur{color:#4d6bfe;border-color:#a9b9ff;font-weight:600}',
      '.sc-act{font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-tertiary,#8a919c);cursor:pointer}',
      '.sc-act:hover{color:var(--dsw-alias-label-primary,#1b1f27);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.sc-cmds{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:6px}',
      '.sc-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-base,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.sc-btn:hover{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.sc-btn b{font-size:13px;font-weight:600}',
      '.sc-btn em{font-size:11px;font-style:normal;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.sc-report{margin-top:6px;max-height:380px;overflow:auto;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:9px;padding:10px 12px;background:var(--dsw-alias-bg-base,#fff)}',
      '.sc-report pre{margin:0;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.sc-note{font-size:12px;line-height:1.65;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:10px}',
      '.sc-err{color:#c4302b;font-size:13px;margin-top:8px}',
      '.sc-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1b1f27;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;z-index:60;opacity:.96;max-width:70vw}',
      '.sc-empty{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#8a919c)}',
    ].join('');

    function rpc(method, args) {
      return fetch(RPC_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ method, args: args ?? {} }),
      })
        .then((res) => res.json())
        .then((payload) => {
          if (!payload || payload.ok !== true) throw new Error((payload && payload.error) || '接口请求失败');
          return payload.value;
        });
    }

    function copy(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } finally {
        area.remove();
      }
      return Promise.resolve();
    }

    function fmtSeconds(total) {
      const seconds = Math.max(0, Math.round(Number(total) || 0));
      return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
    }

    // 自绘图标：盾牌 + 对勾，18×18，currentColor。同时用于左侧栏入口与页头。
    function ShieldCheckIcon() {
      return h(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M12 2.9 19.1 5.7v5.2c0 4.3-3 7.7-7.1 10.2-4.1-2.5-7.1-5.9-7.1-10.2V5.7Z',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'm8.7 11.9 2.2 2.2 4.2-4.4',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function CheckRow(props) {
      const item = props.item;
      return h(
        'div',
        { className: 'sc-crit-row' },
        h(
          'div',
          { className: 'sc-crit-head' },
          item.step ? h('span', { className: 'sc-step' }, item.step) : null,
          h('span', { className: 'sc-check' }, item.check),
        ),
        h(
          'div',
          { className: 'sc-na' },
          h('i', { className: 'sc-ok' }, '正常 '),
          item.normal || '（未写正常判据）',
          h('i', { className: 'sc-bad', style: { marginLeft: 10 } }, '异常 '),
          item.abnormal || '（未写异常判据）',
        ),
      );
    }

    function QuestionBank(props) {
      const { bank, records, current, onPick, busy } = props;
      const recordById = new Map();
      for (const record of records) recordById.set(record.id, record);
      const groups = new Map();
      for (const item of bank) {
        const key = item.category || item.categoryLabel;
        const bucket = groups.get(key) ?? { label: item.categoryLabel || key, items: [] };
        bucket.items.push(item);
        groups.set(key, bucket);
      }
      const children = [];
      for (const [key, group] of groups) {
        children.push(
          h('div', { className: 'sc-group', key: `g-${key}` }, h('span', null, group.label), h('span', null, `${group.items.length} 题`)),
        );
        for (const item of group.items) {
          const record = recordById.get(item.id);
          const isCurrent =
            current !== null && current !== undefined && (current.id === item.id || current === item.id);
          children.push(
            h(
              'div',
              { className: 'sc-bank-row', key: item.id, title: item.focus || '' },
              h('code', null, item.id),
              h('span', { className: 'sc-name' }, item.title),
              isCurrent ? h('span', { className: 'sc-pill cur' }, '当前') : null,
              record ? h('span', { className: `sc-pill ${record.verdict}` }, VERDICT_LABELS[record.verdict] ?? record.verdict) : null,
              h('button', { className: 'sc-act', disabled: busy, onClick: () => onPick(item.id) }, isCurrent ? '重开' : '练这题'),
            ),
          );
        }
      }
      return h('div', { className: 'sc-bank' }, children);
    }

    function SafetyCostPage() {
      const [data, setData] = react.useState(null);
      const [error, setError] = react.useState(null);
      const [toast, setToast] = react.useState('');
      const [busy, setBusy] = react.useState(false);
      const [report, setReport] = react.useState(null);
      const [reportPath, setReportPath] = react.useState(null);

      const load = react.useCallback(() => {
        return rpc('state')
          .then((value) => {
            setData(value);
            setError(null);
          })
          .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      }, []);

      react.useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
      }, [load]);

      const showToast = (text) => {
        setToast(text);
        setTimeout(() => setToast(''), 2000);
      };

      const run = (method, args, successText) => {
        setBusy(true);
        rpc(method, args)
          .then((value) => {
            if (successText) showToast(typeof successText === 'function' ? successText(value) : successText);
            return load();
          })
          .catch((err) => showToast(`失败：${err instanceof Error ? err.message : String(err)}`))
          .finally(() => setBusy(false));
      };

      const copyCommand = (command) => () => {
        copy(command).then(() => showToast('已复制，粘贴到输入框发送'));
      };

      const state = data && data.state;
      const stats = data && data.stats;
      const current = data && data.current;
      const bank = (data && data.bankSummary) || [];
      const records = (state && state.records) || [];
      const modes = (data && data.modes && data.modes.length ? data.modes : MODES_FALLBACK) || MODES_FALLBACK;
      const currentId = (current && current.id) || (state && state.current) || null;

      const dimStats = new Map(((stats && stats.dimensions) || []).map((item) => [item.key, item]));
      const rawDims = (data && data.dimensions) || [];
      const dimensionList = (rawDims.length ? rawDims : DIMENSIONS_FALLBACK).map((item) => {
        const fallback = DIMENSIONS_FALLBACK.find((entry) => entry.key === item.key);
        const scored = dimStats.get(item.key);
        return {
          key: item.key,
          label: item.label || (fallback ? fallback.label : item.key),
          value: scored && typeof scored.value === 'number' ? scored.value : null,
          samples: scored && typeof scored.samples === 'number' ? scored.samples : 0,
        };
      });

      const total = stats ? stats.total : bank.length || 12;
      const checks = (current && current.checks) || [];
      const axes = (current && current.axes) || [];
      const asks = (current && current.asks) || [];
      const framework = (current && current.framework) || [];

      return h(
        'div',
        { className: 'sc-page' },
        h(
          'div',
          { className: 'sc-inner' },

          // 1. Header
          h(
            'div',
            { className: 'sc-head' },
            h(ShieldCheckIcon),
            h(
              'div',
              null,
              h('h1', { className: 'sc-title' }, '安全、可靠性与成本老师'),
              h(
                'div',
                { className: 'sc-sub' },
                '安全、可靠性与成本训练台 · 一次一个评审对象：六轴风险清单 → 失效后果 → 保护依据 → 验证判据 → 成本取舍 · 答案在会话里讲评',
              ),
            ),
            h(
              'div',
              { className: 'sc-chips' },
              h('span', { className: 'sc-chip' }, '状态 ', h('b', null, state ? STATUS_LABELS[state.status] ?? state.status : '未开始')),
              h('span', { className: 'sc-chip' }, '覆盖 ', h('b', null, stats ? `${stats.attempted}/${total}` : '-')),
              h('span', { className: 'sc-chip' }, '总分 ', h('b', null, stats && stats.scored > 0 ? String(stats.score) : '—')),
            ),
          ),

          // 2. 模式工具条
          h(
            'div',
            { className: 'sc-toolbar' },
            modes.map((mode) =>
              h(
                'button',
                {
                  key: mode.id,
                  className: state && state.mode === mode.id ? 'sc-ghost on' : 'sc-ghost',
                  disabled: busy,
                  onClick: () => run('begin', { mode: mode.id }, `已切到「${mode.label}」并选中下一题`),
                },
                mode.label,
              ),
            ),
            h(
              'button',
              { className: 'sc-ghost', disabled: busy, onClick: () => run('begin', { id: currentId }, '已重新开始当前题') },
              '重开当前题',
            ),
            h(
              'button',
              {
                className: 'sc-ghost',
                disabled: busy,
                onClick: () => run('next', {}, (value) => `下一题：${(value && value.state && value.state.current) || '无剩余对象'}`),
              },
              '下一题',
            ),
            h('button', { className: 'sc-ghost', disabled: busy, onClick: load }, '刷新'),
          ),

          error !== null ? h('div', { className: 'sc-err' }, `读取失败：${error}`) : null,

          // 3. 当前评审对象卡
          h(
            'div',
            { className: 'sc-card' },
            h(
              'h3',
              null,
              '当前评审对象',
              current ? h('span', { className: 'sc-tag' }, `${current.id} · ${current.categoryLabel || ''}`) : null,
            ),
            current
              ? h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'sc-obj' },
                    h('span', { className: 'sc-badge' }, current.id),
                    h(
                      'div',
                      null,
                      h('div', { className: 'sc-obj-title' }, current.title),
                      h('div', { className: 'sc-obj-focus' }, `评审重点：${current.focus || '（题面未写重点）'}`),
                      current.background ? h('div', { className: 'sc-obj-bg' }, `工程背景：${current.background}`) : null,
                    ),
                  ),

                  h('div', { className: 'sc-subhead' }, '必答 5 条', h('span', { className: 'sc-tag' }, '逐条答，不要合并')),
                  asks.length > 0
                    ? h('ol', { className: 'sc-asks' }, asks.map((ask, index) => h('li', { key: `ask-${index}` }, ask)))
                    : h('div', { className: 'sc-empty' }, '本题未写必答清单。'),

                  h('div', { className: 'sc-subhead' }, '六轴风险清单', h('span', { className: 'sc-tag' }, '电气 / 热 / 机械 / 振动 / EMC / 人为')),
                  axes.length > 0
                    ? h(
                        'div',
                        { className: 'sc-axes' },
                        axes.map((axis) =>
                          h(
                            'div',
                            { className: 'sc-axis', key: axis.key },
                            h('em', null, axis.label || AXIS_LABELS[axis.key] || axis.key),
                            h('span', null, (axis.points || []).join(' / ') || '（未列风险点）'),
                          ),
                        ),
                      )
                    : h('div', { className: 'sc-empty' }, '本题未提供六轴风险点。'),

                  h(
                    'div',
                    { className: 'sc-note' },
                    '建议熟练回答时间 2-3 分钟，追问 30 秒-1 分钟。缺失效后果或缺验证判据，追问第 1 层；缺冗余、缺环境适应、缺成本权衡，追问第 2 层。',
                  ),
                  h(
                    'div',
                    { className: 'sc-toolbar', style: { marginTop: 10, marginBottom: 0 } },
                    h(
                      'button',
                      { className: 'sc-ghost', disabled: busy, onClick: () => run('record', { id: current.id, verdict: 'passed' }, '已记为通过') },
                      '记：通过',
                    ),
                    h(
                      'button',
                      { className: 'sc-ghost', disabled: busy, onClick: () => run('record', { id: current.id, verdict: 'weak' }, '已记为待加强') },
                      '记：待加强',
                    ),
                    h('button', { className: 'sc-ghost', disabled: busy, onClick: () => run('skip', { id: current.id }, '已跳过，可点「下一题」') }, '跳过'),
                  ),
                )
              : h(
                  'div',
                  { className: 'sc-empty' },
                  '还没有当前评审对象。点顶部模式按钮或下面题库里的「练这题」开始；会话里说“开始评审”也能出题。',
                ),
          ),

          // 4. 验证判据卡
          h(
            'div',
            { className: 'sc-card' },
            h(
              'h3',
              null,
              '验证判据',
              checks.length > 0 ? h('span', { className: 'sc-tag' }, `${checks.length} 条 · 每条给正常/异常`) : null,
            ),
            checks.length > 0
              ? h('div', { className: 'sc-crit' }, checks.map((item, index) => h(CheckRow, { key: `check-${index}`, item })))
              : h('div', { className: 'sc-empty' }, '本题未提供验证判据。没有判据就没有验证：至少给出可测的正常值与异常值（电流、电压、温升、时间、丢包率）。'),
          ),

          // 5. 两列：覆盖与分项 / 标准评审框架
          h(
            'div',
            { className: 'sc-grid' },
            h(
              'div',
              { className: 'sc-card' },
              h('h3', null, '覆盖与分项'),
              h('div', { className: 'sc-bar' }, h('i', { style: { width: `${stats ? stats.coverage : 0}%` } })),
              h(
                'div',
                { style: { marginTop: 10 } },
                (stats ? stats.byCategory : []).map((group) =>
                  h('div', { className: 'sc-row', key: group.key }, h('span', null, group.label), h('span', null, `${group.done} / ${group.total}`)),
                ),
                h(
                  'div',
                  { className: 'sc-row' },
                  h('span', null, '通过 / 待加强 / 跳过'),
                  h('span', null, stats ? `${stats.passed} / ${stats.weak} / ${stats.skipped}` : '-'),
                ),
                h('div', { className: 'sc-row' }, h('span', null, '练习用时'), h('span', null, stats ? fmtSeconds(stats.totalSeconds) : '-')),
                h('div', { className: 'sc-row' }, h('span', null, '状态文件'), h('span', { className: 'sc-small' }, data ? data.paths.state : '-')),
              ),
              h(
                'div',
                { className: 'sc-dims' },
                dimensionList.map((dimension) =>
                  h(
                    'div',
                    { className: 'sc-dim', key: dimension.key },
                    h('b', null, dimension.value !== null ? String(dimension.value) : '—'),
                    h('em', null, dimension.label),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'sc-card' },
              h('h3', null, '标准评审框架', h('span', { className: 'sc-tag' }, '说“参考答案”时给')),
              framework.length > 0
                ? h(
                    'ol',
                    { className: 'sc-list', style: { marginTop: 2 } },
                    framework.map((line, index) => h('li', { key: `f-${index}` }, line)),
                  )
                : h('div', { className: 'sc-empty' }, '选中评审对象后显示该对象写死的评审顺序；没有对象的框架只是套话，不给。'),
            ),
          ),

          // 6. 题库卡
          h(
            'div',
            { className: 'sc-card' },
            h('h3', null, '题库', h('span', { className: 'sc-tag' }, `${bank.length} 条 · 按类别分组`)),
            h(QuestionBank, {
              bank,
              records,
              current: currentId,
              busy,
              onPick: (id) => run('begin', { id }, `已选中 ${id}`),
            }),
            h('div', { className: 'sc-note' }, '12 条对象覆盖供电安全、电机与驱动、连接与布线、无线与EMC、成本与维护、整机可靠性；模式只决定抽题范围。'),
          ),

          // 7. 命令卡
          h(
            'div',
            { className: 'sc-card' },
            h('h3', null, '会话命令', h('span', { className: 'sc-tag' }, '复制后粘贴到输入框发送')),
            h(
              'div',
              { className: 'sc-cmds' },
              h('button', { className: 'sc-btn', onClick: copyCommand('开始评审') }, h('b', null, '开始评审'), h('em', null, '抽第 1 题并同步面板')),
              h('button', { className: 'sc-btn', onClick: copyCommand('提示') }, h('b', null, '提示'), h('em', null, '只给 1 条方向')),
              h('button', { className: 'sc-btn', onClick: copyCommand('跳过') }, h('b', null, '跳过'), h('em', null, '换对象并记未覆盖')),
              h('button', { className: 'sc-btn', onClick: copyCommand('参考答案') }, h('b', null, '参考答案'), h('em', null, '给该对象的标准评审框架')),
              h('button', { className: 'sc-btn', onClick: copyCommand('只练电源') }, h('b', null, '只练电源'), h('em', null, 'S01/S02/S04/S10')),
              h('button', { className: 'sc-btn', onClick: copyCommand('只练电机') }, h('b', null, '只练电机'), h('em', null, 'S03/S04/S05/S09')),
              h('button', { className: 'sc-btn', onClick: copyCommand('只练连接') }, h('b', null, '只练连接'), h('em', null, 'S07/S08/S12')),
              h('button', { className: 'sc-btn', onClick: copyCommand('只练无线与EMC') }, h('b', null, '只练无线与EMC'), h('em', null, 'S06/S09')),
              h('button', { className: 'sc-btn', onClick: copyCommand('只练成本') }, h('b', null, '只练成本'), h('em', null, 'S11/S12')),
              h('button', { className: 'sc-btn', onClick: copyCommand('换项目') }, h('b', null, '换项目'), h('em', null, '换一套工程背景重练')),
              h('button', { className: 'sc-btn', onClick: copyCommand('结束评审') }, h('b', null, '结束评审'), h('em', null, '100 分制复盘')),
            ),
            h('div', { className: 'sc-note' }, '面板只出题、只记录；讲评与追问在会话里进行。数据来源：data/question-bank.json + 左侧栏状态文件。'),
          ),

          // 8. 复盘卡
          h(
            'div',
            { className: 'sc-card' },
            h('h3', null, '复盘'),
            h(
              'div',
              { className: 'sc-toolbar', style: { marginBottom: 8 } },
              h(
                'button',
                {
                  className: 'sc-ghost',
                  disabled: busy,
                  onClick: () => {
                    setBusy(true);
                    rpc('report', {})
                      .then((value) => {
                        setReport(value.report);
                        showToast(`已生成复盘（覆盖 ${value.stats.attempted}/${value.stats.total}）`);
                      })
                      .catch((err) => showToast(`生成失败：${err instanceof Error ? err.message : String(err)}`))
                      .finally(() => setBusy(false));
                  },
                },
                '生成复盘',
              ),
              h(
                'button',
                {
                  className: 'sc-ghost',
                  disabled: busy,
                  onClick: () => {
                    setBusy(true);
                    rpc('finish', {})
                      .then((value) => {
                        setReport(value.report);
                        setReportPath(value.reportPath || null);
                        showToast(`已落盘：${value.reportPath || '（未返回路径）'}`);
                      })
                      .catch((err) => showToast(`落盘失败：${err instanceof Error ? err.message : String(err)}`))
                      .finally(() => setBusy(false));
                  },
                },
                '结束并落盘复盘',
              ),
              report !== null
                ? h('button', { className: 'sc-ghost', onClick: () => copy(report).then(() => showToast('复盘已复制')) }, '复制复盘')
                : null,
            ),
            report !== null
              ? h(
                  'div',
                  null,
                  h('div', { className: 'sc-report' }, h('pre', null, report)),
                  reportPath !== null ? h('div', { className: 'sc-note' }, `已写入：${reportPath}`) : null,
                )
              : h('div', { className: 'sc-empty' }, '点「生成复盘」查看 100 分制复盘；「结束并落盘复盘」写到 面试记录/安全可靠复盘-<时间>.md。'),
          ),

          toast !== '' ? h('div', { className: 'sc-toast' }, toast) : null,
        ),
      );
    }

    const inject = ['slots', 'locale', 'layout'];

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return;
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-safety-cost-teacher';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'safety-cost-teacher: styles');

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 7,
            label: '安全可靠评审',
          },
          ShieldCheckIcon,
        ),
      );

      ctx.slots.inject('main', function* () {
        yield ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
          },
          SafetyCostPage,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
