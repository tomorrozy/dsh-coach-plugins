/**
 * dsh-safety-cost-teacher — host half.
 *
 * 安全、可靠性与成本老师 · DSH 插件宿主半。
 *
 * 职责：
 *  1. JSON RPC（浏览器半的唯一数据通道）
 *     POST /plugins/dsh-safety-cost-teacher/rpc
 *     body: { method, args } → { ok: true, value } | { ok: false, error }
 *     methods: state / bank / begin / record / skip / next / setMode
 *              / setWorkspace / reset / finish / report / copyPrompt
 *  2. 注册模型可见的 skill：safety-cost-coach（老师人设 + 逐题点评流程）
 *  3. 注册 4 个同步工具 screview_state / screview_begin / screview_record
 *     / screview_report，让会话里的“老师”把逐题结果实时写进左侧栏面板
 *  4. 读取 data/question-bank.json（S01–S12 评审对象题库，含风险轴/验证判据/
 *     标准框架/常见坏回答）
 *  5. 状态落盘 <DSH_HOME>/safety-cost-coach/state.json（原子写），
 *     复盘落盘 <workspace>/面试记录/安全可靠复盘-<时间>.md
 *
 * 本插件只评审工程思路（风险 → 后果 → 保护 → 验证 → 成本 → 下一层防线），
 * 不写代码、不替用户设计、不给完整方案。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 跨平台：默认工作目录从用户主目录推导（可用 DSH_COACH_WORKSPACE 覆盖）
const USER_HOME = process.env.DSH_COACH_WORKSPACE || process.env.USERPROFILE || process.env.HOME || '';

export const name = 'dsh-safety-cost-teacher';

const PLUGIN_ID = 'dsh-safety-cost-teacher';
const RPC_PATH = `/plugins/${PLUGIN_ID}/rpc`;
const MAX_BODY_BYTES = 512 * 1024;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const DATA_DIR = path.join(PLUGIN_ROOT, 'data');
const BANK_PATH = path.join(DATA_DIR, 'question-bank.json');
const SKILL_PATH = path.join(PLUGIN_ROOT, 'skill', 'SKILL.md');

const DSH_HOME = (() => {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return path.resolve(fromEnv.trim());
  return path.join(os.homedir(), '.dsh');
})();
const STATE_DIR = path.join(DSH_HOME, 'safety-cost-coach');
const STATE_PATH = path.join(STATE_DIR, 'state.json');

/** 默认工程目录（复盘与记录落盘处）；可用 cordis.patch.yml 的 config.workspace 覆盖。 */
const DEFAULT_WORKSPACE = USER_HOME + '\\Desktop\\Taurus car';

const CATEGORIES = {
  power: '供电安全',
  motor: '电机与驱动',
  interface: '连接与布线',
  emc: '无线与EMC',
  cost: '成本与维护',
  system: '整机可靠性',
};

/** 训练模式：按用户命令只练某一组评审对象（与提示词里的分组一致）。 */
const MODES = {
  all: { label: '全部对象', ids: null },
  power: { label: '只练电源', ids: ['S01', 'S02', 'S04', 'S10'] },
  motor: { label: '只练电机', ids: ['S03', 'S04', 'S05', 'S09'] },
  connect: { label: '只练连接', ids: ['S07', 'S08', 'S12'] },
  emc: { label: '只练无线与EMC', ids: ['S06', 'S09'] },
  cost: { label: '只练成本', ids: ['S11', 'S12'] },
};

/** 八项点评维度（复盘分项用）。 */
const DIMENSIONS = [
  { key: 'risk', label: '风险识别', max: 100 },
  { key: 'consequence', label: '失效后果', max: 100 },
  { key: 'protect', label: '保护设计与依据', max: 100 },
  { key: 'verify', label: '验证判据', max: 100 },
  { key: 'wiring', label: '连接与布线', max: 100 },
  { key: 'emc', label: 'EMC意识', max: 100 },
  { key: 'cost', label: '成本与可维护性', max: 100 },
  { key: 'expression', label: '表达逻辑', max: 100 },
];

const AXES = [
  { key: 'electric', label: '电气' },
  { key: 'thermal', label: '热' },
  { key: 'mechanical', label: '机械' },
  { key: 'vibration', label: '振动' },
  { key: 'emc', label: 'EMC' },
  { key: 'human', label: '人为操作' },
];

const DEFAULT_ASKS = [
  '主要风险点有哪些？失效后果是什么（轻/重、是否涉及安全与比赛中断）？',
  '保护/缓解措施是什么？选型或动作阈值依据是什么？',
  '怎么验证这些措施真的起作用？判据是什么（可测、可量化、含异常注入）？',
  '成本、备件、可维护性怎么权衡？',
  '如果第一层保护失效，下一层防线是什么？',
];

const DEFAULT_FRAMEWORK = [
  '识别风险：电气（反接/短路/过流/过压/欠压）、热（堵转/散热/降额）、机械（振动/松脱/应力）、EMC（干扰源/敏感源）、人为（误操作/急停）。',
  '失效后果：安全、设备损坏、比赛中断、数据丢失、维护成本，分轻重两级说清。',
  '保护分层：选型余量 → 硬件保护（保险丝/限流/TVS/反接二极管/急停）→ 软件限幅/降级 → 操作规范。',
  '验证判据：动作阈值、响应时间、温升上限、压降范围、丢包率、振动测试、异常注入。',
  '连接与布线：接插件选型、锁扣、线径、应力释放、电源/信号分开、地回流、标签。',
  'EMC：分开供电、去耦电容、磁珠、双绞、缩短回路、屏蔽、天线净空、滤波。',
  '成本与维护：BOM、备件、可替代、快换、维修时间、文档与交接。',
];

