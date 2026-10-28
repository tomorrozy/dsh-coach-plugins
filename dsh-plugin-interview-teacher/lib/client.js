/**
 * dsh-interview-teacher — client half (browser).
 *
 * Bundle-plugin client format: `window.__ModuleLoader__.load({ id, factory })`.
 * The factory is CJS-style and may require only platform seed words
 * (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`);
 * everything else must be self-contained.
 *
 * UI: a global sidebar entry (`sidebar.panellist`) + its page (`main` keyed
 * slot). The page is a read-only console for the taurus-interview skill:
 * interview state, 81-point coverage progress, and copy-ready commands.
 * Data comes from the host route POST /plugins/dsh-interview-teacher/rpc.
 */

window.__ModuleLoader__.load({
  id: 'dsh-interview-teacher',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const h = react.createElement;

    const PANEL_ID = 'interview-teacher';
    const RPC_PATH = '/plugins/dsh-interview-teacher/rpc';
    const REFRESH_MS = 15000;

    const CSS = [
      '.it-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 22px) 26px 40px;color:var(--dsw-alias-label-primary,#1b1f27);background:var(--dsw-alias-bg-base,#fff)}',
      '.it-inner{max-width:920px;margin:0 auto}',
      '.it-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:18px}',
      '.it-title{font-size:20px;font-weight:650;margin:0}',
      '.it-sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:4px}',
      '.it-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.it-chip b{font-weight:600;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.it-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}',
      '.it-card{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-elevated,#fafbfc)}',
      '.it-card h3{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.it-metrics{display:flex;align-items:baseline;gap:8px}',
      '.it-big{font-size:26px;font-weight:680;line-height:1}',
      '.it-small{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.it-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-sunken,#eceef2);overflow:hidden;margin-top:10px}',
      '.it-bar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.it-bar.green>i{background:var(--dsw-alias-state-success-primary,#12a150)}',
      '.it-bar.amber>i{background:#e0a500}',
      '.it-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;padding:5px 0}',
      '.it-row span:first-child{color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.it-row span:last-child{font-weight:560}',
      '.it-cmds{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:6px}',
      '.it-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-base,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.it-btn:hover{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.it-btn b{font-size:13px;font-weight:600}',
      '.it-btn em{font-size:11px;font-style:normal;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.it-points{margin-top:6px;display:flex;flex-direction:column;gap:2px;max-height:210px;overflow:auto;font-size:12px}',
      '.it-point{display:flex;gap:8px;padding:3px 0;border-bottom:1px dashed var(--dsw-alias-line-normal,#eef0f4)}',
      '.it-point code{font-family:var(--dsw-font-family-mono,ui-monospace);color:var(--dsw-alias-label-tertiary,#8a919c);min-width:34px}',
      '.it-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:10px}',
      '.it-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1b1f27;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;z-index:60;opacity:.96}',
      '.it-err{color:#c4302b;font-size:13px;margin-top:8px}',
      '.it-toolbar{display:flex;gap:8px;margin-bottom:16px}',
      '.it-ghost{font:inherit;font-size:12px;padding:5px 10px;border-radius:7px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-secondary,#5c6470);cursor:pointer}',
      '.it-ghost:hover{color:var(--dsw-alias-label-primary,#1b1f27)}',
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

    function InterviewTeacherIcon() {
      return h(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3.5 8.5 12 4l8.5 4.5L12 13 3.5 8.5Z',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M6.5 10.8v5.1c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9v-5.1',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('path', { d: 'M20.5 8.6v5.2', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      );
    }

    function Stat(props) {
      return h(
        'div',
        { className: 'it-card' },
        h('h3', null, props.title),
        h(
          'div',
          { className: 'it-metrics' },
          h('span', { className: 'it-big' }, props.value),
          h('span', { className: 'it-small' }, props.unit ?? ''),
        ),
        props.children,
      );
    }

    function InterviewTeacherPage() {
      const [data, setData] = react.useState(null);
      const [error, setError] = react.useState(null);
      const [toast, setToast] = react.useState('');
      const [busy, setBusy] = react.useState(false);

      const load = react.useCallback(() => {
        setBusy(true);
        rpc('console')
          .then((value) => {
            setData(value);
            setError(null);
          })
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      }, []);

      react.useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
      }, [load]);

      const showToast = (text) => {
        setToast(text);
        setTimeout(() => setToast(''), 1800);
      };

      // 专属开场提示词：点「开始面试」复制这一整段，粘到会话里即可按三面面试老师的规则开工
      const START_PROMPT = `开始面试。用嵌入式/电控岗 AI 面试老师（taurus-interview）：先识别文件性质——Taurus 2027电控组三面.pdf 是需求文档，main.c 等是我自写，其余 delay/sys/usart/stm32f10x 系列算库模板——拆出最小考核点清单后再逐点出题。

规则：
1. 一次只出一题，标注【来源】【覆盖考核点】【建议熟练回答时间】，然后停下等我答；
2. 不替我给答案；没考到的点结束时要写清原因；
3. 每题结果写进 面试记录/interview_state.md，可跨会话续；
4. 我说“只看自写代码 / 只看需求文档 / 重拆考核点”就照做；
5. 我说“结束面试”时输出 100 分制复盘 + 考核点覆盖矩阵 + 下一轮重点。`;

      const send = (command) => () => {
        copy(command).then(() => showToast(`已复制「${command}」，粘贴到输入框发送`));
      };

      const sendPrompt = () => {
        copy(START_PROMPT).then(() => showToast('已复制专属开场提示词，粘贴到输入框发送'));
      };

      const state = data && data.state;
      const checklist = data && data.checklist;
      const doneCount = state && state.doneIds ? state.doneIds.length : 0;
      const total = checklist ? checklist.total : 81;
      const groups = checklist ? checklist.groups : { D: 30, S: 36, L: 15 };
      const doneGroups = { D: 0, S: 0, L: 0 };
      if (state && state.doneIds) {
        for (const id of state.doneIds) if (doneGroups[id[0]] !== undefined) doneGroups[id[0]] += 1;
      }
      const scoreEntries = state && state.scores ? Object.entries(state.scores) : [];

      return h(
        'div',
        { className: 'it-page' },
        h(
          'div',
          { className: 'it-inner' },
          h(
            'div',
            { className: 'it-head' },
            h(InterviewTeacherIcon),
            h(
              'div',
              null,
              h('h1', { className: 'it-title' }, '面试老师'),
              h('div', { className: 'it-sub' }, 'Taurus 2027 电控组三面 · 考核点制（D 需求 / S 自写代码 / L 库模板）'),
            ),
            h(
              'div',
              { style: { marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' } },
              h('span', { className: 'it-chip' }, '状态 ', h('b', null, state ? state.status : '未开始')),
              h('span', { className: 'it-chip' }, '题号 ', h('b', null, state ? state.progress : '0/81')),
              h('span', { className: 'it-chip' }, '模式 ', h('b', null, state ? state.mode : '-')),
            ),
          ),
          h(
            'div',
            { className: 'it-toolbar' },
            h('button', { className: 'it-ghost', onClick: load, disabled: busy }, busy ? '刷新中…' : '刷新状态'),
            h('button', { className: 'it-ghost', onClick: () => showToast(data ? data.paths.state : '未加载') }, '状态文件路径'),
          ),
          error !== null ? h('div', { className: 'it-err' }, `读取失败：${error}`) : null,
          h(
            'div',
            { className: 'it-grid' },
            h(
              Stat,
              { title: '总体覆盖', value: `${doneCount}/${total}`, unit: `已考 ${pct(doneCount, total)}%` },
              h('div', { className: 'it-bar' }, h('i', { style: { width: `${pct(doneCount, total)}%` } })),
              h(
                'div',
                { style: { marginTop: 10 } },
                ['D', 'S', 'L'].map((key) =>
                  h(
                    'div',
                    { className: 'it-row', key },
                    h('span', null, { D: '需求文档', S: '自写代码', L: '库/模板' }[key]),
                    h('span', null, `${doneGroups[key]} / ${groups[key]}`),
                  ),
                ),
              ),
            ),
            h(
              Stat,
              { title: '当前题' },
              h('div', { style: { fontSize: 14, fontWeight: 560, lineHeight: 1.5 } }, state && state.current !== '-' ? state.current : '尚未开始'),
              h(
                'div',
                { className: 'it-note' },
                `建议时间 ${state ? state.suggestTime : '-'} · 实际 ${state ? state.actualTime : '-'} · 更新 ${state ? state.updatedAt : '-'}`,
              ),
            ),
            h(
              Stat,
              { title: '分项得分' },
              scoreEntries.length === 0
                ? h('div', { className: 'it-note' }, '面试结束后写入')
                : scoreEntries.map(([label, s]) =>
                    h(
                      'div',
                      { className: 'it-row', key: label },
                      h('span', null, label),
                      h('span', null, `${s.value} / ${s.max}`),
                    ),
                  ),
            ),
          ),
          h(
            'div',
            { className: 'it-card', style: { marginTop: 12 } },
            h('h3', null, '面试命令（复制后粘到输入框发送）'),
            h(
              'div',
              { className: 'it-cmds' },
              h('button', { className: 'it-btn', onClick: sendPrompt }, h('b', null, '开始面试'), h('em', null, '专属开场提示词（含规则）')),
              h('button', { className: 'it-btn', onClick: send('继续面试') }, h('b', null, '继续面试'), h('em', null, '从断点接续，不重复已考')),
              h('button', { className: 'it-btn', onClick: send('提示') }, h('b', null, '提示'), h('em', null, '只给 1 条思路')),
              h('button', { className: 'it-btn', onClick: send('参考答案') }, h('b', null, '参考答案'), h('em', null, '只给回答框架')),
              h('button', { className: 'it-btn', onClick: send('跳过') }, h('b', null, '跳过'), h('em', null, '换题并记未覆盖')),
              h('button', { className: 'it-btn', onClick: send('只看自写代码') }, h('b', null, '只看自写代码'), h('em', null, '只考 S 系列 36 点')),
              h('button', { className: 'it-btn', onClick: send('重拆考核点') }, h('b', null, '重拆考核点'), h('em', null, '重新识别文件并拆解')),
              h('button', { className: 'it-btn', onClick: send('结束面试') }, h('b', null, '结束面试'), h('em', null, '100 分制复盘 + 覆盖矩阵')),
            ),
            h(
              'div',
              { className: 'it-note' },
              '面板只读运行状态；面试对话本身在会话里进行。字段来源：interview_state.md · 考核点清单.md。',
            ),
          ),
          h(
            'div',
            { className: 'it-grid', style: { marginTop: 12 } },
            h(
              'div',
              { className: 'it-card' },
              h('h3', null, `考核点清单${checklist ? `（${checklist.total} 点，必考 ${checklist.required}）` : ''}`),
              h(
                'div',
                { className: 'it-points' },
                (checklist ? checklist.points : []).map((point) =>
                  h(
                    'div',
                    { className: 'it-point', key: point.id },
                    h('code', null, point.id),
                    h('span', null, point.point),
                  ),
                ),
              ),
              checklist === undefined || checklist === null
                ? h('div', { className: 'it-note' }, '清单文件未找到，先加载 taurus-interview 技能。')
                : null,
            ),
            h(
              'div',
              { className: 'it-card' },
              h('h3', null, '面试记录'),
              data && data.reviews && data.reviews.length > 0
                ? data.reviews.map((review) =>
                    h(
                      'div',
                      { className: 'it-row', key: review.name },
                      h('span', null, review.name),
                      h('span', { className: 'it-small' }, `${Math.round(review.size / 1024)} KB`),
                    ),
                  )
                : h('div', { className: 'it-note' }, '还没有复盘文件。'),
              h('div', { className: 'it-note' }, data ? data.paths.records : ''),
            ),
          ),
          toast !== '' ? h('div', { className: 'it-toast' }, toast) : null,
        ),
      );
    }

    const inject = ['slots', 'locale', 'layout'];

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return;
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-interview-teacher';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'interview-teacher: styles');

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 4,
            label: '面试老师',
          },
          InterviewTeacherIcon,
        ),
      );

      ctx.slots.inject('main', function* () {
        yield ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
          },
          InterviewTeacherPage,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
