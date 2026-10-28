/**
 * dsh-troubleshoot-teacher — client half (browser).
 *
 * Bundle-plugin client format: `window.__ModuleLoader__.load({ id, factory })`.
 * The factory is CJS-style and may require only platform seed words
 * (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`);
 * everything else must be self-contained.
 *
 * UI: a global sidebar entry (`sidebar.panellist`) + its page (`main` keyed
 * slot). The page is a training console for the troubleshoot-coach skill:
 * current fault phenomenon, the four required answers, per-step criteria
 * (normal / abnormal / instrument), the standard framework, coverage and the
 * seven scored dimensions. Data comes from the host route
 * POST /plugins/dsh-troubleshoot-teacher/rpc.
 */

window.__ModuleLoader__.load({
  id: 'dsh-troubleshoot-teacher',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const h = react.createElement;

    const PANEL_ID = 'troubleshoot-teacher';
    const RPC_PATH = '/plugins/dsh-troubleshoot-teacher/rpc';
    const REFRESH_MS = 12000;

    const LAYER_COLORS = {
      供电: '#e0a500',
      地: '#b8860b',
      信号: '#4d6bfe',
      协议: '#7c5cff',
      执行: '#12a150',
      显示: '#12a3a3',
    };

    const VERDICT_LABELS = { passed: '通过', weak: '待加强', skipped: '跳过' };

    const CSS = [
      '.tc-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 22px) 26px 40px;color:var(--dsw-alias-label-primary,#1b1f27);background:var(--dsw-alias-bg-base,#fff)}',
      '.tc-inner{max-width:980px;margin:0 auto}',
      '.tc-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}',
      '.tc-head-icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;flex:none;background:var(--dsw-alias-bg-elevated,#fafbfc);border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tc-title{font-size:20px;font-weight:650;margin:0}',
      '.tc-sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:4px;line-height:1.5}',
      '.tc-chips{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.tc-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-secondary,#5c6470);white-space:nowrap}',
      '.tc-chip b{font-weight:600;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.tc-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}',
      '.tc-ghost{font:inherit;font-size:12px;padding:5px 10px;border-radius:7px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-secondary,#5c6470);cursor:pointer}',
      '.tc-ghost:hover{color:var(--dsw-alias-label-primary,#1b1f27);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tc-ghost.on{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}',
      '.tc-ghost:disabled{opacity:.5;cursor:default}',
      '.tc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}',
      '.tc-card{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-elevated,#fafbfc);margin-bottom:12px}',
      '.tc-card h3{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);display:flex;align-items:center;gap:8px}',
      '.tc-card h3 .tc-tag{font-size:11px;font-weight:500;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tc-pheno{display:flex;align-items:flex-start;gap:12px}',
      '.tc-badge{flex:none;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:12px;font-weight:600;padding:4px 8px;border-radius:7px;background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}',
      '.tc-pheno-title{font-size:16px;font-weight:640;line-height:1.45}',
      '.tc-pheno-sym{font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary,#5c6470);margin-top:4px}',
      '.tc-pheno-bg{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:6px}',
      '.tc-q{margin:0;padding-left:18px;font-size:13px;line-height:1.9;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tc-crit{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
      '.tc-crit-row{border-left:3px solid var(--dsw-alias-line-normal,#e7e9ee);padding:2px 0 2px 10px}',
      '.tc-crit-head{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:3px}',
      '.tc-step{font-weight:640;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.tc-layer{font-size:11px;padding:1px 7px;border-radius:999px;color:#fff}',
      '.tc-tool{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tc-check{font-size:13px;line-height:1.6}',
      '.tc-na{font-size:12px;line-height:1.6;margin-top:2px}',
      '.tc-na i{font-style:normal;font-weight:600}',
      '.tc-ok{color:var(--dsw-alias-state-success-primary,#12a150)}',
      '.tc-bad{color:#c4302b}',
      '.tc-list{margin:0;padding-left:18px;font-size:12.5px;line-height:1.85;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tc-traps li{color:#a8402b}',
      '.tc-metrics{display:flex;align-items:baseline;gap:8px}',
      '.tc-big{font-size:26px;font-weight:680;line-height:1}',
      '.tc-small{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tc-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-sunken,#eceef2);overflow:hidden;margin-top:9px}',
      '.tc-bar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tc-bar.green>i{background:var(--dsw-alias-state-success-primary,#12a150)}',
      '.tc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;padding:3px 0}',
      '.tc-row span:first-child{color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tc-row span:last-child{font-weight:560}',
      '.tc-dims{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:4px}',
      '.tc-dim{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff)}',
      '.tc-dim b{display:block;font-size:16px;font-weight:660}',
      '.tc-dim em{display:block;font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:1px}',
      '.tc-cmds{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:6px}',
      '.tc-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-base,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.tc-btn:hover{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tc-btn b{font-size:13px;font-weight:600}',
      '.tc-btn em{font-size:11px;font-style:normal;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tc-bank{display:flex;flex-direction:column;gap:5px;max-height:330px;overflow:auto}',
      '.tc-bank-row{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:4px 6px;border-radius:7px}',
      '.tc-bank-row:hover{background:var(--dsw-alias-bg-sunken,#eceef2)}',
      '.tc-bank-row code{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,#8a919c);min-width:30px}',
      '.tc-bank-row .tc-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tc-pill{font-size:10.5px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.tc-pill.passed{color:#12a150;border-color:#9cd8b6}',
      '.tc-pill.weak{color:#e0a500;border-color:#ecd58c}',
      '.tc-pill.skipped{color:#8a919c}',
      '.tc-pill.cur{color:#4d6bfe;border-color:#a9b9ff;font-weight:600}',
      '.tc-act{font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-tertiary,#8a919c);cursor:pointer}',
      '.tc-act:hover{color:var(--dsw-alias-label-primary,#1b1f27);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tc-report{margin-top:6px;max-height:360px;overflow:auto;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:9px;padding:10px 12px;background:var(--dsw-alias-bg-base,#fff)}',
      '.tc-report pre{margin:0;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.tc-note{font-size:12px;line-height:1.65;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:10px}',
      '.tc-err{color:#c4302b;font-size:13px;margin-top:8px}',
      '.tc-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1b1f27;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;z-index:60;opacity:.96;max-width:70vw}',
      '.tc-empty{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#8a919c)}',
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

    function pct(value, total) {
      if (!total) return 0;
      return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
    }

    function fmtSeconds(total) {
      const seconds = Math.max(0, Math.round(Number(total) || 0));
      return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
    }

    function CoachIcon() {
      return h(
        'svg',
        { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 10.4, cy: 10.4, r: 6.4, stroke: 'currentColor', strokeWidth: 1.9 }),
        h('path', { d: 'M15.2 15.2 20.4 20.4', stroke: 'currentColor', strokeWidth: 2.1, strokeLinecap: 'round' }),
        h('path', { d: 'M7.2 9.2c.7-1.3 3-1.3 3.7 0M7.2 12.6c.7 1.3 3 1.3 3.7 0', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('path', { d: 'M10.55 8.2v5', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.55 }),
      );
    }

    function Stat(props) {
      return h(
        'div',
        { className: 'tc-card' },
        h('h3', null, props.title, props.tag ? h('span', { className: 'tc-tag' }, props.tag) : null),
        h('div', { className: 'tc-metrics' }, h('span', { className: 'tc-big' }, props.value), h('span', { className: 'tc-small' }, props.unit ?? '')),
        props.children,
      );
    }

    function Criterion(props) {
      const item = props.item;
      const color = LAYER_COLORS[item.layer] || 'var(--dsw-alias-label-tertiary,#8a919c)';
      return h(
        'div',
        { className: 'tc-crit-row', style: { borderLeftColor: color } },
        h(
          'div',
          { className: 'tc-crit-head' },
          item.step ? h('span', { className: 'tc-step' }, item.step) : null,
          item.layer ? h('span', { className: 'tc-layer', style: { background: color } }, item.layer) : null,
          item.tool ? h('span', { className: 'tc-tool' }, `工具：${item.tool}`) : null,
        ),
        h('div', { className: 'tc-check' }, item.check),
        h(
          'div',
          { className: 'tc-na' },
          h('i', { className: 'tc-ok' }, '正常 '),
          item.normal || '（未写判据）',
          h('i', { className: 'tc-bad', style: { marginLeft: 10 } }, '异常 '),
          item.abnormal || '（未写判据）',
        ),
      );
    }

    function PhenomenaBank(props) {
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
        children.push(h('div', { className: 'tc-row', key: `g-${label}`, style: { marginTop: 6 } }, h('span', null, label), h('span', null, String(items.length))));
        for (const item of items) {
          const record = recordById.get(item.id);
          const isCurrent = current !== null && current !== undefined && current.id === item.id;
          children.push(
            h(
              'div',
              { className: 'tc-bank-row', key: item.id, title: item.symptom },
              h('code', null, item.id),
              h('span', { className: 'tc-name' }, item.title),
              isCurrent ? h('span', { className: 'tc-pill cur' }, '当前') : null,
              record ? h('span', { className: `tc-pill ${record.verdict}` }, VERDICT_LABELS[record.verdict] ?? record.verdict) : null,
              h('button', { className: 'tc-act', disabled: busy, onClick: () => onPick(item.id) }, isCurrent ? '重开' : '练这题'),
            ),
          );
        }
      }
      return h('div', { className: 'tc-bank' }, children);
    }

    function CoachPage() {
      const [data, setData] = react.useState(null);
      const [error, setError] = react.useState(null);
      const [toast, setToast] = react.useState('');
      const [busy, setBusy] = react.useState(false);
      const [report, setReport] = react.useState(null);

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

      return h(
        'div',
        { className: 'tc-page' },
        h(
          'div',
          { className: 'tc-inner' },
          h(
            'div',
            { className: 'tc-head' },
            h('span', { className: 'tc-head-icon' }, h(CoachIcon)),
            h(
              'div',
              null,
              h('h1', { className: 'tc-title' }, '排错教练'),
              h('div', { className: 'tc-sub' }, '排错方法论老师 · 一次一题：排查顺序 + 每步判据 + 工具 + 异常分支 + 记录'),
            ),
            h(
              'div',
              { className: 'tc-chips' },
              h('span', { className: 'tc-chip' }, '状态 ', h('b', null, state ? state.status : '未开始')),
              h('span', { className: 'tc-chip' }, '覆盖 ', h('b', null, stats ? `${stats.attempted}/${stats.total}` : '-')),
              h('span', { className: 'tc-chip' }, '总分 ', h('b', null, stats ? String(stats.score) : '-')),
            ),
          ),
          h(
            'div',
            { className: 'tc-toolbar' },
            modes.map((mode) =>
              h(
                'button',
                {
                  key: mode.id,
                  className: state && state.mode === mode.id ? 'tc-ghost on' : 'tc-ghost',
                  disabled: busy,
                  onClick: () => run('begin', { mode: mode.id }, `已切到「${mode.label}」并选中下一题`),
                },
                mode.label,
              ),
            ),
            h('button', { className: 'tc-ghost', disabled: busy, onClick: () => run('begin', { id: state && state.current }, '已重新开始当前题') }, '重开当前题'),            h('button', { className: 'tc-ghost', disabled: busy, onClick: () => run('next', {}, (value) => `下一题：${value.state.current}`) }, '下一题'),
            h('button', { className: 'tc-ghost', disabled: busy, onClick: load }, '刷新'),
          ),
          error !== null ? h('div', { className: 'tc-err' }, `读取失败：${error}`) : null,

          h(
            'div',
            { className: 'tc-card' },
            h('h3', null, '当前现象', current ? h('span', { className: 'tc-tag' }, `${current.id} · ${current.categoryLabel}`) : null),
            current
              ? h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'tc-pheno' },
                    h('span', { className: 'tc-badge' }, current.id),
                    h(
                      'div',
                      null,
                      h('div', { className: 'tc-pheno-title' }, current.title),
                      h('div', { className: 'tc-pheno-sym' }, current.symptom),
                      current.background ? h('div', { className: 'tc-pheno-bg' }, `背景：${current.background}`) : null,
                    ),
                  ),
                  h('div', { className: 'tc-note' }, '在会话里回答，教练会按六项点评并追问；面板同步显示判据与标准框架。'),
                  h(
                    'div',
                    { className: 'tc-toolbar', style: { marginTop: 10, marginBottom: 0 } },
                    h('button', { className: 'tc-ghost', disabled: busy, onClick: () => run('record', { id: current.id, verdict: 'passed' }, '已记为通过') }, '记：通过'),
                    h('button', { className: 'tc-ghost', disabled: busy, onClick: () => run('record', { id: current.id, verdict: 'weak' }, '已记为待加强') }, '记：待加强'),
                    h('button', { className: 'tc-ghost', disabled: busy, onClick: () => run('skip', {}, '已跳过，可点「下一题」') }, '跳过'),
                  ),
                )
              : h('div', { className: 'tc-empty' }, '还没有当前题。点顶部模式按钮或下面题库里的「练这题」开始；会话里说“开始排错”也能出题。'),

            current && current.questions
              ? h('ol', { className: 'tc-q', style: { marginTop: 12 } }, current.questions.map((question, index) => h('li', { key: `q-${index}` }, question)))
              : null,
            h('div', { className: 'tc-note' }, '【建议熟练回答时间：2-3 分钟】追问 30 秒-1 分钟。缺判据或跳步会被追问第 1 层；缺隔离/复现/记录会被追问第 2 层。'),
          ),

          current && current.criteria && current.criteria.length > 0
            ? h(
                'div',
                { className: 'tc-card' },
                h('h3', null, '判据清单', h('span', { className: 'tc-tag' }, `${current.criteria.length} 步 · 每步正常/异常`)),
                h('div', { className: 'tc-crit' }, current.criteria.map((item, index) => h(Criterion, { key: `c-${index}`, item }))),
                current.layers && current.layers.length > 0
                  ? h(
                      'div',
                      { className: 'tc-row', style: { marginTop: 10 } },
                      h('span', null, '分层顺序'),
                      h('span', null, current.layers.join(' → ')),
                    )
                  : null,
              )
            : null,

          h(
            'div',
            { className: 'tc-grid' },
            h(
              'div',
              { className: 'tc-card' },
              h('h3', null, '覆盖与分项'),
              h('div', { className: 'tc-bar' }, h('i', { style: { width: `${stats ? stats.coverage : 0}%` } })),
              h(
                'div',
                { style: { marginTop: 10 } },
                (stats ? stats.byCategory : []).map((group) =>
                  h('div', { className: 'tc-row', key: group.key }, h('span', null, group.label), h('span', null, `${group.done} / ${group.total}`)),
                ),
                h('div', { className: 'tc-row' }, h('span', null, '通过 / 待加强 / 跳过'), h('span', null, stats ? `${stats.passed} / ${stats.weak} / ${stats.skipped}` : '-')),
                h('div', { className: 'tc-row' }, h('span', null, '练习用时'), h('span', null, stats ? fmtSeconds(stats.totalSeconds) : '-')),
                h('div', { className: 'tc-row' }, h('span', null, '状态文件'), h('span', { className: 'tc-small' }, data ? data.paths.state : '-')),
              ),
              h(
                'div',
                { className: 'tc-dims' },
                dimensions.map((dimension) =>
                  h(
                    'div',
                    { className: 'tc-dim', key: dimension.key },
                    h('b', null, dimension.samples > 0 ? String(dimension.value) : '—'),
                    h('em', null, dimension.label),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'tc-card' },
              h('h3', null, '标准排查框架', h('span', { className: 'tc-tag' }, '学员说“参考答案”时给')),
              h(
                'ol',
                { className: 'tc-list', style: { marginTop: 2 } },
                [
                  '复现并记录现象：何时、何条件、多大概率、是否可重复。',
                  '分层隔离：供电 → 地 → 信号 → 协议 → 执行 → 显示，先排除共性问题。',
                  '先静态后动态：断电测通断/短路/反接，上电测电压，再跑动态。',
                  '先单模块后联调：单模块自测 → 两两联调 → 全系统。',
                  '每步给判据：正常值/异常值、波形特征、返回值、现象变化。',
                  '异常分支：换线/换板/换口/降速/分段短接，缩小范围。',
                  '记录与回归：改了什么、结果如何、是否可复现。',
                ].map((line, index) => h('li', { key: `f-${index}` }, line)),
              ),
              current && current.hardware && current.hardware.length > 0
                ? h('div', { className: 'tc-note' }, `关联硬件考点：${current.hardware.join('、')}（可在「硬件面试台」继续练）`)
                : null,
            ),
          ),

          h(
            'div',
            { className: 'tc-card' },
            h('h3', null, '现象题库', h('span', { className: 'tc-tag' }, `${bank.length} 条 · 来自真实项目`)),
            h(PhenomenaBank, {
              bank,
              records,
              current,
              busy,
              onPick: (id) => run('begin', { id }, `已选中 ${id}`),
            }),
          ),

          h(
            'div',
            { className: 'tc-card' },
            h('h3', null, '面试命令（复制后粘到输入框发送）'),
            h(
              'div',
              { className: 'tc-cmds' },
              h('button', { className: 'tc-btn', onClick: copyCommand('开始排错') }, h('b', null, '开始排错'), h('em', null, '抽第 1 题并同步面板')),
              h('button', { className: 'tc-btn', onClick: copyCommand('提示') }, h('b', null, '提示'), h('em', null, '只给 1 条方向')),
              h('button', { className: 'tc-btn', onClick: copyCommand('参考答案') }, h('b', null, '参考答案'), h('em', null, '给标准排查框架')),
              h('button', { className: 'tc-btn', onClick: copyCommand('跳过') }, h('b', null, '跳过'), h('em', null, '换现象并记未覆盖')),
              h('button', { className: 'tc-btn', onClick: copyCommand('只练通信') }, h('b', null, '只练通信'), h('em', null, 'P01/P04/P09/P15')),
              h('button', { className: 'tc-btn', onClick: copyCommand('只练电机') }, h('b', null, '只练电机'), h('em', null, 'P02/P06/P10/P16')),
              h('button', { className: 'tc-btn', onClick: copyCommand('只练传感器') }, h('b', null, '只练传感器'), h('em', null, 'P03/P05/P11/P13')),
              h('button', { className: 'tc-btn', onClick: copyCommand('结束排错') }, h('b', null, '结束排错'), h('em', null, '100 分制复盘')),
            ),
            h('div', { className: 'tc-note' }, '面板只读/只记录进度；讲评与追问在会话里进行。数据来源：data/phenomena.json + 左侧栏状态文件。'),
          ),

          h(
            'div',
            { className: 'tc-card' },
            h('h3', null, '复盘'),
            h(
              'div',
              { className: 'tc-toolbar', style: { marginBottom: 8 } },
              h(
                'button',
                {
                  className: 'tc-ghost',
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
                  className: 'tc-ghost',
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
              report !== null
                ? h('button', { className: 'tc-ghost', onClick: () => copy(report).then(() => showToast('复盘已复制')) }, '复制复盘')
                : null,
            ),
            report !== null
              ? h('div', { className: 'tc-report' }, h('pre', null, report))
              : h('div', { className: 'tc-empty' }, '点「生成复盘」查看 100 分制复盘；「结束并落盘复盘」会写到 面试记录/排错复盘-<时间>.md。'),
          ),
          toast !== '' ? h('div', { className: 'tc-toast' }, toast) : null,
        ),
      );
    }

    const inject = ['slots', 'locale', 'layout'];

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return;
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-troubleshoot-teacher';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'troubleshoot-teacher: styles');

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 6,
            label: '排错教练',
          },
          CoachIcon,
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