/** 题库兜底（data/question-bank.json 缺失时仍能出题）。 */
const DEFAULT_BANK = [
  ['S01', 'power', '电池与供电安全', '12V 航模电池反接、短路、过放、过流、开关、保险丝、急停', '这套系统用 12V 航模电池经降压模块给 5V/3.3V，电机和逻辑共地，整机没有急停开关。'],
  ['S02', 'power', '降压模块可靠性', '12V→5V/3.3V 的电流余量、发热、纹波、跌落、双路供电与去耦', '12V 航模电池经一个降压模块同时供 5V 和 3.3V，电机与逻辑共用这路电源。'],
  ['S03', 'motor', '电机堵转与过流', '堵转电流、驱动板限流、发热、散热片、软件限幅、保险丝选型', '编码器电机由 TB6612 驱动，堵转时电流可达额定的 3–5 倍，驱动板只贴了小块散热片。'],
  ['S04', 'power', '电机启动与电源跌落', '启动电流、电池内阻、线径、压降、单片机复位、电容储能', '电机启动瞬间 5V 轨跌落，单片机偶尔复位，电池和电机共用一组端子。'],
  ['S05', 'motor', '驱动板散热与降额', 'TB6612/驱动 MOS 发热、PWM 频率、续流、散热面积、环境温度、降额曲线', 'TB6612 装在洞洞板上连续跑 10 分钟烫手，环境温度约 35℃，没有降额计算。'],
  ['S06', 'emc', '无线模块供电与天线', 'NRF24L01/HC-05 的 3.3V 供电、去耦电容、共地、天线净空、金属遮挡、供电噪声', 'NRF24L01 直接吃 3.3V，天线贴着电池和电机线，遥控距离只有几米。'],
  ['S07', 'interface', '接插件与振动可靠性', '杜邦线 vs 端子 vs 航插、锁扣、线径、应力释放、振动松脱、防反接', '整机用杜邦线连接，没有锁扣，电机线与电源线共用一排插针。'],
  ['S08', 'interface', '线束与布线', '电源线与信号线分开、双绞、地回流、长度、固定、标签、颜色规范', '电源线与 I2C/串口信号线扎在同一线束里，没有标签，地线只走一根细线。'],
  ['S09', 'emc', 'EMC 与干扰', '电机 PWM 干扰 I2C/UART/蓝牙，布线、磁珠/电容、分开供电、地平面、屏蔽、滤波', '电机 PWM 一开，MPU6050 的 I2C 就读失败，蓝牙也开始丢包。'],
  ['S10', 'power', '电池管理与保护', '过放保护、低压报警、备用电池、开关位置、急停可达性、充电安全', '12V 航模电池没有低压报警，主开关在车体内部，急停随手够不到。'],
  ['S11', 'cost', '成本与物料', 'BOM 成本、关键件备件、可替代型号、坏了快换、维修时间、采购周期', 'BOM 里关键件都是单件采购，没有备件，比赛现场坏了只能等快递。'],
  ['S12', 'system', '整机可靠性与维护', '连续运行温升、故障率、易损件、拆装顺序、交接文档、赛场快速修复', '整机连续跑 30 分钟后温升明显，拆装要拆整块板，没有交接文档。'],
].map(([id, category, title, focus, background]) => ({ id, category, title, focus, background }));

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function log(level, message) {
  const line = `[${PLUGIN_ID}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function readJson(file) {
  const text = readText(file);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    log('warn', `无法解析 ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    log('warn', `创建目录失败 ${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, file);
  } catch (error) {
    try {
      fs.writeFileSync(file, body, 'utf8');
      fs.rmSync(tmp, { force: true });
    } catch (inner) {
      log('error', `写状态失败 ${file}: ${inner instanceof Error ? inner.message : String(inner)}`);
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toSeconds(value) {
  return Number.isFinite(Number(value)) ? clamp(Math.round(Number(value)), 0, 7200) : 0;
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
}

/** 去掉 SKILL.md 开头的 YAML frontmatter：注册给模型的正文不应带元数据块。 */
function stripFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return text;
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match === null) return text;
  return text.slice(match[0].length).replace(/^\s+/, '');
}

/* ------------------------------------------------------------------ */
/* 题库装载                                                            */
/* ------------------------------------------------------------------ */

function normalizeAxis(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const points = arr(raw.points);
  if (points.length === 0) return undefined;
  const known = AXES.find((axis) => axis.key === raw.key);
  return {
    key: str(raw.key, known?.key ?? 'electric'),
    label: str(raw.label, known?.label ?? '其它'),
    points: points.slice(0, 6),
  };
}

function normalizeCheck(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const check = typeof raw.check === 'string' ? raw.check.trim() : '';
  if (check.length === 0) return undefined;
  return {
    step: str(raw.step),
    check,
    normal: str(raw.normal, '（未写正常判据）'),
    abnormal: str(raw.abnormal, '（未写异常判据）'),
  };
}

function normalizeReview(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const id = String(raw.id ?? '').trim().toUpperCase();
  if (!/^S\d{2}$/.test(id)) return undefined;
  const category = Object.hasOwn(CATEGORIES, raw.category) ? raw.category : 'system';
  const axes = (Array.isArray(raw.axes) ? raw.axes.map(normalizeAxis).filter((v) => v !== undefined) : []);
  const checks = (Array.isArray(raw.checks) ? raw.checks.map(normalizeCheck).filter((v) => v !== undefined) : []).slice(0, 8);
  return {
    id,
    category,
    categoryLabel: str(raw.categoryLabel, CATEGORIES[category]),
    title: str(raw.title, id),
    focus: str(raw.focus),
    background: str(raw.background),
    asks: arr(raw.asks).length > 0 ? arr(raw.asks) : DEFAULT_ASKS,
    axes: axes.length > 0 ? axes : AXES.map((axis) => ({ ...axis, points: [] })).filter((axis) => axis.points.length > 0),
    checks,
    framework: arr(raw.framework).length > 0 ? arr(raw.framework) : DEFAULT_FRAMEWORK,
    traps: arr(raw.traps),
    hint: str(raw.hint),
    reference: str(raw.reference),
  };
}

function normalizeBank(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const byId = new Map();
  for (const entry of source) {
    const review = normalizeReview(entry);
    if (review !== undefined && !byId.has(review.id)) byId.set(review.id, review);
  }
  for (const entry of DEFAULT_BANK) {
    if (!byId.has(entry.id)) {
      const review = normalizeReview(entry);
      if (review !== undefined) byId.set(review.id, review);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function loadBank() {
  const raw = readJson(BANK_PATH);
  const bank = normalizeBank(raw);
  if (!Array.isArray(raw) || raw.length === 0) log('warn', `题库缺失或为空，使用内置兜底：${BANK_PATH}`);
  return bank;
}

/* ------------------------------------------------------------------ */
/* 训练状态                                                            */
/* ------------------------------------------------------------------ */

const VERDICTS = ['passed', 'weak', 'skipped'];

function defaultState() {
  return {
    version: 1,
    status: 'idle',
    mode: 'all',
    current: null,
    startedAt: null,
    updatedAt: null,
    nextOrdinal: 1,
    records: [],
    log: [],
  };
}

function normalizeRecord(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const id = String(raw.id ?? '').trim().toUpperCase();
  if (!/^S\d{2}$/.test(id)) return undefined;
  const verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : 'weak';
  const scores = {};
  if (raw.scores !== null && typeof raw.scores === 'object') {
    for (const dimension of DIMENSIONS) {
      const value = Number(raw.scores[dimension.key]);
      if (Number.isFinite(value)) scores[dimension.key] = clamp(Math.round(value), 0, 100);
    }
  }
  const score = Number.isFinite(Number(raw.score)) ? clamp(Math.round(Number(raw.score)), 0, 100) : undefined;
  const ordinal = Number.isFinite(Number(raw.ordinal)) ? clamp(Math.round(Number(raw.ordinal)), 0, 999) : undefined;
  return {
    id,
    verdict,
    seconds: toSeconds(raw.seconds),
    note: str(raw.note).slice(0, 600),
    score,
    ordinal,
    scores: Object.keys(scores).length > 0 ? scores : undefined,
    at: typeof raw.at === 'string' ? raw.at : nowIso(),
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (raw === null || typeof raw !== 'object') return base;
  return {
    ...base,
    version: 1,
    status: raw.status === 'running' || raw.status === 'finished' ? raw.status : 'idle',
    mode: Object.hasOwn(MODES, raw.mode) ? raw.mode : 'all',
    current: /^S\d{2}$/.test(String(raw.current ?? '')) ? String(raw.current) : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    nextOrdinal: Number.isFinite(Number(raw.nextOrdinal)) ? Math.max(1, Math.round(Number(raw.nextOrdinal))) : 1,
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter((v) => v !== undefined) : [],
    log: Array.isArray(raw.log) ? raw.log.slice(-200) : [],
  };
}

function loadState() {
  return normalizeState(readJson(STATE_PATH));
}

function saveState(state) {
  const next = { ...state, updatedAt: nowIso() };
  writeJsonAtomic(STATE_PATH, next);
  return next;
}

/** 模式过滤：按 id 列表而不是 category，因为 S04/S09/S12 同时属于多个训练组。 */
function modeBank(bank, mode) {
  const config = MODES[mode] ?? MODES.all;
  if (config.ids === null) return bank;
  return bank.filter((review) => config.ids.includes(review.id));
}

function nextReviewId(state, bank, afterId) {
  const pool = modeBank(bank, state.mode);
  if (pool.length === 0) return undefined;
  const recorded = new Set(state.records.map((record) => record.id));
  const startIndex = afterId === undefined ? -1 : pool.findIndex((item) => item.id === afterId);
  for (let step = 1; step <= pool.length; step += 1) {
    const item = pool[(startIndex + step + pool.length) % pool.length];
    if (!recorded.has(item.id)) return item.id;
  }
  return pool[(startIndex + 2) % pool.length]?.id;
}

function applyRecord(state, record) {
  const previous = state.records.find((item) => item.id === record.id);
  const recordWithOrdinal = {
    ...record,
    ordinal: previous?.ordinal ?? record.ordinal ?? state.nextOrdinal,
  };
  const records = state.records.filter((item) => item.id !== record.id);
  records.push(recordWithOrdinal);
  records.sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0) || a.id.localeCompare(b.id));
  return {
    ...state,
    status: 'running',
    nextOrdinal: Math.max(state.nextOrdinal, (recordWithOrdinal.ordinal ?? 0) + 1),
    records,
    log: [...state.log, { at: record.at, kind: 'record', id: record.id, verdict: record.verdict }].slice(-200),
    current: state.current === record.id ? null : state.current,
  };
}

function averageScore(record) {
  if (record.score !== undefined) return record.score;
  if (record.scores !== undefined) {
    const values = Object.values(record.scores);
    if (values.length > 0) return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  return undefined;
}

function statsOf(state, bank) {
  const attempted = state.records.length;
  const passed = state.records.filter((record) => record.verdict === 'passed').length;
  const weak = state.records.filter((record) => record.verdict === 'weak').length;
  const skipped = state.records.filter((record) => record.verdict === 'skipped').length;
  const scored = state.records.map(averageScore).filter((value) => value !== undefined);
  const score = scored.length > 0 ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : 0;
  const total = bank.length;
  const coverage = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const totalSeconds = state.records.reduce((sum, record) => sum + record.seconds, 0);
  const byCategory = Object.entries(CATEGORIES).map(([key, label]) => {
    const pool = bank.filter((review) => review.category === key);
    const done = state.records.filter((record) => pool.some((review) => review.id === record.id)).length;
    return { key, label, total: pool.length, done };
  });
  const dimensions = DIMENSIONS.map((dimension) => {
    const values = state.records.map((record) => record.scores?.[dimension.key]).filter((value) => Number.isFinite(value));
    const value = values.length > 0 ? Math.round(values.reduce((sum, item) => sum + item, 0) / values.length) : 0;
    return { key: dimension.key, label: dimension.label, max: dimension.max, value, samples: values.length };
  });
  return {
    total,
    attempted,
    passed,
    weak,
    skipped,
    unattempted: Math.max(0, total - attempted),
    coverage,
    score,
    scored: scored.length,
    totalSeconds,
    byCategory,
    dimensions,
  };
}

/* ------------------------------------------------------------------ */
/* 复盘报告（确定性生成：只看记录与自评，不判断“答得好不好”）            */
/* ------------------------------------------------------------------ */

function pad(value) {
  return String(value).padStart(2, '0');
}

function stamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatSeconds(total) {
  const seconds = Math.max(0, Math.round(Number(total) || 0));
  return `${Math.floor(seconds / 60)}分${pad(seconds % 60)}秒`;
}

function gradeOf(score) {
  if (score >= 85) return '优秀（评审像流程：风险—保护—验证—成本闭环）';
  if (score >= 70) return '良好（能识别主要风险，判据与冗余还欠具体）';
  if (score >= 55) return '及格（保护措施有了，验证判据与成本权衡偏弱）';
  return '待加强（靠“应该没事”，缺量化与验证）';
}

const HABIT_LIBRARY = [
  {
    key: 'fuse-only',
    name: '只加保险丝不验证：把“加个保险丝”当成完整保护方案',
    detect: (text) => /加个保险丝|加保险丝|装个保险丝|保险丝就行|串个保险丝/.test(text),
    fix: '保险丝要说清三件事：额定电流（1.5–2× 持续工作电流）、熔断时间（短路 <10ms）、验证方法（短路注入看是否断开）。缺一条就是没设计。',
    framework: '「保险丝三件套」：额定值 → 熔断时间 → 短路注入验证；并说明它防不了什么（反接、过放仍要另做）。',
  },
  {
    key: 'should-be-fine',
    name: '“应该没事”：无量化、无阈值、无异常路径',
    detect: (text) => /应该没事|应该没问题|差不多就行|一般不会|大概率没事|不会那么巧/.test(text),
    fix: '把“应该没事”换成数字：多少电流、多少温度、多少毫秒、多少概率。说不出数字，说明还没算过。',
    framework: '「三问量化」：正常工况值多少？极端工况值多少？超过多少算失效？',
  },
  {
    key: 'swap-only',
    name: '“坏了就换”：没有成本/备件/维修时间权衡',
    detect: (text) => /坏了就换|坏了换|直接换|换一个就行|换新的/.test(text),
    fix: '换件要算三笔账：备件成本、现场更换时间（能不能 2 分钟换好）、换件是否会被振动再次松脱。',
    framework: '「备件三问」：坏的概率多高？备件多少钱？现场换要多久、要不要拆整块板？',
  },
  {
    key: 'dupont',
    name: '杜邦线无锁扣：振动环境里把可插拔当可靠连接',
    detect: (text) => /杜邦线/.test(text),
    fix: '振动环境优先航插/带锁扣端子；必须用杜邦线时做应力释放、点胶固定、双线并联关键电源，并写进赛前检查表。',
    framework: '「连接可靠性」：锁扣 → 应力释放 → 关键线双点固定 → 赛前插拔检查表。',
  },
  {
    key: 'same-trunk',
    name: '电机与信号同槽走线：把干扰源和敏感源绑在一起',
    detect: (text) => /同槽|一起走|走一起|同一线束|绑一起/.test(text),
    fix: '电源与信号分开走、交叉处垂直、电机线双绞、信号线加磁珠/滤波，天线净空至少 1cm 且远离电机线。',
    framework: '「干扰三件套」：分开走线 → 去耦/滤波 → 缩短回流路径并单点共地。',
  },
  {
    key: 'no-spare',
    name: '无备件无文档：默认“不会坏”，坏了只能停赛',
    detect: (text) => /没有备件|不准备备件|不用备件|没有备份|没备/.test(text),
    fix: '关键件至少 1 备：驱动板、降压模块、无线模块、电池；备件要能 2 分钟内换到位，接口做成防反接。',
    framework: '「备件清单」：易损件清单 → 备份数量 → 快换接口 → 交接文档（接线图/故障树）。',
  },
  {
    key: 'no-emergency',
    name: '急停不可达：只在软件里“限流”，没有物理断电手段',
    detect: (text) => /急停|断电|拔电池/.test(text),
    fix: '急停要物理、可达、一键断电机动力（不是只断单片机），位置在操作手 30cm 内，并做上电自检确认。',
    framework: '「急停三要素」：物理断开动力 → 操作手可达 → 断电后状态可复现（不炸管、不失控）。',
  },
];

function habitsOf(state) {
  const corpus = state.records.map((record) => record.note).join(' ');
  const hitKeys = new Set(HABIT_LIBRARY.filter((habit) => habit.detect(corpus)).map((habit) => habit.key));
  const hits = HABIT_LIBRARY.filter((habit) => hitKeys.has(habit.key));
  const fallback = HABIT_LIBRARY.filter((habit) => !hitKeys.has(habit.key));
  return [...hits, ...fallback].slice(0, 3);
}

function buildReport(context) {
  const { state, bank, stats, workspace } = context;
  const byId = new Map(bank.map((review) => [review.id, review]));
  const recordById = new Map(state.records.map((record) => [record.id, record]));
  const lines = [];
  const now = new Date();
  lines.push('# 安全、可靠性与成本 · 复盘报告');
  lines.push('');
  lines.push(`- 生成时间：${now.toISOString()}`);
  lines.push(`- 工程目录：\`${workspace}\``);
  lines.push(`- 状态文件：\`${STATE_PATH}\``);
  lines.push(`- 覆盖：${stats.attempted}/${stats.total} 个评审对象（${stats.coverage}%），练习用时 ${formatSeconds(stats.totalSeconds)}`);
  lines.push('');

  lines.push('## 1. 安全可靠性与成本意识总分（100 分制）');
  lines.push('');
  const lowCoverage = stats.coverage < 50;
  lines.push(
    lowCoverage
      ? `**${stats.score} / 100**（已记录自评分）— 覆盖不足（${stats.coverage}%），先跑完一轮再当结论。`
      : `**${stats.score} / 100** — ${gradeOf(stats.score)}`,
  );
  lines.push('');
  lines.push('> 说明：总分 = 已记录题目的平均分（每题按八维自评/教练评分取均值）；未考不扣分，覆盖率单独统计。');
  lines.push('');

  lines.push('## 2. 分项评分');
  lines.push('');
  lines.push('| 分项 | 得分 | 样本数 |');
  lines.push('| --- | --- | --- |');
  for (const dimension of stats.dimensions) {
    lines.push(`| ${dimension.label} | ${dimension.samples > 0 ? dimension.value : '—'} | ${dimension.samples} |`);
  }
  lines.push('');
  lines.push('| 评审对象类别 | 覆盖 | 通过 | 待加强 | 跳过 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const group of stats.byCategory) {
    const passed = state.records.filter((record) => record.verdict === 'passed' && byId.get(record.id)?.category === group.key).length;
    const weak = state.records.filter((record) => record.verdict === 'weak' && byId.get(record.id)?.category === group.key).length;
    const skipped = state.records.filter((record) => record.verdict === 'skipped' && byId.get(record.id)?.category === group.key).length;
    lines.push(`| ${group.label} | ${group.done}/${group.total} | ${passed} | ${weak} | ${skipped} |`);
  }
  lines.push('');

  lines.push('## 3. 表现最好的 3 点');
  lines.push('');
  const best = state.records
    .map((record) => ({ record, value: averageScore(record) ?? -1 }))
    .filter(({ value }) => value >= 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  if (best.length === 0) {
    lines.push('- 还没有带分数的记录；先把一题完整走完（风险/后果/保护/验证/成本/下一层防线），再谈亮点。');
  }
  for (const { record, value } of best) {
    const review = byId.get(record.id);
    const strengths = record.scores
      ? Object.entries(record.scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([key, score]) => `${DIMENSIONS.find((item) => item.key === key)?.label ?? key} ${score}`)
          .join('、')
      : '—';
    lines.push(`- **${record.id} ${review?.title ?? ''}**：${value} 分（强项：${strengths}）${record.note ? `；${record.note}` : ''}`);
  }
  lines.push('');

  lines.push('## 4. 最危险的 3 个工程坏习惯');
  lines.push('');
  const habits = habitsOf(state);
  habits.forEach((habit, index) => {
    lines.push(`${index + 1}. **${habit.name}**`);
  });
  lines.push('');

  lines.push('## 5. 每个坏习惯的纠正方法与标准评审框架');
  lines.push('');
  habits.forEach((habit, index) => {
    lines.push(`### 坏习惯 ${index + 1}：${habit.name}`);
    lines.push('');
    lines.push(`- **纠正方法**：${habit.fix}`);
    lines.push(`- **标准评审框架**：${habit.framework}`);
    lines.push('');
  });

  lines.push('## 6. 评审对象覆盖矩阵');
  lines.push('');
  lines.push('| 对象 | 类别 | 是否练到 | 题号 | 结果 | 得分 | 用时 | 薄弱点 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const review of bank) {
    const record = recordById.get(review.id);
    const wall = record?.scores
      ? Object.entries(record.scores)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 1)
          .map(([key, score]) => `${DIMENSIONS.find((item) => item.key === key)?.label ?? key} ${score}`)
          .join('')
      : record?.note
        ? record.note.slice(0, 40)
        : '—';
    lines.push(
      `| ${review.id} ${review.title} | ${review.categoryLabel} | ${record === undefined ? '否' : '是'} | ${
        record?.ordinal === undefined ? '—' : `第${record.ordinal}题`
      } | ${record === undefined ? '—' : record.verdict} | ${record === undefined ? '—' : averageScore(record) ?? '—'} | ${
        record === undefined ? '—' : formatSeconds(record.seconds)
      } | ${wall} |`,
    );
  }
  lines.push('');

  lines.push('## 7. 下一轮建议练的 3 个评审对象');
  lines.push('');
  const practice = bank
    .map((review) => ({ review, record: recordById.get(review.id) }))
    .filter(({ record }) => record === undefined || record.verdict !== 'passed' || (averageScore(record) ?? 100) < 75)
    .sort((a, b) => {
      const rank = (record) => (record === undefined ? 0 : record.verdict === 'skipped' ? 1 : 2);
      return rank(a.record) - rank(b.record) || a.review.id.localeCompare(b.review.id);
    })
    .slice(0, 3);
  if (practice.length === 0) {
    lines.push('1. 覆盖完成，建议加练「只练成本 + 只练连接」组合，把备件、快换与振动可靠性写进同一份方案。');
  }
  practice.forEach(({ review }, index) => {
    lines.push(`${index + 1}. **${review.id} ${review.title}**：${review.focus}`);
  });
  lines.push('');

  lines.push('## 8. 一句话总结');
  lines.push('');
  const summary = lowCoverage
    ? `目前只练到 ${stats.coverage}%，还看不出评审思路成型；先把电源、电机、连接各练 2 题，再回头看这张表。`
    : stats.score >= 85
      ? '你的评审已经形成“风险—保护—验证—成本”闭环，下一步是把每条保护都写成可测阈值，让别人照你的记录能复现失效。'
      : stats.score >= 70
        ? '风险识别和后果判断基本到位，但验证判据还常停在“测一下”，下一轮每题强制写“阈值 + 响应时间 + 异常注入”三项。'
        : '先戒掉“加个保险丝/应该没事/坏了就换”三个习惯，每题都问：这句话有数字吗？没有数字就是没设计。';
  lines.push(summary);
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* RPC 方法                                                            */
/* ------------------------------------------------------------------ */

const RPC_METHOD_NAMES = ['state', 'bank', 'begin', 'record', 'skip', 'next', 'setMode', 'setWorkspace', 'reset', 'finish', 'report', 'copyPrompt'];

/** 面板/浏览器不需要标准答案与坏回答清单（那是老师追问用的）。 */
function stripReviewAnswer(review) {
  return {
    id: review.id,
    category: review.category,
    categoryLabel: review.categoryLabel,
    title: review.title,
    focus: review.focus,
    background: review.background,
    asks: review.asks,
    axes: review.axes,
    checks: review.checks,
    framework: review.framework,
  };
}

function buildSubjects(configWorkspace) {
  const session = { workspace: configWorkspace ?? DEFAULT_WORKSPACE, config: {} };

  const methods = {
    async state() {
      const bank = loadBank();
      const state = loadState();
      const byId = new Map(bank.map((review) => [review.id, review]));
      const current = state.current === null ? undefined : byId.get(state.current);
      return {
        state: { ...state, records: state.records.map((record) => ({ ...record, title: byId.get(record.id)?.title ?? '' })) },
        stats: statsOf(state, bank),
        current: current === undefined ? null : stripReviewAnswer(current),
        bankSummary: bank.map((review) => ({
          id: review.id,
          category: review.category,
          categoryLabel: review.categoryLabel,
          title: review.title,
          focus: review.focus,
        })),
        modes: Object.entries(MODES).map(([id, value]) => ({ id, label: value.label })),
        dimensions: DIMENSIONS,
        paths: { state: STATE_PATH, bank: BANK_PATH, skill: SKILL_PATH, workspace: session.workspace },
        now: nowIso(),
      };
    },
    async bank() {
      return { bank: loadBank(), categories: CATEGORIES, modes: MODES, axes: AXES, dimensions: DIMENSIONS };
    },
    async begin(args) {
      const bank = loadBank();
      let state = loadState();
      const mode = args?.mode ?? state.mode;
      if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}`);
      const requested = typeof args?.id === 'string' ? args.id.trim().toUpperCase() : undefined;
      const pool = modeBank(bank, mode);
      const id =
        requested !== undefined && pool.some((review) => review.id === requested)
          ? requested
          : nextReviewId({ ...state, mode }, bank, state.current ?? undefined);
      if (id === undefined) throw new Error('no review object available');
      state = {
        ...state,
        status: 'running',
        mode,
        current: id,
        startedAt: state.startedAt ?? nowIso(),
        log: [...state.log, { at: nowIso(), kind: 'begin', id, mode }].slice(-200),
      };
      const review = bank.find((item) => item.id === id);
      if (review === undefined) throw new Error(`unknown review object ${JSON.stringify(id)}`);
      return { state: saveState(state), stats: statsOf(state, bank), review, phenomenon: review };
    },
    async record(args) {
      const bank = loadBank();
      const record = normalizeRecord(args);
      if (record === undefined) throw new Error('record requires { id: Sxx, verdict: passed|weak|skipped }');
      const state = applyRecord(loadState(), record);
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async skip(args) {
      const bank = loadBank();
      const state0 = loadState();
      const id = String(args?.id ?? state0.current ?? '').trim().toUpperCase();
      const record = normalizeRecord({ id, verdict: 'skipped', seconds: args?.seconds ?? 0, note: args?.note ?? '跳过' });
      if (record === undefined) throw new Error('skip requires a valid review object id');
      const state = applyRecord(state0, record);
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async next(args) {
      const bank = loadBank();
      let state = loadState();
      const after = typeof args?.after === 'string' ? args.after.trim().toUpperCase() : state.current ?? undefined;
      const id = nextReviewId(state, bank, after);
      if (id === undefined) throw new Error('no next review object');
      state = { ...state, status: state.status === 'idle' ? 'running' : state.status, current: id };
      const review = bank.find((item) => item.id === id);
      if (review === undefined) throw new Error(`unknown review object ${JSON.stringify(id)}`);
      return { state: saveState(state), stats: statsOf(state, bank), review, phenomenon: review };
    },
    async setMode(args) {
      const bank = loadBank();
      const mode = String(args?.mode ?? '');
      if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown mode ${JSON.stringify(args?.mode)}`);
      const state = { ...loadState(), mode };
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async setWorkspace(args) {
      const next = String(args?.workspace ?? '').trim();
      if (next.length === 0) throw new Error('workspace path is empty');
      if (!fs.existsSync(next)) throw new Error(`workspace does not exist: ${next}`);
      session.workspace = path.resolve(next);
      return { workspace: session.workspace };
    },
    async reset() {
      const bank = loadBank();
      const state = saveState(defaultState());
      return { state, stats: statsOf(state, bank) };
    },
    async report() {
      const bank = loadBank();
      const state = loadState();
      const stats = statsOf(state, bank);
      return { report: buildReport({ state, bank, stats, workspace: session.workspace }), stats, state };
    },
    async finish() {
      const bank = loadBank();
      const state0 = loadState();
      const stats = statsOf(state0, bank);
      const report = buildReport({ state: state0, bank, stats, workspace: session.workspace });
      const dir = path.join(session.workspace, '面试记录');
      ensureDir(dir);
      const file = path.join(dir, `安全可靠复盘-${stamp(new Date())}.md`);
      try {
        fs.writeFileSync(file, report, 'utf8');
      } catch (error) {
        throw new Error(`复盘写入失败：${error instanceof Error ? error.message : String(error)}`);
      }
      const state = saveState({ ...state0, status: 'finished' });
      return { report, reportPath: file, stats, state };
    },
    async copyPrompt() {
      const skill = readText(SKILL_PATH);
      if (skill === undefined) throw new Error('skill/SKILL.md 不存在');
      const prompt = stripFrontmatter(skill);
      return { prompt, bytes: Buffer.byteLength(prompt, 'utf8') };
    },
  };

  return { methods, session };
}

