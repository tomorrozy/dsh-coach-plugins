/**
 * dsh-test-teacher — client half (browser).
 *
 * Bundle-plugin client format: `window.__ModuleLoader__.load({ id, factory })`.
 * The factory is CJS-style and may require only platform seed words
 * (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`);
 * everything else must be self-contained.
 *
 * UI: a global sidebar entry (`sidebar.panellist`, id `test-teacher`) + its page
 * (the `main` keyed slot). The page is a test-and-verification console for the
 * test-verify-coach skill: current test object (T01–T12), its six answers, the
 * teacher-only reference sheet (metrics / conditions / criteria / tools /
 * records / regression / traps) hidden behind a toggle, coverage, the seven
 * scored dimensions, Object bank, copyable commands and the 100-point review.
 * Data comes from the host route POST /plugins/dsh-test-teacher/rpc.
 */

window.__ModuleLoader__.load({
  id: 'dsh-test-teacher',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const h = react.createElement;

    const PANEL_ID = 'test-teacher';
    const RPC_PATH = '/plugins/dsh-test-teacher/rpc';
    const REFRESH_MS = 12000;

    const VERDICT_LABELS = { passed: '通过', weak: '待加强', skipped: '跳过' };

    const CSS = [
      '.tv-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 22px) 26px 40px;color:var(--dsw-alias-label-primary,#1b1f27);background:var(--dsw-alias-bg-base,#fff)}',
      '.tv-inner{max-width:1000px;margin:0 auto}',
      '.tv-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}',
      '.tv-title{font-size:20px;font-weight:650;margin:0}',
      '.tv-sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:4px;line-height:1.5}',
      '.tv-chips{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.tv-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-secondary,#5c6470);white-space:nowrap}',
      '.tv-chip b{font-weight:600;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.tv-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}',
      '.tv-ghost{font:inherit;font-size:12px;padding:5px 10px;border-radius:7px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-secondary,#5c6470);cursor:pointer}',
      '.tv-ghost:hover{color:var(--dsw-alias-label-primary,#1b1f27);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tv-ghost.on{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}',
      '.tv-ghost:disabled{opacity:.5;cursor:default}',
      '.tv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}',
      '.tv-card{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-elevated,#fafbfc);margin-bottom:12px;min-width:0}',
      '.tv-card h3{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.tv-card h3 .tv-tag{font-size:11px;font-weight:500;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-obj{display:flex;align-items:flex-start;gap:12px}',
      '.tv-badge{flex:none;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:12px;font-weight:600;padding:4px 8px;border-radius:7px;background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}',
      '.tv-obj-title{font-size:16px;font-weight:640;line-height:1.45}',
      '.tv-obj-target{font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary,#5c6470);margin-top:4px}',
      '.tv-obj-bg{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:6px}',
      '.tv-evi{font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary,#5c6470);margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-sunken,#eceef2);word-break:break-word}',
      '.tv-evi b{color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.tv-q{margin:0;padding-left:0;list-style:none;font-size:13px;line-height:1.9;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tv-sect{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);margin:14px 0 6px}',
      '.tv-crit{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
      '.tv-crit-row{border-left:3px solid var(--dsw-alias-state-business-primary,#4d6bfe);padding:2px 0 2px 10px}',
      '.tv-crit-head{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:3px;flex-wrap:wrap}',
      '.tv-step{font-weight:640;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.tv-tool{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-check{font-size:13px;line-height:1.6}',
      '.tv-na{font-size:12px;line-height:1.6;margin-top:2px}',
      '.tv-na i{font-style:normal;font-weight:600}',
      '.tv-ok{color:var(--dsw-alias-state-success-primary,#12a150)}',
      '.tv-bad{color:#c4302b}',
      '.tv-met{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:2px}',
      '.tv-met-row{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff)}',
      '.tv-met-head{display:flex;align-items:baseline;gap:6px;font-size:12.5px;font-weight:600}',
      '.tv-met-head em{font-style:normal;font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-met-body{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#5c6470);margin-top:3px}',
      '.tv-list{margin:0;padding-left:18px;font-size:12.5px;line-height:1.85;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tv-traps li{color:#a8402b}',
      '.tv-metrics{display:flex;align-items:baseline;gap:8px}',
      '.tv-big{font-size:26px;font-weight:680;line-height:1}',
      '.tv-small{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-sunken,#eceef2);overflow:hidden;margin-top:9px}',
      '.tv-bar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tv-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;padding:3px 0}',
      '.tv-row span:first-child{color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tv-row span:last-child{font-weight:560}',
      '.tv-dims{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin-top:4px}',
      '.tv-dim{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff)}',
      '.tv-dim b{display:block;font-size:16px;font-weight:660}',
      '.tv-dim em{display:block;font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:1px}',
      '.tv-cmds{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:6px}',
      '.tv-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-base,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.tv-btn:hover{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tv-btn b{font-size:13px;font-weight:600}',
      '.tv-btn em{font-size:11px;font-style:normal;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-bank{display:flex;flex-direction:column;gap:4px;max-height:360px;overflow:auto}',
      '.tv-bank-row{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 6px;border-radius:7px}',
      '.tv-bank-row:hover{background:var(--dsw-alias-bg-sunken,#eceef2)}',
      '.tv-bank-row code{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c);min-width:30px}',
      '.tv-bank-row .tv-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tv-pill{font-size:10.5px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-pill.passed{color:#12a150;border-color:#9cd8b6}',
      '.tv-pill.weak{color:#e0a500;border-color:#ecd58c}',
      '.tv-pill.skipped{color:#8a919c}',
      '.tv-pill.cur{color:#4d6bfe;border-color:#a9b9ff;font-weight:600}',
      '.tv-act{font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-tertiary,#8a919c);cursor:pointer}',
      '.tv-act:hover{color:var(--dsw-alias-label-primary,#1b1f27);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tv-report{margin-top:6px;max-height:360px;overflow:auto;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:9px;padding:10px 12px;background:var(--dsw-alias-bg-base,#fff)}',
      '.tv-report pre{margin:0;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tv-note{font-size:12px;line-height:1.65;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:10px}',
      '.tv-err{color:#c4302b;font-size:13px;margin-top:8px}',
      '.tv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1b1f27;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;z-index:60;opacity:.96;max-width:70vw}',
      '.tv-empty{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tv-hidden-hint{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#8a919c)}',
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
          if (!payload || payload.ok !== true) throw new Error((payload && payload.error) || 'rpc failed');
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

    function TestIcon() {
      return h(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 5, y: 3.5, width: 14, height: 17, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', { d: 'M9 3.5h6v2.2H9z', fill: 'currentColor' }),
        h('path', { d: 'M8.4 9.6l1.6 1.6 2.6-2.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M8.4 15l1.6 1.6 2.6-2.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M15 10.4h2.4M15 15.8h2.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.7 }),
      );
    }

    function Stat(props) {
      return h(
        'div',
        { className: 'tv-card' },
        h('h3', null, props.title, props.tag ? h('span', { className: 'tv-tag' }, props.tag) : null),
        h('div', { className: 'tv-metrics' }, h('span', { className: 'tv-big' }, props.value), h('span', { className: 'tv-small' }, props.unit ?? '')),
        props.children,
      );
    }

    function Metrics(props) {
      const metrics = props.metrics || [];
      if (metrics.length === 0) return h('div', { className: 'tv-empty' }, '题库未提供指标清单。');
      return h(
        'div',
        { className: 'tv-met' },
        metrics.map((metric, index) =>
          h(
            'div',
            { className: 'tv-met-row', key: `m-${index}` },
            h('div', { className: 'tv-met-head' }, metric.name, metric.unit ? h('em', null, `（${metric.unit}）`) : null),
            h(
              'div',
              { className: 'tv-met-body' },
              h('span', { className: 'tv-ok' }, '正常 '),
              metric.normal || '—',
              h('span', { className: 'tv-bad', style: { marginLeft: 8 } }, '异常 '),
              metric.abnormal || '—',
            ),
          ),
        ),
      );
    }

    function Criterion(props) {
      const item = props.item;
      return h(
        'div',
        { className: 'tv-crit-row' },
        h(
          'div',
          { className: 'tv-crit-head' },
          item.step ? h('span', { className: 'tv-step' }, item.step) : null,
          item.tool ? h('span', { className: 'tv-tool' }, `工具：${item.tool}`) : null,
        ),
        h('div', { className: 'tv-check' }, item.check),
        h(
          'div',
          { className: 'tv-na' },
          h('i', { className: 'tv-ok' }, '正常 '),
          item.normal || '（未写判据）',
          h('i', { className: 'tv-bad', style: { marginLeft: 10 } }, '异常 '),
          item.abnormal || '（未写判据）',
        ),
      );
    }

    function BankList(props) {
      const { bank, records, current, onPick, busy } = props;
      const recordById = new Map();
      for (const record of records) recordById.set(record.id, record);
      const groups = new Map();
      for (const item of bank) {
        const bucket = groups.get(item.categoryLabel) ?? [];
        bucket.push(item);
        groups.set(item.categoryLabel, bucket);
      }
      const children = [];
      for (const [label, items] of groups) {
        children.push(h('div', { className: 'tv-row', key: `g-${label}`, style: { marginTop: 6 } }, h('span', null, label), h('span', null, String(items.length))));
        for (const item of items) {
          const record = recordById.get(item.id);
          const isCurrent = current !== null && current !== undefined && current.id === item.id;
          children.push(
            h(
              'div',
              { className: 'tv-bank-row', key: item.id, title: item.target },
              h('code', null, item.id),
              h('span', { className: 'tv-name' }, item.title),
              isCurrent ? h('span', { className: 'tv-pill cur' }, '当前') : null,
              record ? h('span', { className: `tv-pill ${record.verdict}` }, VERDICT_LABELS[record.verdict] ?? record.verdict) : null,
              h('button', { className: 'tv-act', disabled: busy, onClick: () => onPick(item.id) }, isCurrent ? '重开' : '练这题'),
            ),
          );
        }
      }
      return h('div', { className: 'tv-bank' }, children);
    }

    function CoachPage() {
      const [data, setData] = react.useState(null);
      const [error, setError] = react.useState(null);
      const [toast, setToast] = react.useState('');
      const [busy, setBusy] = react.useState(false);
      const [report, setReport] = react.useState(null);
      const [showReference, setShowReference] = react.useState(false);

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
        copy(command).then(() => showToast(`已复制「${command}」，粘贴到输入框发送`));
      };

      const state = data && data.state;
      const stats = data && data.stats;
      const current = data && data.current;
      const bank = (data && data.bankSummary) || [];
      const records = (state && state.records) || [];
      const modes = (data && data.modes) || [];
      const dimensions = (data && data.dimensions) || [];
      const questionIndex = (data && data.questionIndex) || {};

      return h(
        'div',
        { className: 'tv-page' },
        h(
          'div',
          { className: 'tv-inner' },
          h(
            'div',
            { className: 'tv-head' },
            h(TestIcon),
            h(
              'div',
              null,
              h('h1', { className: 'tv-title' }, '测试验证老师'),
              h('div', { className: 'tv-sub' }, '一次一个测试对象：测什么指标 + 怎么构造条件 + 正常/异常判据 + 工具 + 记录与回归'),
            ),
            h(
              'div',
              { className: 'tv-chips' },
              h('span', { className: 'tv-chip' }, '状态 ', h('b', null, state ? state.status : '未开始')),
              h('span', { className: 'tv-chip' }, '覆盖 ', h('b', null, stats ? `${stats.attempted}/${stats.total}` : '-')),
              h('span', { className: 'tv-chip' }, '总分 ', h('b', null, stats ? String(stats.score) : '-')),
            ),
          ),
          h(
            'div',
            { className: 'tv-toolbar' },
            modes.map((mode) =>
              h(
                'button',
                {
                  key: mode.id,
                  className: state && state.mode === mode.id ? 'tv-ghost on' : 'tv-ghost',
                  disabled: busy,
                  onClick: () => run('begin', { mode: mode.id }, `已切到「${mode.label}」并选中下一题`),
                },
                mode.label,
              ),
            ),
            h('button', { className: 'tv-ghost', disabled: busy, onClick: () => run('begin', { id: state && state.current }, '已重新开始当前题') }, '重开当前题'),
            h('button', { className: 'tv-ghost', disabled: busy, onClick: () => run('next', {}, (value) => `下一题：${value.state.current}`) }, '下一题'),
            h('button', { className: 'tv-ghost', disabled: busy, onClick: load }, '刷新'),
          ),
          error !== null ? h('div', { className: 'tv-err' }, `读取失败：${error}`) : null,

          h(
            'div',
            { className: 'tv-card' },
            h('h3', null, '当前测试对象', current ? h('span', { className: 'tv-tag' }, `${current.id} · ${current.categoryLabel}`) : null),
            current
              ? h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'tv-obj' },
                    h('span', { className: 'tv-badge' }, current.id),
                    h(
                      'div',
                      null,
                      h('div', { className: 'tv-obj-title' }, current.title),
                      current.target ? h('div', { className: 'tv-obj-target' }, `被测系统：${current.target}`) : null,
                      current.background ? h('div', { className: 'tv-obj-bg' }, `背景：${current.background}`) : null,
                    ),
                  ),
                  current.project
                    ? h('div', { className: 'tv-evi' }, h('b', null, '工程证据（可核对）：'), current.project.replace(/`/g, ''))
                    : null,
                  h('div', { className: 'tv-note' }, '在会话里按下面 5 问作答，老师会按六项点评并追问；面板只同步进度与底稿。'),
                  h(
                    'div',
                    { className: 'tv-toolbar', style: { marginTop: 10, marginBottom: 0 } },
                    h('button', { className: 'tv-ghost', disabled: busy, onClick: () => run('record', { id: current.id, verdict: 'passed' }, '已记为通过') }, '记：通过'),
                    h('button', { className: 'tv-ghost', disabled: busy, onClick: () => run('record', { id: current.id, verdict: 'weak' }, '已记为待加强') }, '记：待加强'),
                    h('button', { className: 'tv-ghost', disabled: busy, onClick: () => run('skip', {}, '已跳过，可点「下一题」') }, '跳过'),
                  ),
                )
              : h('div', { className: 'tv-empty' }, '还没有当前题。点顶部模式按钮或下面题库里的「练这题」开始；会话里说“开始测试”也能出题。'),

            current && current.questions
              ? h('ol', { className: 'tv-q', style: { marginTop: 12 } }, current.questions.map((question, index) => h('li', { key: `q-${index}` }, question)))
              : null,
            h('div', { className: 'tv-note' }, '【建议熟练回答时间：2-3 分钟】追问 30 秒-1 分钟。缺指标或缺判据会被追问第 1 层；缺复现/回归会被追问第 2 层。'),
          ),

          current
            ? h(
                'div',
                { className: 'tv-card' },
                h(
                  'h3',
                  null,
                  '教练底稿',
                  h('span', { className: 'tv-tag' }, showReference ? '已展开 · 参考答案' : '学员说“参考答案”才给'),
                  h(
                    'button',
                    { className: 'tv-ghost', style: { marginLeft: 'auto' }, disabled: busy, onClick: () => setShowReference(!showReference) },
                    showReference ? '收起底稿' : '显示参考答案',
                  ),
                ),
                showReference
                  ? h(
                      'div',
                      null,
                      h('div', { className: 'tv-sect' }, '指标（数值 + 单位 + 正常/异常范围）'),
                      h(Metrics, { metrics: current.metrics || [] }),
                      h('div', { className: 'tv-sect' }, '测试条件构造'),
                      h('ul', { className: 'tv-list' }, (current.conditions || []).map((item, index) => h('li', { key: `c-${index}` }, item))),
                      h('div', { className: 'tv-sect' }, '判据（每步 正常/异常/工具）'),
                      h('div', { className: 'tv-crit' }, (current.criteria || []).map((item, index) => h(Criterion, { key: `k-${index}`, item }))),
                      h('div', { className: 'tv-sect' }, '工具匹配'),
                      h('ul', { className: 'tv-list' }, (current.tools || []).map((item, index) => h('li', { key: `t-${index}` }, item))),
                      h('div', { className: 'tv-sect' }, '记录表字段'),
                      h('ul', { className: 'tv-list' }, (current.record || []).map((item, index) => h('li', { key: `r-${index}` }, item))),
                      h('div', { className: 'tv-sect' }, '回归看哪几个数'),
                      h('ul', { className: 'tv-list' }, (current.regression || []).map((item, index) => h('li', { key: `g-${index}` }, item))),
                      (current.traps || []).length > 0
                        ? h(
                            'div',
                            null,
                            h('div', { className: 'tv-sect' }, '常见坏习惯'),
                            h('ul', { className: 'tv-list tv-traps' }, current.traps.map((item, index) => h('li', { key: `b-${index}` }, item))),
                          )
                        : null,
                    )
                  : h('div', { className: 'tv-hidden-hint' }, '底稿是老师的参考答案：先自己按 5 问说完，再点开对照。里面有指标数值、条件清单、逐步判据、工具、记录字段、回归项和常见坏习惯。'),
              )
            : null,

          h(
            'div',
            { className: 'tv-grid' },
            h(
              'div',
              { className: 'tv-card' },
              h('h3', null, '覆盖与分项'),
              h('div', { className: 'tv-bar' }, h('i', { style: { width: `${stats ? stats.coverage : 0}%` } })),
              h(
                'div',
                { style: { marginTop: 10 } },
                (stats ? stats.byCategory : []).map((group) =>
                  h('div', { className: 'tv-row', key: group.key }, h('span', null, group.label), h('span', null, `${group.done} / ${group.total}`)),
                ),
                h('div', { className: 'tv-row' }, h('span', null, '通过 / 待加强 / 跳过'), h('span', null, stats ? `${stats.passed} / ${stats.weak} / ${stats.skipped}` : '-')),
                h('div', { className: 'tv-row' }, h('span', null, '练习用时'), h('span', null, stats ? fmtSeconds(stats.totalSeconds) : '-')),
              ),
              h('div', { className: 'tv-note', style: { marginTop: 4, wordBreak: 'break-all' } }, `状态文件：${data ? data.paths.state : '-'}`),
              h(
                'div',
                { className: 'tv-dims' },
                dimensions.map((dimension) =>
                  h(
                    'div',
                    { className: 'tv-dim', key: dimension.key },
                    h('b', null, dimension.samples > 0 ? String(dimension.value) : '—'),
                    h('em', null, dimension.label),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'tv-card' },
              h('h3', null, '标准测试框架', h('span', { className: 'tv-tag' }, '学员说“参考答案”时讲')),
              h(
                'ol',
                { className: 'tv-list', style: { marginTop: 2 } },
                [
                  '明确测试目标：功能正确、性能达标、稳定性、边界鲁棒性、异常安全。',
                  '定义指标：数值 + 单位 + 正常范围 + 通过标准。',
                  '构造条件：输入范围、环境、负载、电压、温度、连续时长、异常注入。',
                  '采集工具：万用表/示波器/逻辑分析仪/串口/VOFA+/日志/统计。',
                  '记录表：用例编号、条件、输入、预期、实际、结论、版本、日期。',
                  '回归：改代码/改参数/换硬件后重跑关键用例，对比指标是否退化。',
                  '结论：通过 / 不通过 / 有条件通过，附证据。',
                ].map((line, index) => h('li', { key: `f-${index}` }, line)),
              ),
              current && current.project
                ? h('div', { className: 'tv-note' }, '底稿中的“工程证据”全部来自 遥控/ 与 FreeRTOS小车/ 的真实代码：协议 0xA5/0x0D/13 字节、PID kp2.0/ki1.5/kd0、TIM2 20kHz、TIM3/TIM4 编码器、FreeRTOS 20ms 任务。')
                : null,
            ),
          ),

          h(
            'div',
            { className: 'tv-card' },
            h('h3', null, '测试对象题库', h('span', { className: 'tv-tag' }, `${bank.length} 条 · 来自真实工程`)),
            h(BankList, {
              bank,
              records,
              current,
              busy,
              onPick: (id) => run('begin', { id }, `已选中 ${id}`),
            }),
            Object.keys(questionIndex).length > 0
              ? h(
                  'div',
                  { className: 'tv-note' },
                  `已抽过：${Object.entries(questionIndex)
                    .map(([id, index]) => `${id}=第${index}题`)
                    .join('、')}`,
                )
              : null,
          ),

          h(
            'div',
            { className: 'tv-card' },
            h('h3', null, '面试命令（复制后粘到输入框发送）'),
            h(
              'div',
              { className: 'tv-cmds' },
              h('button', { className: 'tv-btn', onClick: copyCommand('开始测试') }, h('b', null, '开始测试'), h('em', null, '抽第 1 题并同步面板')),
              h('button', { className: 'tv-btn', onClick: copyCommand('提示') }, h('b', null, '提示'), h('em', null, '只给 1 条方向')),
              h('button', { className: 'tv-btn', onClick: copyCommand('参考答案') }, h('b', null, '参考答案'), h('em', null, '给标准测试框架')),
              h('button', { className: 'tv-btn', onClick: copyCommand('跳过') }, h('b', null, '跳过'), h('em', null, '换对象并记为跳过')),
              h('button', { className: 'tv-btn', onClick: copyCommand('只练通信') }, h('b', null, '只练通信'), h('em', null, 'T01/T04/T06/T07')),
              h('button', { className: 'tv-btn', onClick: copyCommand('只练控制') }, h('b', null, '只练控制'), h('em', null, 'T02/T03/T05/T09')),
              h('button', { className: 'tv-btn', onClick: copyCommand('只练记录') }, h('b', null, '只练记录'), h('em', null, 'T10/T11/T12')),
              h('button', { className: 'tv-btn', onClick: copyCommand('结束测试') }, h('b', null, '结束测试'), h('em', null, '100 分制复盘')),
            ),
            h('div', { className: 'tv-note' }, '面板只记录进度、展示底稿；讲评与追问在会话里进行。数据来源：data/test-objects.json + 左侧栏状态文件。'),
          ),

          h(
            'div',
            { className: 'tv-card' },
            h('h3', null, '复盘'),
            h(
              'div',
              { className: 'tv-toolbar', style: { marginBottom: 8 } },
              h(
                'button',
                {
                  className: 'tv-ghost',
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
                  className: 'tv-ghost',
                  disabled: busy,
                  onClick: () => {
                    setBusy(true);
                    rpc('finish', {})
                      .then((value) => {
                        setReport(value.report);
                        showToast(`已落盘：${value.reportPath}`);
                      })
                      .catch((err) => showToast(`落盘失败：${err instanceof Error ? err.message : String(err)}`))
                      .finally(() => setBusy(false));
                  },
                },
                '结束并落盘复盘',
              ),
              report !== null ? h('button', { className: 'tv-ghost', onClick: () => copy(report).then(() => showToast('复盘已复制')) }, '复制复盘') : null,
            ),
            report !== null
              ? h('div', { className: 'tv-report' }, h('pre', null, report))
              : h('div', { className: 'tv-empty' }, '点「生成复盘」查看 100 分制复盘；「结束并落盘复盘」会写到 面试记录/测试验证复盘-<时间>.md。'),
          ),
          toast !== '' ? h('div', { className: 'tv-toast' }, toast) : null,
        ),
      );
    }

    const inject = ['slots', 'locale', 'layout'];

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return;
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-test-teacher';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'test-teacher: styles');

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 8,
            label: '测试验证',
          },
          TestIcon,
        ),
      );

      ctx.slots.inject('main', function* () {
        yield ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
          },
          CoachPage,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
