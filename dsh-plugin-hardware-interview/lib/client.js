/**
 * dsh-hardware-interview-teacher — client half (browser).
 *
 * Bundle-plugin client format: `window.__ModuleLoader__.load({ id, factory })`.
 * The factory is CJS-style and may require only platform seed words
 * (`react`, `react/jsx-runtime`, primitives); everything else must be
 * self-contained.
 *
 * UI:
 *   - 左侧栏入口：`sidebar.panellist`（id `hardware-interview`，order 4）
 *   - 全局面板：`main` keyed slot（key = `hardware-interview`）
 *
 * 面板是「硬件面试台」：H01–H20 覆盖进度、当前题（来源/考核点/建议时间/
 * 计时/提示/参考答案）、逐题记录（通过/待加强/跳过）、工程硬件配置扫描、
 * 复盘生成与落盘、可复制的面试命令。
 *
 * Data comes from the host route POST /plugins/dsh-hardware-interview-teacher/rpc.
 */

window.__ModuleLoader__.load({
  id: 'dsh-hardware-interview-teacher',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const h = react.createElement;

    const PANEL_ID = 'hardware-interview';
    const RPC_PATH = '/plugins/dsh-hardware-interview-teacher/rpc';
    const REFRESH_MS = 12000;

    const VERDICT_LABEL = { passed: '通过', weak: '待加强', skipped: '跳过' };
    const VERDICT_COLOR = { passed: '#12a150', weak: '#e0a500', skipped: '#8a919c' };
    const GROUP_ORDER = ['power', 'interface', 'motor', 'sensor', 'debug', 'safety'];

    const CSS = [
      '.hiw-page{box-sizing:border-box;min-height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,0px) + 20px) 24px 48px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.hiw-inner{max-width:1180px;margin:0 auto}',
      '.hiw-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}',
      '.hiw-mark{width:38px;height:38px;flex:none;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#3d5afe,#7b5cff);box-shadow:0 6px 18px rgba(77,107,254,.28)}',
      '.hiw-title{font-size:20px;font-weight:660;margin:0;letter-spacing:.01em}',
      '.hiw-sub{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:3px}',
      '.hiw-chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;justify-content:flex-end;max-width:46%}',
      '.hiw-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-secondary,#5c6470);white-space:nowrap}',
      '.hiw-chip b{font-weight:620;color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.hiw-dot{width:7px;height:7px;border-radius:50%;background:#8a919c;display:inline-block}',
      '.hiw-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}',
      '.hiw-btn{font:inherit;font-size:12.5px;padding:6px 11px;border-radius:8px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#5c6470);cursor:pointer;white-space:nowrap;transition:border-color .12s ease,color .12s ease}',
      '.hiw-btn:hover{border-color:var(--dsw-alias-state-business-primary,#4d6bfe);color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.hiw-btn:disabled{opacity:.55;cursor:default}',
      '.hiw-btn.primary{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:transparent;color:#fff;font-weight:600}',
      '.hiw-btn.primary:hover{color:#fff;filter:brightness(1.05)}',
      '.hiw-btn.ghost{background:transparent}',
      '.hiw-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px;align-items:start}',
      '.hiw-col{display:flex;flex-direction:column;gap:12px;min-width:0}',
      '.hiw-card{border:1px solid var(--dsw-alias-line-normal,#e7e9ee);border-radius:13px;background:var(--dsw-alias-bg-elevated,#fafbfc);padding:14px 16px;min-width:0}',
      '.hiw-card h3{margin:0 0 10px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#5c6470);display:flex;align-items:center;gap:8px}',
      '.hiw-card h3 em{font-style:normal;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a919c);font-size:11.5px}',
      '.hiw-qhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}',
      '.hiw-qid{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:12px;font-weight:700;padding:2px 7px;border-radius:6px;background:rgba(77,107,254,.12);color:#4d6bfe}',
      '.hiw-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.hiw-qtext{font-size:15px;line-height:1.8;font-weight:560;margin:2px 0 10px;white-space:pre-wrap}',
      '.hiw-qsub{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.hiw-qsub ul{margin:4px 0 8px;padding-left:18px}',
      '.hiw-qsub li{margin:2px 0}',
      '.hiw-field{font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a919c);margin:10px 0 4px}',
      '.hiw-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}',
      '.hiw-timer{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:13px;font-weight:650;padding:4px 9px;border-radius:7px;background:var(--dsw-alias-bg-sunken,#eceef2);color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.hiw-timer.live{background:rgba(18,161,80,.12);color:#0f8a44}',
      '.hiw-metrics{display:flex;align-items:baseline;gap:8px}',
      '.hiw-big{font-size:30px;font-weight:700;line-height:1.05;letter-spacing:-.01em}',
      '.hiw-big span{font-size:14px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.hiw-small{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.hiw-bar{height:7px;border-radius:999px;background:var(--dsw-alias-bg-sunken,#eceef2);overflow:hidden;margin:10px 0 4px}',
      '.hiw-bar>i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#4d6bfe,#7b5cff);transition:width .3s ease}',
      '.hiw-grow{display:flex;flex-direction:column;gap:7px;margin-top:10px}',
      '.hiw-grow-row{display:grid;grid-template-columns:76px minmax(0,1fr) 52px;gap:8px;align-items:center;font-size:12px}',
      '.hiw-grow-row span:first-child{color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.hiw-grow-row span:last-child{text-align:right;color:var(--dsw-alias-label-tertiary,#8a919c);font-variant-numeric:tabular-nums}',
      '.hiw-mini{height:5px;border-radius:999px;background:var(--dsw-alias-bg-sunken,#eceef2);overflow:hidden}',
      '.hiw-mini>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.hiw-modes{display:flex;gap:6px;flex-wrap:wrap}',
      '.hiw-mode{font:inherit;font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:transparent;color:var(--dsw-alias-label-secondary,#5c6470);cursor:pointer}',
      '.hiw-mode.on{background:rgba(77,107,254,.12);border-color:transparent;color:#4d6bfe;font-weight:600}',
      '.hiw-table{width:100%;border-collapse:collapse;font-size:12.5px}',
      '.hiw-table th{position:sticky;top:0;background:var(--dsw-alias-bg-elevated,#fafbfc);text-align:left;font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a919c);padding:7px 8px;border-bottom:1px solid var(--dsw-alias-line-normal,#e7e9ee);z-index:1}',
      '.hiw-table td{padding:7px 8px;border-bottom:1px dashed var(--dsw-alias-line-normal,#eef0f4);vertical-align:top}',
      '.hiw-table tr{cursor:pointer}',
      '.hiw-table tbody tr:hover{background:rgba(77,107,254,.05)}',
      '.hiw-table tr.on{background:rgba(77,107,254,.09)}',
      '.hiw-table code{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11.5px;font-weight:700;color:#4d6bfe}',
      '.hiw-table .pt{color:var(--dsw-alias-label-secondary,#5c6470)}',
      '.hiw-scroll{max-height:360px;overflow:auto;border-radius:10px;margin:0 -4px}',
      '.hiw-status{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap}',
      '.hiw-tag{font-size:10.5px;padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-sunken,#eceef2);color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.hiw-tag.req{background:rgba(196,48,43,.1);color:#c4302b}',
      '.hiw-cmds{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:7px}',
      '.hiw-cmd{display:flex;flex-direction:column;gap:1px;padding:7px 9px;border-radius:8px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);background:var(--dsw-alias-bg-base,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.hiw-cmd:hover{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.hiw-cmd b{font-size:12.5px;font-weight:600}',
      '.hiw-cmd em{font-size:10.5px;font-style:normal;color:var(--dsw-alias-label-tertiary,#8a919c)}',
      '.hiw-scanmod{display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:240px;overflow:auto}',
      '.hiw-scanmod>div{border:1px solid var(--dsw-alias-line-normal,#eef0f4);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff)}',
      '.hiw-scanmod b{font-size:12px}',
      '.hiw-scanmod code{display:block;font-family:var(--dsw-font-family-mono,ui-monospace);font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:3px;white-space:pre-wrap;word-break:break-all}',
      '.hiw-pre{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto;margin:0;padding:12px;border-radius:10px;background:var(--dsw-alias-bg-sunken,#f2f4f7);color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.hiw-note{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#8a919c);margin-top:8px}',
      '.hiw-note code{font-family:var(--dsw-font-family-mono,ui-monospace);word-break:break-all}',
      '.hiw-empty{font-size:12.5px;color:var(--dsw-alias-label-tertiary,#8a919c);line-height:1.7}',
      '.hiw-err{font-size:12.5px;color:#c4302b;background:rgba(196,48,43,.07);border-radius:8px;padding:8px 10px;margin-bottom:10px;word-break:break-all}',
      '.hiw-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#1b1f27;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;z-index:80;opacity:.96;max-width:70vw;text-align:center}',
      '.hiw-kbd{font-family:var(--dsw-font-family-mono,ui-monospace);font-size:11px;padding:1px 5px;border-radius:4px;border:1px solid var(--dsw-alias-line-normal,#e7e9ee);color:var(--dsw-alias-label-secondary,#5c6470)}',
      '@media (max-width:980px){.hiw-grid{grid-template-columns:minmax(0,1fr)}.hiw-chips{max-width:100%}}',
    ].join('');

    /* -------------------------------------------------------------- */
    /* 基础设施                                                        */
    /* -------------------------------------------------------------- */

    function rpc(method, args) {
      return fetch(RPC_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ method, args: args ?? {} }),
      })
        .then((res) => res.json())
        .then((payload) => {
          if (!payload || payload.ok !== true) throw new Error((payload && payload.error) || 'RPC 失败');
          return payload.value;
        });
    }

    function copyText(text) {
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

    function fmtClock(totalSeconds) {
      const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    }

    function fmtTime(totalSeconds) {
      const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
      return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
    }

    function since(startedAt) {
      if (typeof startedAt !== 'string') return 0;
      const started = Date.parse(startedAt);
      if (!Number.isFinite(started)) return 0;
      return Math.max(0, Math.round((Date.now() - started) / 1000));
    }

    function HardwareIcon() {
      return h(
        'svg',
        { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 6.2, y: 6.2, width: 11.6, height: 11.6, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('rect', { x: 9.6, y: 9.6, width: 4.8, height: 4.8, rx: 1, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', {
          d: 'M9.4 3v3.2M14.6 3v3.2M9.4 17.8V21M14.6 17.8V21M3 9.4h3.2M3 14.6h3.2M17.8 9.4H21M17.8 14.6H21',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      );
    }

    function Card(props) {
      return h(
        'div',
        { className: 'hiw-card', style: props.style },
        h('h3', null, props.title, props.hint !== undefined ? h('em', null, props.hint) : null),
        props.children,
      );
    }

    /* -------------------------------------------------------------- */
    /* 面板                                                            */
    /* -------------------------------------------------------------- */

    function HardwareInterviewPage() {
      const [data, setData] = react.useState(null);
      const [question, setQuestion] = react.useState(null);
      const [scan, setScan] = react.useState(null);
      const [report, setReport] = react.useState(null);
      const [error, setError] = react.useState(null);
      const [toast, setToast] = react.useState('');
      const [busy, setBusy] = react.useState(false);
      const [showHint, setShowHint] = react.useState(false);
      const [showAnswer, setShowAnswer] = react.useState(false);
      const [, forceTick] = react.useState(0);
      const currentRef = react.useRef(null);

      const showToast = react.useCallback((text) => {
        setToast(text);
        setTimeout(() => setToast(''), 2200);
      }, []);

      const refresh = react.useCallback(
        (options) => {
          const silent = options && options.silent;
          if (!silent) setBusy(true);
          return rpc('state')
            .then((value) => {
              setData(value);
              setError(null);
              const current = value && value.state ? value.state.current : null;
              if (current !== currentRef.current) {
                currentRef.current = current;
                setShowHint(false);
                setShowAnswer(false);
                if (current === null) {
                  setQuestion(null);
                } else {
                  return rpc('question', { id: current }).then((entry) => setQuestion(entry));
                }
              }
              return undefined;
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => {
              if (!silent) setBusy(false);
            });
        },
        [],
      );

      react.useEffect(() => {
        refresh();
        const timer = setInterval(() => refresh({ silent: true }), REFRESH_MS);
        const tick = setInterval(() => forceTick((value) => value + 1), 1000);
        return () => {
          clearInterval(timer);
          clearInterval(tick);
        };
      }, [refresh]);

      const state = data && data.state ? data.state : null;
      const checklist = data && Array.isArray(data.checklist) ? data.checklist : [];
      const stats = data && data.stats ? data.stats : null;
      const modes = data && Array.isArray(data.modes) ? data.modes : [];
      const paths = data && data.paths ? data.paths : {};
      const currentId = state && state.current ? state.current : null;
      const currentItem = currentId === null ? null : checklist.find((item) => item.id === currentId) || null;
      const currentIndex = currentItem === null ? -1 : checklist.findIndex((item) => item.id === currentItem.id);
      const recordById = new Map();
      if (state && Array.isArray(state.records)) for (const record of state.records) recordById.set(record.id, record);
      const liveTimer = state && state.timer && state.timer.id ? since(state.timer.startedAt) : null;
      const elapsed = liveTimer === null ? 0 : liveTimer;

      const applyState = (value) => {
        if (value && value.state) {
          setData((previous) => {
            if (previous === null) return previous;
            return { ...previous, state: value.state, stats: value.stats ?? previous.stats };
          });
          const next = value.state.current ?? null;
          if (next !== currentRef.current) {
            currentRef.current = next;
            setShowHint(false);
            setShowAnswer(false);
            if (next === null) setQuestion(null);
            else rpc('question', { id: next }).then((entry) => setQuestion(entry)).catch(() => {});
          }
        }
      };

      const run = (method, args, label) => {
        setBusy(true);
        return rpc(method, args)
          .then((value) => {
            applyState(value);
            if (label) showToast(label);
            return value;
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            showToast(message);
            return undefined;
          })
          .finally(() => setBusy(false));
      };

      const startInterview = () => run('begin', { mode: state ? state.mode : 'all' }, currentId === null ? '开始面试' : '已切到下一题');
      const setMode = (mode) => run('setMode', { mode }, `模式：${(modes.find((item) => item.id === mode) || {}).label || mode}`);
      const recordVerdict = (verdict) => {
        if (currentId === null) return undefined;
        const seconds = elapsed;
        return run('record', { id: currentId, verdict, seconds }, `已记录 ${currentId}：${VERDICT_LABEL[verdict]}`).then(() => run('next', { after: currentId }, '下一题'));
      };
      const skipCurrent = () => {
        if (currentId === null) return undefined;
        return run('skip', { id: currentId, seconds: elapsed }, `已跳过 ${currentId}`).then(() => run('next', { after: currentId }, '下一题'));
      };
      const goPoint = (id) => run('begin', { id, mode: state ? state.mode : 'all' }, `切到 ${id}`);
      const finishInterview = () => {
        setBusy(true);
        return rpc('finish')
          .then((value) => {
            setReport(value);
            showToast(`复盘已落盘：${value.reportPath}`);
            return refresh({ silent: true });
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
            showToast('落盘失败，可先用「预览复盘」');
          })
          .finally(() => setBusy(false));
      };
      const previewReport = () => {
        setBusy(true);
        return rpc('report')
          .then((value) => {
            setReport(value);
            showToast('复盘已生成（未落盘）');
          })
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      };
      const scanWorkspace = () => {
        setBusy(true);
        return rpc('scan')
          .then((value) => {
            setScan(value);
            showToast(`扫描完成：${value.fileCount} 个源文件 / ${value.itemCount} 条硬件配置`);
          })
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      };
      const copyPrompt = () => {
        setBusy(true);
        return rpc('copyPrompt')
          .then((value) => copyText(value.prompt).then(() => showToast(`已复制面试老师提示词（${value.bytes} 字节），粘到新会话即可开工`)))
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => setBusy(false));
      };
      const changeWorkspace = () => {
        const next = typeof window.prompt === 'function' ? window.prompt('工程目录（题目 PDF + 代码）绝对路径：', paths.workspace || '') : null;
        if (next === null || next.trim().length === 0) return undefined;
        return run('setWorkspace', { workspace: next.trim() }, '工程目录已更新（本进程内有效）').then(() => refresh({ silent: true }));
      };
      const resetInterview = () => {
        if (typeof window.confirm === 'function' && !window.confirm('清空本次硬件面试的所有记录？')) return undefined;
        return run('reset', {}, '已清空面试记录').then(() => setReport(null));
      };
      const copyCommand = (text) => () => copyText(text).then(() => showToast(`已复制「${text}」`));

      const statusLabel = state === null ? '未开始' : state.status === 'running' ? '进行中' : state.status === 'finished' ? '已结束' : '未开始';
      const statusColor = state === null || state.status === 'idle' ? '#8a919c' : state.status === 'finished' ? '#12a150' : '#4d6bfe';
      const askedCount = stats === null ? 0 : stats.attempted;
      const totalCount = stats === null ? checklist.length : stats.total;

      const commands = [
        ['开始面试', '识别文件→拆点→出题'],
        ['继续面试', '从断点接续'],
        ['提示', '只给 1 条硬件思路'],
        ['参考答案', '回答框架'],
        ['跳过', '换题并记未覆盖'],
        ['只看供电', '电源/地/保护'],
        ['只看接口', '电平/上拉/线序'],
        ['只看电机', '电机/编码器/干扰'],
        ['重拆硬件点', '重新扫描硬件配置'],
        ['结束面试', '100 分制复盘'],
      ];

      return h(
        'div',
        { className: 'hiw-page' },
        h(
          'div',
          { className: 'hiw-inner' },
          h(
            'div',
            { className: 'hiw-head' },
            h('div', { className: 'hiw-mark' }, h(HardwareIcon)),
            h(
              'div',
              { style: { minWidth: 0 } },
              h('h1', { className: 'hiw-title' }, '电控硬件面试老师'),
              h(
                'div',
                { className: 'hiw-sub' },
                'RoboMaster 电控硬件评审 · 只考供电/地/电平/上拉/驱动/保护/抗干扰/调试测量 · 逐项覆盖 H01–H20',
              ),
            ),
            h(
              'div',
              { className: 'hiw-chips' },
              h('span', { className: 'hiw-chip' }, h('i', { className: 'hiw-dot', style: { background: statusColor } }), '状态 ', h('b', null, statusLabel)),
              h('span', { className: 'hiw-chip' }, '覆盖 ', h('b', null, `${askedCount}/${totalCount}`)),
              h('span', { className: 'hiw-chip' }, '当前 ', h('b', null, currentId ?? '—')),
              h('span', { className: 'hiw-chip' }, '计时 ', h('b', null, currentId === null ? '—' : fmtClock(elapsed))),
            ),
          ),
          h(
            'div',
            { className: 'hiw-toolbar' },
            h('button', { className: 'hiw-btn primary', disabled: busy, onClick: startInterview }, currentId === null ? '开始面试' : '下一题（开始计时）'),
            h('button', { className: 'hiw-btn', disabled: busy, onClick: previewReport }, '预览复盘'),
            h('button', { className: 'hiw-btn', disabled: busy, onClick: finishInterview }, '结束面试并落盘'),
            h('button', { className: 'hiw-btn', disabled: busy, onClick: scanWorkspace }, '扫描工程硬件配置'),
            h('button', { className: 'hiw-btn ghost', disabled: busy, onClick: copyPrompt }, '复制角色提示词'),
            h('button', { className: 'hiw-btn ghost', disabled: busy, onClick: changeWorkspace }, '切换工程目录'),
            h('button', { className: 'hiw-btn ghost', disabled: busy, onClick: () => refresh() }, busy ? '刷新中…' : '刷新状态'),
            h('button', { className: 'hiw-btn ghost', disabled: busy, onClick: resetInterview }, '清空'),
          ),
          error !== null ? h('div', { className: 'hiw-err' }, `读取失败：${error}`) : null,
          h(
            'div',
            { className: 'hiw-grid' },
            h(
              'div',
              { className: 'hiw-col' },
              h(
                Card,
                { title: '当前题', hint: currentItem === null ? '从右侧清单或「开始面试」选题' : `第 ${currentIndex + 1} / ${checklist.length} 题` },
                currentItem === null
                  ? h(
                      'div',
                      { className: 'hiw-empty' },
                      '还没有选题。点「开始面试」自动跳到第一个未考点，或在下方《硬件考核点清单》点一行直接开考。',
                      h('div', { className: 'hiw-note' }, '每题格式：来源 / 覆盖硬件考核点 / 建议熟练回答时间；时间到就记结果，面板会实时同步到左侧栏入口。'),
                    )
                  : h(
                      'div',
                      null,
                      h(
                        'div',
                        { className: 'hiw-qhead' },
                        h('span', { className: 'hiw-qid' }, currentItem.id),
                        h('span', { className: 'hiw-meta' }, `来源：${currentItem.source} - ${currentItem.module}`),
                        h('span', { className: 'hiw-tag req' }, currentItem.required),
                        h('span', { className: 'hiw-timer' + (state && state.timer ? ' live' : '') }, fmtClock(elapsed), ' / 建议 ', fmtClock(currentItem.seconds)),
                      ),
                      h('div', { className: 'hiw-field' }, '覆盖硬件考核点'),
                      h('div', { className: 'hiw-qsub' }, `${currentItem.id} ${currentItem.point}`),
                      currentItem.stage ? h('div', { className: 'hiw-note' }, `PDF 出处：${currentItem.stage}`) : null,
                      h('div', { className: 'hiw-field' }, '题目'),
                      h('div', { className: 'hiw-qtext' }, question ? question.question : '（题库加载中…）'),
                      showHint
                        ? h(
                            'div',
                            { className: 'hiw-qsub' },
                            h('div', { className: 'hiw-field' }, '提示（只给思路）'),
                            h('div', null, question && question.hint ? question.hint : '先讲供电与地，再讲电平与上拉，最后讲怎么测。'),
                          )
                        : null,
                      showAnswer
                        ? h(
                            'div',
                            { className: 'hiw-qsub' },
                            h('div', { className: 'hiw-field' }, '参考答案框架'),
                            h(
                              'ul',
                              null,
                              (question && Array.isArray(question.answer) && question.answer.length > 0 ? question.answer : ['供电从哪来/多大电流', '接口电平与上拉', '保护与抗干扰', '怎么测、测什么']).map((line, index) =>
                                h('li', { key: index }, line),
                              ),
                            ),
                            h('div', { className: 'hiw-field' }, '追问（最多 2 层）'),
                            h(
                              'ul',
                              null,
                              (question && question.followUps && question.followUps.length > 0
                                ? question.followUps
                                : ['第1层：具体接哪个引脚？上拉多大？电源从哪取？', '第2层：为什么这么选？出问题怎么定位？重来改哪里？']
                              ).map((line, index) => h('li', { key: index }, line)),
                            ),
                          )
                        : null,
                      h(
                        'div',
                        { className: 'hiw-actions' },
                        h('button', { className: 'hiw-btn', disabled: busy, onClick: () => setShowHint(!showHint) }, showHint ? '收起提示' : '提示'),
                        h('button', { className: 'hiw-btn', disabled: busy, onClick: () => setShowAnswer(!showAnswer) }, showAnswer ? '收起参考答案' : '参考答案'),
                        h('button', { className: 'hiw-btn primary', disabled: busy, onClick: () => recordVerdict('passed') }, '通过并下一题'),
                        h('button', { className: 'hiw-btn', disabled: busy, onClick: () => recordVerdict('weak') }, '待加强并下一题'),
                        h('button', { className: 'hiw-btn', disabled: busy, onClick: skipCurrent }, '跳过'),
                        h('button', { className: 'hiw-btn ghost', disabled: busy, onClick: () => run('begin', { id: currentId, mode: state ? state.mode : 'all' }, '计时已重置') }, '重置计时'),
                      ),
                      h(
                        'div',
                        { className: 'hiw-note' },
                        '点评与追问请在会话里进行；面板负责计时、选题与记录。记录结果会写进 ',
                        h('code', null, paths.state || '<DSH_HOME>/hardware-interview/state.json'),
                        '。',
                      ),
                    ),
              ),
              h(
                Card,
                { title: '硬件考核点清单', hint: `${checklist.length} 点 · 必考 ${checklist.filter((item) => item.required === '必考').length}` },
                h(
                  'div',
                  { className: 'hiw-scroll' },
                  h(
                    'table',
                    { className: 'hiw-table' },
                    h('thead', null, h('tr', null, h('th', { style: { width: 44 } }, '编号'), h('th', null, '具体项 / 考核点'), h('th', { style: { width: 74 } }, '状态'), h('th', { style: { width: 58 } }, '建议'))),
                    h(
                      'tbody',
                      null,
                      checklist.map((item) => {
                        const record = recordById.get(item.id);
                        const on = record !== undefined;
                        return h(
                          'tr',
                          { key: item.id, className: item.id === currentId ? 'on' : '', onClick: () => (busy ? undefined : goPoint(item.id)), title: item.point },
                          h('td', null, h('code', null, item.id)),
                          h(
                            'td',
                            null,
                            h('div', { style: { fontWeight: 550 } }, item.module),
                            h('div', { className: 'pt', style: { fontSize: 11.5, lineHeight: 1.55 } }, item.point),
                          ),
                          h(
                            'td',
                            null,
                            on
                              ? h(
                                  'span',
                                  { className: 'hiw-status', style: { color: VERDICT_COLOR[record.verdict] } },
                                  h('i', { className: 'hiw-dot', style: { background: VERDICT_COLOR[record.verdict] } }),
                                  VERDICT_LABEL[record.verdict],
                                )
                              : h('span', { className: 'hiw-status' }, h('i', { className: 'hiw-dot' }), item.required === '必考' ? '必考' : '选考'),
                          ),
                          h('td', { className: 'hiw-small' }, fmtClock(item.seconds)),
                        );
                      }),
                    ),
                  ),
                ),
                h('div', { className: 'hiw-note' }, '点任意一行 = 切到该题并重新计时。状态来自面板/工具记录，不自动判断对错。'),
              ),
            ),
            h(
              'div',
              { className: 'hiw-col' },
              h(
                Card,
                { title: '覆盖进度' },
                h(
                  'div',
                  { className: 'hiw-metrics' },
                  h('span', { className: 'hiw-big' }, askedCount, h('span', null, `/${totalCount}`)),
                  h('span', { className: 'hiw-small' }, `覆盖 ${pct(askedCount, totalCount)}% · 分项得分 ${stats === null ? 0 : stats.score}`),
                ),
                h('div', { className: 'hiw-bar' }, h('i', { style: { width: `${pct(askedCount, totalCount)}%` } })),
                h(
                  'div',
                  { className: 'hiw-grow' },
                  (stats && Array.isArray(stats.groups) ? stats.groups : []).map((group) =>
                    h(
                      'div',
                      { className: 'hiw-grow-row', key: group.group },
                      h('span', null, group.label),
                      h('div', { className: 'hiw-mini' }, h('i', { style: { width: `${pct(group.total - group.unattempted, group.total)}%` } })),
                      h('span', null, `${group.total - group.unattempted}/${group.total}`),
                    ),
                  ),
                ),
                h('div', { className: 'hiw-note' }, `已考用时 ${fmtTime(stats === null ? 0 : stats.totalSeconds)} · 通过 ${stats === null ? 0 : stats.passed} · 待加强 ${stats === null ? 0 : stats.weak} · 跳过 ${stats === null ? 0 : stats.skipped}`),
              ),
              h(
                Card,
                { title: '面试模式', hint: '决定「下一题」的范围' },
                h(
                  'div',
                  { className: 'hiw-modes' },
                  (modes.length > 0 ? modes : [{ id: 'all', label: '全部硬件点' }]).map((mode) =>
                    h('button', { key: mode.id, className: 'hiw-mode' + (state && state.mode === mode.id ? ' on' : ''), disabled: busy, onClick: () => setMode(mode.id) }, mode.label),
                  ),
                ),
                h('div', { className: 'hiw-note' }, '只看供电 / 只看接口 / 只看电机：与用户命令语义一致，只影响自动跳题范围。'),
              ),
              h(
                Card,
                { title: '面试命令', hint: '复制后发到会话' },
                h(
                  'div',
                  { className: 'hiw-cmds' },
                  commands.map(([command, note]) => h('button', { key: command, className: 'hiw-cmd', onClick: copyCommand(command) }, h('b', null, command), h('em', null, note))),
                ),
                h('div', { className: 'hiw-note' }, '命令在会话里由「硬件面试老师」skill 执行；面板只负责复制。'),
              ),
              h(
                Card,
                { title: '工程扫描', hint: scan === null ? '未扫描' : `${scan.itemCount} 条硬件配置` },
                scan === null
                  ? h('div', { className: 'hiw-empty' }, '点顶部「扫描工程硬件配置」，从 遥控/、FreeRTOS小车/ 提取引脚、外设、电平、PWM、编码器证据（只提硬件配置，不考软件逻辑）。')
                  : h(
                      'div',
                      null,
                      h(
                        'div',
                        { className: 'hiw-note', style: { marginTop: 0 } },
                        `工程：`,
                        h('code', null, scan.workspace),
                        ` · 源文件 ${scan.fileCount} · 证据 ${scan.itemCount}`,
                      ),
                      h(
                        'div',
                        { className: 'hiw-note' },
                        '材料：',
                        scan.materials.length === 0 ? '未识别' : scan.materials.map((material) => `${material.kind}「${material.name}」`).join(' · '),
                      ),
                      h(
                        'div',
                        { className: 'hiw-scanmod' },
                        scan.modules.slice(0, 14).map((module) =>
                          h(
                            'div',
                            { key: module.module },
                            h('b', null, `${module.point} ${module.module}`),
                            module.items.slice(0, 3).map((item, index) => h('code', { key: index }, `${item.file}:${item.line}  ${item.code}`)),
                          ),
                        ),
                      ),
                    ),
              ),
              h(
                Card,
                { title: '复盘', hint: report === null ? '未生成' : report.reportPath ? '已落盘' : '仅预览' },
                report === null
                  ? h('div', { className: 'hiw-empty' }, '点「预览复盘」看 100 分制评分、分项、覆盖矩阵与风险点；点「结束面试并落盘」写到 面试记录/硬件面试复盘-<时间>.md。')
                  : h(
                      'div',
                      null,
                      report.reportPath ? h('div', { className: 'hiw-note', style: { marginTop: 0 } }, '已保存：', h('code', null, report.reportPath)) : null,
                      h('pre', { className: 'hiw-pre' }, report.report),
                      h(
                        'div',
                        { className: 'hiw-actions' },
                        h('button', { className: 'hiw-btn', onClick: () => copyText(report.report).then(() => showToast('复盘已复制')) }, '复制复盘'),
                        h('button', { className: 'hiw-btn ghost', onClick: () => setReport(null) }, '收起'),
                      ),
                    ),
              ),
            ),
          ),
          h('div', { className: 'hiw-note', style: { marginTop: 14, textAlign: 'center' } }, '面板数据：', h('code', null, paths.state || '—'), ' · 题库与清单在插件 data/ 目录 · 面试对话在会话里进行'),
          toast !== '' ? h('div', { className: 'hiw-toast' }, toast) : null,
        ),
      );
    }

    /* -------------------------------------------------------------- */
    /* 注册                                                            */
    /* -------------------------------------------------------------- */

    const inject = ['slots'];

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return;
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-hardware-interview-teacher';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'hardware-interview: styles');

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 4,
            label: '硬件面试',
          },
          HardwareIcon,
        ),
      );

      ctx.slots.inject('main', function* () {
        yield ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
          },
          HardwareInterviewPage,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