/* ------------------------------------------------------------------ */
/* HTTP 通道                                                           */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/* 模型可见：skill + tools                                             */
/* ------------------------------------------------------------------ */

const TOOL_OUTPUT = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
  render: (_args, value) => [{ type: 'text', text: String(value.text) }],
};

const RECORD_SCORE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.key, { type: 'integer', minimum: 0, maximum: 100, description: `${dimension.label} 教练评分` }])),
  additionalProperties: false,
};

function formatReview(review) {
  const lines = [];
  lines.push(`【评审对象：${review.id} · ${review.categoryLabel} · ${review.title}】`);
  if (review.focus) lines.push(`覆盖内容：${review.focus}`);
  if (review.background) lines.push(`背景：${review.background}`);
  lines.push('');
  lines.push('请学员按下面 5 条作答（缺失效后果或缺验证判据必须打断追问）：');
  review.asks.forEach((question, index) => lines.push(`${index + 1}）${question}`));
  if (review.axes.length > 0) {
    lines.push('');
    lines.push('六轴自查（学员至少要覆盖其中 3 轴）：');
    for (const axis of review.axes) lines.push(`- ${axis.label}：${axis.points.join('、')}`);
  }
  lines.push('');
  lines.push('【建议熟练回答时间：2-3 分钟】追问 30 秒-1 分钟。');
  return lines.join('\n');
}

function buildToolDefinitions(api) {
  return [
    {
      name: 'screview_state',
      description:
        '读取“安全、可靠性与成本老师”训练当前状态：模式、当前评审对象、已练/未练对象、八维分项得分与题库一览。开始或继续评审训练前先调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: TOOL_OUTPUT,
      async execute() {
        const value = await api.methods.state();
        const { state, stats, current } = value;
        const lines = [];
        lines.push(`状态：${state.status}｜模式：${state.mode}（${MODES[state.mode]?.label ?? state.mode}）｜当前对象：${state.current ?? '无'}`);
        lines.push(`覆盖：${stats.attempted}/${stats.total}（${stats.coverage}%）｜总分：${stats.score}｜用时：${formatSeconds(stats.totalSeconds)}`);
        lines.push(
          `已练：${
            state.records.map((record) => `${record.ordinal === undefined ? '' : `第${record.ordinal}题 `}${record.id}:${record.verdict}${averageScore(record) === undefined ? '' : `(${averageScore(record)})`}`).join('，') || '无'
          }`,
        );
        const recorded = new Set(state.records.map((record) => record.id));
        lines.push(`未练：${value.bankSummary.filter((item) => !recorded.has(item.id)).map((item) => item.id).join(', ') || '无'}`);
        lines.push(`八维均分：${stats.dimensions.map((dimension) => `${dimension.label}${dimension.samples > 0 ? ` ${dimension.value}` : ' —'}`).join('｜')}`);
        if (current !== null && current !== undefined) lines.push(`当前题干：${current.id} ${current.title}——${current.background || current.focus}`);
        lines.push(`题库来源：data/question-bank.json（${stats.total} 条）；面板状态文件：${value.paths.state}`);
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'screview_begin',
      description:
        '开始/继续“安全、可靠性与成本”评审训练：设定模式（all/power/motor/connect/emc/cost）并选中当前评审对象（不给 id 时自动跳到下一个未练对象）。左侧栏「安全可靠评审」面板会同步显示风险轴、验证判据与标准框架。',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['all', 'power', 'motor', 'connect', 'emc', 'cost'],
            description: '训练模式：only电源=power（S01/S02/S04/S10），only电机=motor（S03/S04/S05/S09），only连接=connect（S07/S08/S12），only无线与EMC=emc（S06/S09），only成本=cost（S11/S12）。',
          },
          id: { type: 'string', description: '指定从哪个对象开始，如 S01。' },
        },
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const value = await api.methods.begin(args ?? {});
        const review = value.review;
        const lines = [`已选中：${review.id}（模式 ${value.state.mode}）；覆盖 ${value.stats.attempted}/${value.stats.total}。`];
        lines.push('');
        lines.push(formatReview(review));
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'screview_record',
      description:
        '把一道评审题的结论写进训练状态（左侧栏实时同步）：通过 passed / 待加强 weak / 跳过 skipped；可带实际用时秒数、一句点评 note，以及八维评分 scores（risk 风险识别 / consequence 失效后果 / protect 保护设计 / verify 验证判据 / wiring 连接布线 / emc EMC / cost 成本维护 / expression 表达，各 0-100）。复盘总分来自这些评分。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '评审对象编号，如 S01。' },
          verdict: { type: 'string', enum: VERDICTS, description: '本题结论。' },
          seconds: { type: 'integer', description: '实际用时（秒）。' },
          note: { type: 'string', description: '一句点评：缺哪条判据、跳了哪层保护、违反哪条原则。' },
          scores: RECORD_SCORE_SCHEMA,
        },
        required: ['id', 'verdict'],
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { state, stats } = await api.methods.record(args ?? {});
        return {
          text: `已记录 ${String(args?.id ?? '').toUpperCase()}：${args?.verdict}；覆盖 ${stats.attempted}/${stats.total}，总分 ${stats.score}，当前对象 ${state.current ?? '无'}。`,
        };
      },
    },
    {
      name: 'screview_report',
      description:
        '生成“安全、可靠性与成本”复盘（100 分制 + 八维分项 + 最优 3 点 + 最危险 3 个坏习惯 + 每个坏习惯的纠正方法与标准评审框架 + S01–S12 覆盖矩阵 + 下一轮 3 个对象 + 一句话总结）。用户说“结束评审”时调用；不自动写文件，落盘用面板「结束并落盘复盘」。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: TOOL_OUTPUT,
      async execute() {
        const { report, stats } = await api.methods.report();
        return { text: `覆盖 ${stats.attempted}/${stats.total}，总分 ${stats.score}（已记录 ${stats.scored} 题）\n\n${report}` };
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

export function apply(ctx, config = {}) {
  const api = buildSubjects(typeof config?.workspace === 'string' && config.workspace.trim().length > 0 ? path.resolve(config.workspace.trim()) : DEFAULT_WORKSPACE);
  api.session.config = config ?? {};

  let webRegistered = false;
  let skillsRegistered = false;
  let toolsRegistered = false;
  const disposers = [];

  const registerWeb = () => {
    if (webRegistered) return;
    const webServer = ctx.get('webServer') ?? ctx.get('httpServer');
    if (webServer === undefined || typeof webServer.register !== 'function') return;
    webRegistered = true;
    disposers.push(
      ctx.effect(
        () =>
          webServer.register({
            kind: 'exact',
            path: RPC_PATH,
            handler: async (req, res) => {
              if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'method not allowed' });
                return;
              }
              let body;
              try {
                body = JSON.parse(await readBody(req));
              } catch (error) {
                sendJson(res, 400, { ok: false, error: `invalid json: ${error instanceof Error ? error.message : String(error)}` });
                return;
              }
              const method = typeof body?.method === 'string' ? body.method : '';
              const handler = Object.hasOwn(api.methods, method) ? api.methods[method] : undefined;
              if (handler === undefined) {
                sendJson(res, 400, { ok: false, error: `unknown method ${JSON.stringify(method)}` });
                return;
              }
              try {
                const value = await handler(body?.args ?? {});
                sendJson(res, 200, { ok: true, value });
              } catch (error) {
                sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
              }
            },
          }),
        'safety-cost-teacher: rpc route',
      ),
    );
    log('info', `RPC 已挂载 ${RPC_PATH}`);
  };

  const registerSkill = () => {
    if (skillsRegistered) return;
    const skills = ctx.get('skills');
    if (skills === undefined || typeof skills.register !== 'function') return;
    const content = readText(SKILL_PATH);
    if (content === undefined) {
      log('warn', `skill 文件缺失：${SKILL_PATH}`);
      return;
    }
    skillsRegistered = true;
    try {
      disposers.push(
        skills.register({
          name: 'safety-cost-coach',
          description:
            '安全、可靠性与成本老师：一次给一个评审对象（S01–S12：电池供电、降压模块、电机堵转、电源跌落、驱动散热、无线与天线、接插件、线束、EMC、电池管理、成本备件、整机维护），按“风险点+失效后果+保护依据+验证判据+成本备件+下一层防线”评审，逐层追问并生成 100 分制复盘。',
          whenToUse:
            '用户要求练硬件安全/可靠性/成本评审、做电控方案风险评审、“给我一套系统我找风险点”、面试前练工程判断，或说“开始评审/只练电源/只练电机/只练连接/只练无线与EMC/只练成本/换项目/结束评审”时使用。',
          content: stripFrontmatter(content),
          invocation: { modelInvocable: true, userInvocable: true },
        }),
      );
      log('info', '已注册 skill：safety-cost-coach');
    } catch (error) {
      skillsRegistered = false;
      log('warn', `注册 skill 失败（不影响面板）：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const registerTools = () => {
    if (toolsRegistered) return;
    const tools = ctx.get('tools');
    if (tools === undefined || typeof tools.register !== 'function') return;
    try {
      for (const definition of buildToolDefinitions(api)) {
        disposers.push(tools.register(definition));
      }
      toolsRegistered = true;
      log('info', '已注册工具：screview_state / screview_begin / screview_record / screview_report');
    } catch (error) {
      toolsRegistered = false;
      log('warn', `注册工具失败（不影响面板）：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const installAll = () => {
    registerWeb();
    registerSkill();
    registerTools();
  };

  installAll();
  if (typeof ctx.on === 'function') {
    ctx.on('internal/service', () => installAll());
  }
  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => () => {
        for (const dispose of disposers.splice(0)) {
          try {
            dispose();
          } catch {
            /* teardown best effort */
          }
        }
      },
      'safety-cost-teacher: dispose',
    );
  }

  return {
    name,
    rpcPath: RPC_PATH,
    methods: RPC_METHOD_NAMES,
    statePath: STATE_PATH,
  };
}

/** 纯函数导出，供离线测试使用（不属于插件 API）。 */
export const __test = {
  CATEGORIES,
  MODES,
  DIMENSIONS,
  AXES,
  DEFAULT_BANK,
  normalizeBank,
  normalizeReview,
  normalizeState,
  normalizeRecord,
  statsOf,
  nextReviewId,
  buildReport,
  habitsOf,
  averageScore,
  stripFrontmatter,
  formatReview,
};
