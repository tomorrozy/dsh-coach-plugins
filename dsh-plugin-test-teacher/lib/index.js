/**
 * dsh-test-teacher — host half.
 *
 * 测试与验证老师 · DSH 插件宿主半。
 *
 * 职责：
 *  1. JSON RPC（浏览器半的唯一数据通道）
 *     POST /plugins/dsh-test-teacher/rpc
 *     body: { method, args } → { ok: true, value } | { ok: false, error }
 *     methods: state / bank / object / begin / record / skip / next / setMode /
 *              setWorkspace / reset / finish / report / copyPrompt / reference
 *  2. 注册模型可见的 skill：test-verify-coach（测试与验证老师人设 + 流程）
 *  3. 注册 5 个同步工具 testcoach_state / testcoach_begin / testcoach_record /
 *     testcoach_reference / testcoach_report，让会话里的“老师”把逐题结果实时
 *     写进左侧栏面板，并在用户说“参考答案”时取教练底稿
 *  4. 读取 data/test-objects.json（T01–T12 测试对象：指标/条件/判据/工具/记录/回归）
 *  5. 状态落盘 <DSH_HOME>/test-teacher/state.json（原子写），
 *     复盘落盘 <workspace>/面试记录/测试验证复盘-<时间>.md
 *
 * 本插件只教“怎么验证”（指标、条件、判据、工具、记录、回归），不写代码、
 * 不选元件、不替用户设计测试方案。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 跨平台：默认工作目录从用户主目录推导（可用 DSH_COACH_WORKSPACE 覆盖）
const USER_HOME = process.env.DSH_COACH_WORKSPACE || process.env.USERPROFILE || process.env.HOME || '';

export const name = 'dsh-test-teacher';

const PLUGIN_ID = 'dsh-test-teacher';
const RPC_PATH = `/plugins/${PLUGIN_ID}/rpc`;
const MAX_BODY_BYTES = 256 * 1024;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const DATA_DIR = path.join(PLUGIN_ROOT, 'data');
const SKILL_PATH = path.join(PLUGIN_ROOT, 'skill', 'SKILL.md');

const DSH_HOME = (() => {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return path.resolve(fromEnv.trim());
  return path.join(os.homedir(), '.dsh');
})();
const STATE_DIR = path.join(DSH_HOME, 'test-teacher');
const STATE_PATH = path.join(STATE_DIR, 'state.json');

/** 默认工程目录（复盘与记录落盘处）；可用 cordis.patch.yml 的 config.workspace 覆盖。 */
const DEFAULT_WORKSPACE = USER_HOME + '\\Desktop\\Taurus car';

/** 题库分组。题库里 T01/T04/T06/T07 归通信，T02/T03/T05/T09 归控制，
 *  T10/T11/T12 归记录与回归，T08 单独归显示（面板扩展）。 */
const CATEGORIES = {
  comms: '通信',
  control: '控制',
  record: '记录与回归',
  display: '显示',
};

const MODES = {
  all: { label: '全部对象', categories: null },
  comms: { label: '只练通信', categories: ['comms'] },
  control: { label: '只练控制', categories: ['control'] },
  record: { label: '只练记录', categories: ['record'] },
  display: { label: '只练显示', categories: ['display'] },
};

/** 七项点评 / 复盘分项（与 skill 的评分维度一一对应）。 */
const DIMENSIONS = [
  { key: 'quant', label: '指标可量化', max: 100 },
  { key: 'repro', label: '条件可复现', max: 100 },
  { key: 'boundary', label: '边界与异常覆盖', max: 100 },
  { key: 'criteria', label: '判据明确性', max: 100 },
  { key: 'tools', label: '工具匹配度', max: 100 },
  { key: 'regression', label: '记录与回归意识', max: 100 },
  { key: 'expression', label: '表达逻辑', max: 100 },
];

const QUESTIONS = [
  '1）你要测哪些指标？每个指标怎么量化？',
  '2）怎么构造测试条件（输入、环境、负载、边界）？',
  '3）正常/异常判据分别是什么？',
  '4）用什么工具/手段采集？',
  '5）怎么记录？怎么回归？回归看哪几个数？',
];

/** 题库兜底（data/test-objects.json 缺失时仍能出题）。 */
const DEFAULT_BANK = [
  { id: 'T01', category: 'comms', title: '通信协议边界测试', target: '自定义帧协议：帧头 0xA5、长度、校验、帧尾 0x0D' },
  { id: 'T02', category: 'control', title: 'PID 调好证明', target: '速度闭环 PID：阶跃、超调、稳态误差、抗扰' },
  { id: 'T03', category: 'control', title: '姿态解算验证', target: 'MPU6050 姿态解算：零偏、跟随、yaw 零飘、温漂' },
  { id: 'T04', category: 'comms', title: '蓝牙通信稳定性', target: 'HC-05 / NRF24L01 链路：距离、遮挡、丢包率、延迟' },
  { id: 'T05', category: 'control', title: '电机闭环测试', target: '直流编码器电机 + TB6612：空载/负载、堵转、温升' },
  { id: 'T06', category: 'comms', title: '双机通信可靠性', target: '双 STM32 长跑、断电重连、错误帧注入' },
  { id: 'T07', category: 'comms', title: '编码器测速准确性', target: '编码器测速：低速/高速、正反转、丢脉冲、抖动' },
  { id: 'T08', category: 'display', title: 'OLED 显示验证', target: 'SSD1306 显示：刷新率、一致性、异常值、掉电恢复' },
  { id: 'T09', category: 'control', title: '供电与复位测试', target: '供电与复位：压降、复位次数、掉电重启' },
  { id: 'T10', category: 'record', title: '整机连续运行测试', target: '整机长跑：故障率、温升、栈/堆余量、日志' },
  { id: 'T11', category: 'record', title: '测试用例与记录表', target: '用例结构、记录表、回归清单、通过判定' },
  { id: 'T12', category: 'record', title: '异常注入测试', target: '拔线、反接、短路、错误指令、超范围数据' },
];

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

/** 去掉 SKILL.md 开头的 YAML frontmatter：注册给模型的正文不应带元数据块。 */
function stripFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return text;
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match === null) return text;
  return text.slice(match[0].length).replace(/^\s+/, '');
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
}

/* ------------------------------------------------------------------ */
/* 题库装载                                                            */
/* ------------------------------------------------------------------ */

function normalizeMetric(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const nameText = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (nameText.length === 0) return undefined;
  return {
    name: nameText,
    unit: typeof raw.unit === 'string' ? raw.unit.trim() : '',
    normal: typeof raw.normal === 'string' ? raw.normal : '',
    abnormal: typeof raw.abnormal === 'string' ? raw.abnormal : '',
  };
}

function normalizeCriterion(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const check = typeof raw.check === 'string' ? raw.check.trim() : '';
  if (check.length === 0) return undefined;
  return {
    step: typeof raw.step === 'string' ? raw.step : '',
    check,
    normal: typeof raw.normal === 'string' ? raw.normal : '',
    abnormal: typeof raw.abnormal === 'string' ? raw.abnormal : '',
    tool: typeof raw.tool === 'string' ? raw.tool : '',
  };
}

function normalizeTestObject(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const id = String(raw.id ?? '').trim().toUpperCase();
  if (!/^T\d{2}$/.test(id)) return undefined;
  const category = typeof raw.category === 'string' && Object.hasOwn(CATEGORIES, raw.category) ? raw.category : 'record';
  return {
    id,
    category,
    categoryLabel: typeof raw.categoryLabel === 'string' && raw.categoryLabel.length > 0 ? raw.categoryLabel : CATEGORIES[category],
    title: typeof raw.title === 'string' ? raw.title : id,
    target: typeof raw.target === 'string' ? raw.target : '',
    background: typeof raw.background === 'string' ? raw.background : '',
    project: typeof raw.project === 'string' ? raw.project.replace(/^工程证据[:：]\s*/, '') : '',
    minutes: typeof raw.minutes === 'string' && raw.minutes.length > 0 ? raw.minutes : '2-3 分钟',
    questions: arr(raw.questions).length > 0 ? arr(raw.questions) : [...QUESTIONS],
    metrics: (Array.isArray(raw.metrics) ? raw.metrics.map(normalizeMetric).filter((v) => v !== undefined) : []).slice(0, 10),
    conditions: arr(raw.conditions).slice(0, 14),
    criteria: (Array.isArray(raw.criteria) ? raw.criteria.map(normalizeCriterion).filter((v) => v !== undefined) : []).slice(0, 12),
    tools: arr(raw.tools).slice(0, 8),
    record: arr(raw.record).slice(0, 10),
    regression: arr(raw.regression).slice(0, 8),
    traps: arr(raw.traps).slice(0, 8),
    hint: typeof raw.hint === 'string' ? raw.hint : '',
  };
}

function normalizeBank(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const byId = new Map();
  for (const entry of source) {
    const testObject = normalizeTestObject(entry);
    if (testObject !== undefined && !byId.has(testObject.id)) byId.set(testObject.id, testObject);
  }
  if (byId.size === 0) {
    for (const entry of DEFAULT_BANK) {
      const testObject = normalizeTestObject(entry);
      if (testObject !== undefined) byId.set(testObject.id, testObject);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function loadBank() {
  return normalizeBank(readJson(path.join(DATA_DIR, 'test-objects.json')));
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
    timer: null,
    startedAt: null,
    updatedAt: null,
    records: [],
    log: [],
  };
}

function normalizeRecord(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const id = String(raw.id ?? '').trim().toUpperCase();
  if (!/^T\d{2}$/.test(id)) return undefined;
  const verdict = VERDICTS.includes(raw.verdict) ? raw.verdict : 'weak';
  const scores = {};
  if (raw.scores !== null && typeof raw.scores === 'object') {
    for (const dimension of DIMENSIONS) {
      const value = Number(raw.scores[dimension.key]);
      if (Number.isFinite(value)) scores[dimension.key] = clamp(Math.round(value), 0, 100);
    }
  }
  const score = Number.isFinite(Number(raw.score)) ? clamp(Math.round(Number(raw.score)), 0, 100) : undefined;
  return {
    id,
    verdict,
    seconds: toSeconds(raw.seconds),
    note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '',
    score,
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
    current: /^T\d{2}$/.test(String(raw.current ?? '')) ? String(raw.current) : null,
    timer:
      raw.timer !== null && typeof raw.timer === 'object' && /^T\d{2}$/.test(String(raw.timer.id ?? '')) && typeof raw.timer.startedAt === 'string'
        ? { id: String(raw.timer.id), startedAt: raw.timer.startedAt }
        : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
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

function modeBank(bank, mode) {
  const config = MODES[mode] ?? MODES.all;
  if (config.categories === null) return bank;
  return bank.filter((testObject) => config.categories.includes(testObject.category));
}

function nextTestObjectId(state, bank, afterId) {
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
  const records = state.records.filter((item) => item.id !== record.id);
  records.push(record);
  records.sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...state,
    status: 'running',
    records,
    log: [...state.log, { at: record.at, kind: 'record', id: record.id, verdict: record.verdict }].slice(-200),
    timer: state.timer?.id === record.id ? null : state.timer,
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

/** 题号：按 begin 事件顺序给每个测试对象编号（第一次被抽到的序号）。 */
function questionIndexMap(state) {
  const map = new Map();
  let index = 0;
  for (const entry of state.log) {
    if (entry === null || typeof entry !== 'object' || entry.kind !== 'begin') continue;
    index += 1;
    const id = String(entry.id ?? '');
    if (!map.has(id)) map.set(id, index);
  }
  return map;
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
    const pool = bank.filter((testObject) => testObject.category === key);
    const done = state.records.filter((record) => pool.some((testObject) => testObject.id === record.id)).length;
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
  if (score >= 85) return '优秀（验证形成了“指标—条件—判据—回归”的闭环）';
  if (score >= 70) return '良好（有指标意识，判据与异常覆盖还欠具体）';
  if (score >= 55) return '及格（会测，但条件写不清、回归没做）';
  return '待加强（还停留在“能跑就行”的验证水平）';
}

const HABIT_LIBRARY = [
  {
    key: 'onlyworks',
    name: '只测“能跑”：能通电、能动、能显示就认为验证完成',
    detect: (text) => /能跑|能动|跑起来|能显示|看着正常|没问题|行了|正常啊/.test(text),
    fix: '把“能用”翻译成 3 个带数值和单位的指标，写下通过标准；“能跑”不能作为结论。',
    framework:
      '「目标-指标-判据」三行法：测试目标（功能/性能/稳定/边界/异常）→ 指标（数值+单位+正常范围）→ 判据（看到什么算通过）。',
  },
  {
    key: 'noquant',
    name: '不可量化：用“稳定”“差不多”“多测几次”代替指标与范围',
    detect: (text) => /稳定|差不多|还行|稍微|有点|多测几次|跑一跑看看|大概/.test(text),
    fix: '每个指标补上数值、单位、测量次数和正常范围；说不出范围的指标等于没测。',
    framework:
      '「指标五要素」：名称 + 单位 + 正常范围 + 测量次数/样本量 + 通过标准。缺一项就必须补。',
  },
  {
    key: 'norepro',
    name: '条件不可复现：测试条件没写清，换人/换时间重做不出来',
    detect: (text) => /随便|平时|在我这|换一块板|换一块电池|换个场地|大概就那样|没注意条件/.test(text),
    fix: '每条用例固定写清输入、环境、负载、电压、温度、时长；写完让另一个人照表执行一次。',
    framework:
      '「可复现五要素」：输入与激励 → 环境（温度/供电/负载）→ 前置状态 → 操作步骤 → 采样工具与配置。',
  },
  {
    key: 'noboundary',
    name: '只测正常路径：不测边界、不测异常，系统一进异常就没人知道会怎样',
    detect: (text) => /正常流程|正常情况|基本功能|没测过异常|不敢|没试过拔/.test(text),
    fix: '每个功能至少补 3 类用例：边界值（±1/极值/0）、异常注入（拔线/错帧/超范围）、极端条件（低压/高温/满载）。',
    framework:
      '「四象限覆盖」：正常 → 边界 → 异常 → 极端；每个功能四象限各至少 1 条用例并写判据。',
  },
  {
    key: 'noregress',
    name: '改完不回归：代码/参数/硬件一改，只跑自己改的那条，不重跑关键用例',
    detect: (text) => /改完|重新烧|烧完|没重跑|没回归|只跑了|应该没影响/.test(text),
    fix: '改动前先定回归集（关键路径 + 上次缺陷用例），改完必须全跑并对比指标是否退化。',
    framework:
      '「回归三门」：变更影响分析 → 关键用例 100% 重跑 → 指标对比表（改前/改后/允许偏差）。',
  },
  {
    key: 'norecord',
    name: '不记录也没有证据：测试结论只在脑子里，出了问题无法回溯',
    detect: (text) => /没记|不记得|忘了|没写|口头|大概记得/.test(text),
    fix: '用例编号、条件、期望、实际、结论、版本、日期、证据（截图/波形/日志）八项落表，一次一记。',
    framework:
      '「记录八列」：编号 / 条件 / 输入 / 期望 / 实际 / 结论 / 版本 / 证据。缺列即视为未测。',
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
  const byId = new Map(bank.map((testObject) => [testObject.id, testObject]));
  const recordById = new Map(state.records.map((record) => [record.id, record]));
  const questionIndex = questionIndexMap(state);
  const lines = [];
  const now = new Date();
  lines.push('# 测试与验证 · 复盘报告');
  lines.push('');
  lines.push(`- 生成时间：${now.toISOString()}`);
  lines.push(`- 工程目录：\`${workspace}\``);
  lines.push(`- 状态文件：\`${STATE_PATH}\``);
  lines.push(`- 覆盖：${stats.attempted}/${stats.total} 个测试对象（${stats.coverage}%），练习用时 ${formatSeconds(stats.totalSeconds)}`);
  lines.push('');

  lines.push('## 1. 测试与验证能力总分（100 分制）');
  lines.push('');
  const lowCoverage = stats.coverage < 50;
  lines.push(
    lowCoverage
      ? `**${stats.score} / 100**（已记录自评分）— 覆盖不足（${stats.coverage}%），先跑完一轮再当结论。`
      : `**${stats.score} / 100** — ${gradeOf(stats.score)}`,
  );
  lines.push('');
  lines.push('> 说明：总分 = 已记录题目的平均分（每题按七维自评/教练评分取均值）；未考不扣分，覆盖率单独统计。');
  lines.push('');

  lines.push('## 2. 分项评分');
  lines.push('');
  lines.push('| 分项 | 得分 | 样本数 |');
  lines.push('| --- | --- | --- |');
  for (const dimension of stats.dimensions) {
    lines.push(`| ${dimension.label} | ${dimension.samples > 0 ? dimension.value : '—'} | ${dimension.samples} |`);
  }
  lines.push('');
  lines.push('| 分组 | 覆盖 | 通过 | 待加强 | 跳过 |');
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
    lines.push('- 还没有带分数的记录；先把一题完整走完（指标/条件/判据/工具/记录回归），再谈亮点。');
  }
  for (const { record, value } of best) {
    const testObject = byId.get(record.id);
    const dimensions = record.scores
      ? Object.entries(record.scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([key, score]) => `${DIMENSIONS.find((item) => item.key === key)?.label ?? key} ${score}`)
          .join('、')
      : '—';
    lines.push(`- **${record.id} ${testObject?.title ?? ''}**：${value} 分（强项：${dimensions}）${record.note ? `；${record.note}` : ''}`);
  }
  lines.push('');

  lines.push('## 4. 最危险的 3 个测试坏习惯');
  lines.push('');
  habitsOf(state).forEach((habit, index) => {
    lines.push(`### 坏习惯 ${index + 1}：${habit.name}`);
    lines.push('');
    lines.push(`- **纠正方法**：${habit.fix}`);
    lines.push(`- **标准测试框架**：${habit.framework}`);
    lines.push('');
  });

  lines.push('## 5. 测试对象覆盖矩阵');
  lines.push('');
  lines.push('| 测试对象 | 分组 | 是否练到 | 题号 | 结果 | 得分 | 用时 | 薄弱点 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const testObject of bank) {
    const record = recordById.get(testObject.id);
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
      `| ${testObject.id} ${testObject.title} | ${testObject.categoryLabel} | ${record === undefined ? '否' : '是'} | ${
        questionIndex.has(testObject.id) ? `第 ${questionIndex.get(testObject.id)} 题` : '—'
      } | ${record === undefined ? '—' : record.verdict} | ${record === undefined ? '—' : averageScore(record) ?? '—'} | ${
        record === undefined ? '—' : formatSeconds(record.seconds)
      } | ${wall} |`,
    );
  }
  lines.push('');

  lines.push('## 6. 下一轮建议练的 3 个测试对象');
  lines.push('');
  const practice = bank
    .map((testObject) => ({ testObject, record: recordById.get(testObject.id) }))
    .filter(({ record }) => record === undefined || record.verdict !== 'passed' || (averageScore(record) ?? 100) < 75)
    .sort((a, b) => {
      const rank = (record) => (record === undefined ? 0 : record.verdict === 'skipped' ? 1 : 2);
      return rank(a.record) - rank(b.record) || a.testObject.id.localeCompare(b.testObject.id);
    })
    .slice(0, 3);
  if (practice.length === 0) {
    lines.push('1. 覆盖完成，建议加练“只练记录 + 长跑/异常注入”组合，把证据链补齐（截图、波形、日志）。');
  }
  practice.forEach(({ testObject }, index) => {
    lines.push(`${index + 1}. **${testObject.id} ${testObject.title}**：${testObject.target || testObject.background}`);
  });
  lines.push('');

  lines.push('## 7. 一句话总结');
  lines.push('');
  const summary = lowCoverage
    ? `目前只练到 ${stats.coverage}%，还看不出验证方法成型；先把通信、控制、记录各练 2 题，再回头看这张表。`
    : stats.score >= 85
      ? '你已经能把测试写成“指标—条件—判据—工具—记录—回归”的闭环，下一步是让别人照你的记录能复现。'
      : stats.score >= 70
        ? '指标意识有了，但条件与判据还偏“看一眼”；下一轮每题强制写“正常值/异常值/回归看哪几个数”三行。'
        : '先戒掉“只测能跑”和“说不出范围”两个习惯，每步都问：看到什么算正常，异常长什么样？';
  lines.push(summary);
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* RPC 方法                                                            */
/* ------------------------------------------------------------------ */

const RPC_METHOD_NAMES = [
  'state',
  'bank',
  'object',
  'begin',
  'record',
  'skip',
  'next',
  'setMode',
  'setWorkspace',
  'reset',
  'finish',
  'report',
  'copyPrompt',
  'reference',
];

function summaryOf(testObject) {
  return {
    id: testObject.id,
    category: testObject.category,
    categoryLabel: testObject.categoryLabel,
    title: testObject.title,
    target: testObject.target,
    project: testObject.project,
  };
}

function buildSubjects(configWorkspace) {
  const session = { workspace: configWorkspace ?? DEFAULT_WORKSPACE, config: {} };

  const methods = {
    async state() {
      const bank = loadBank();
      const state = loadState();
      const current = state.current === null ? undefined : bank.find((testObject) => testObject.id === state.current);
      return {
        state,
        stats: statsOf(state, bank),
        current: current === undefined ? null : current,
        bankSummary: bank.map(summaryOf),
        modes: Object.entries(MODES).map(([id, value]) => ({ id, label: value.label })),
        dimensions: DIMENSIONS,
        questionIndex: Object.fromEntries(questionIndexMap(state)),
        paths: {
          state: STATE_PATH,
          bank: path.join(DATA_DIR, 'test-objects.json'),
          skill: SKILL_PATH,
          workspace: session.workspace,
        },
        now: nowIso(),
      };
    },
    async bank() {
      return { bank: loadBank(), categories: CATEGORIES };
    },
    async object(args) {
      const bank = loadBank();
      const id = String(args?.id ?? '').trim().toUpperCase();
      const testObject = bank.find((item) => item.id === id);
      if (testObject === undefined) throw new Error(`unknown test object ${JSON.stringify(args?.id)}`);
      return { object: testObject };
    },
    async begin(args) {
      const bank = loadBank();
      let state = loadState();
      const mode = args?.mode ?? state.mode;
      if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}`);
      const requested = typeof args?.id === 'string' ? args.id.trim().toUpperCase() : undefined;
      const pool = modeBank(bank, mode);
      const id =
        requested !== undefined && pool.some((testObject) => testObject.id === requested)
          ? requested
          : nextTestObjectId({ ...state, mode }, bank, state.current ?? undefined);
      if (id === undefined) throw new Error('no test object available');
      state = {
        ...state,
        status: 'running',
        mode,
        current: id,
        startedAt: state.startedAt ?? nowIso(),
        timer: { id, startedAt: nowIso() },
        log: [...state.log, { at: nowIso(), kind: 'begin', id, mode }].slice(-200),
      };
      const testObject = bank.find((item) => item.id === id);
      return {
        state: saveState(state),
        stats: statsOf(state, bank),
        object: testObject === undefined ? null : testObject,
      };
    },
    async record(args) {
      const bank = loadBank();
      const record = normalizeRecord(args);
      if (record === undefined) throw new Error('record requires { id: Txx, verdict: passed|weak|skipped }');
      const state = applyRecord(loadState(), record);
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async skip(args) {
      const bank = loadBank();
      const state0 = loadState();
      const id = String(args?.id ?? state0.current ?? '').trim().toUpperCase();
      const record = normalizeRecord({ id, verdict: 'skipped', seconds: args?.seconds ?? 0, note: args?.note ?? '跳过' });
      if (record === undefined) throw new Error('skip requires a valid test object id');
      const state = applyRecord(state0, record);
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async next(args) {
      const bank = loadBank();
      let state = loadState();
      const after = typeof args?.after === 'string' ? args.after.trim().toUpperCase() : state.current ?? undefined;
      const id = nextTestObjectId(state, bank, after);
      if (id === undefined) throw new Error('no next test object');
      state = { ...state, status: state.status === 'idle' ? 'running' : state.status, current: id, timer: { id, startedAt: nowIso() } };
      const testObject = bank.find((item) => item.id === id);
      return {
        state: saveState(state),
        stats: statsOf(state, bank),
        object: testObject === undefined ? null : testObject,
      };
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
    async reference(args) {
      const bank = loadBank();
      const id = String(args?.id ?? loadState().current ?? '').trim().toUpperCase();
      const testObject = bank.find((item) => item.id === id);
      if (testObject === undefined) throw new Error(`unknown test object ${JSON.stringify(args?.id)}`);
      return { object: testObject };
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
      const file = path.join(dir, `测试验证复盘-${stamp(new Date())}.md`);
      try {
        fs.writeFileSync(file, report, 'utf8');
      } catch (error) {
        throw new Error(`复盘写入失败：${error instanceof Error ? error.message : String(error)}`);
      }
      const state = saveState({ ...state0, status: 'finished', timer: null });
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
  properties: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.key, { type: 'integer', minimum: 0, maximum: 100, description: `${dimension.label} 自评分` }])),
  additionalProperties: false,
};

function formatMetrics(metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) return '（题库未提供指标，按“数值+单位+范围”自己补）';
  return metrics
    .map((metric) => `- ${metric.name}${metric.unit ? `（${metric.unit}）` : ''}：正常 ${metric.normal}｜异常 ${metric.abnormal}`)
    .join('\n');
}

function formatCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) return '（题库未提供判据，按“正常/异常分别看到什么”自己补）';
  return criteria
    .map((item) => {
      const head = item.step ? `${item.step}：` : '';
      const tool = item.tool ? `｜工具：${item.tool}` : '';
      return `- ${head}${item.check}｜正常：${item.normal}｜异常：${item.abnormal}${tool}`;
    })
    .join('\n');
}

function formatQuestion(testObject) {
  const lines = [];
  lines.push(`【测试对象：${testObject.id} ${testObject.title}】`);
  if (testObject.target) lines.push(`被测系统：${testObject.target}`);
  if (testObject.background) lines.push(`背景：${testObject.background}`);
  if (testObject.project) lines.push(`工程证据（可核对）：${testObject.project}`);
  lines.push('');
  lines.push('请回答：');
  for (const question of testObject.questions) lines.push(question);
  lines.push('');
  lines.push(`【建议熟练回答时间：${testObject.minutes}】追问 30 秒-1 分钟。`);
  return lines.join('\n');
}

function formatReference(testObject) {
  const lines = [];
  lines.push(`【教练底稿：${testObject.id} ${testObject.title}】`);
  if (testObject.target) lines.push(`被测系统：${testObject.target}`);
  if (testObject.project) lines.push(`工程证据：${testObject.project}`);
  lines.push('');
  lines.push('## 指标（数值 + 单位 + 正常/异常范围）');
  lines.push(formatMetrics(testObject.metrics));
  lines.push('');
  lines.push('## 测试条件构造');
  for (const condition of testObject.conditions) lines.push(`- ${condition}`);
  lines.push('');
  lines.push('## 判据（每步正常/异常/工具）');
  lines.push(formatCriteria(testObject.criteria));
  lines.push('');
  lines.push('## 工具匹配');
  for (const tool of testObject.tools) lines.push(`- ${tool}`);
  lines.push('');
  lines.push('## 记录表字段');
  for (const item of testObject.record) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## 回归看哪几个数');
  for (const item of testObject.regression) lines.push(`- ${item}`);
  if (testObject.traps.length > 0) {
    lines.push('');
    lines.push('## 常见坏习惯');
    for (const trap of testObject.traps) lines.push(`- ${trap}`);
  }
  lines.push('');
  lines.push('## 标准测试框架');
  lines.push('1. 明确测试目标：功能正确、性能达标、稳定性、边界鲁棒性、异常安全。');
  lines.push('2. 定义指标：数值 + 单位 + 正常范围 + 通过标准。');
  lines.push('3. 构造条件：输入范围、环境、负载、电压、温度、连续时长、异常注入。');
  lines.push('4. 采集工具：万用表/示波器/逻辑分析仪/串口/VOFA+/日志/统计。');
  lines.push('5. 记录表：用例编号、条件、输入、预期、实际、结论、版本、日期。');
  lines.push('6. 回归：改代码/改参数/换硬件后重跑关键用例，对比指标是否退化。');
  lines.push('7. 结论：通过 / 不通过 / 有条件通过，附证据。');
  return lines.join('\n');
}

function buildToolDefinitions(api) {
  return [
    {
      name: 'testcoach_state',
      description:
        '读取测试验证训练当前状态：模式、当前测试对象、已练/未练对象数、七维分项得分与题库一览。开始或继续测试验证训练前先调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: TOOL_OUTPUT,
      async execute() {
        const value = await api.methods.state();
        const { state, stats, current } = value;
        const lines = [];
        lines.push(`状态：${state.status}｜模式：${state.mode}（${MODES[state.mode]?.label ?? state.mode}）｜当前对象：${state.current ?? '无'}`);
        lines.push(`覆盖：${stats.attempted}/${stats.total}（${stats.coverage}%）｜总分：${stats.score}｜用时：${formatSeconds(stats.totalSeconds)}`);
        lines.push(`已练：${state.records.map((record) => `${record.id}:${record.verdict}${averageScore(record) === undefined ? '' : `(${averageScore(record)})`}`).join(', ') || '无'}`);
        const recorded = new Set(state.records.map((record) => record.id));
        lines.push(`未练：${value.bankSummary.filter((item) => !recorded.has(item.id)).map((item) => item.id).join(', ') || '无'}`);
        lines.push(`七维均分：${stats.dimensions.map((dimension) => `${dimension.label}${dimension.samples > 0 ? ` ${dimension.value}` : ' —'}`).join('｜')}`);
        if (current !== null && current !== undefined) {
          lines.push(`当前题干：${current.id} ${current.title}——${current.background || current.target}`);
        }
        lines.push(`题库来源：data/test-objects.json（${stats.total} 条）；面板状态文件：${value.paths.state}`);
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'testcoach_begin',
      description:
        '开始/继续测试验证训练：设定模式（all/comms 只练通信/control 只练控制/record 只练记录/display 只练显示）并选中当前测试对象（不给 id 时自动跳到下一个未练对象）。返回按出题格式写好的题干；左侧栏「测试验证」面板同步显示当前对象与六问。',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['all', 'comms', 'control', 'record', 'display'],
            description: '训练模式，默认沿用当前模式；只练通信=comms（T01/T04/T06/T07），只练控制=control（T02/T03/T05/T09），只练记录=record（T10/T11/T12），只练显示=display（T08）。',
          },
          id: { type: 'string', description: '指定从哪个测试对象开始，如 T01。' },
        },
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { state, stats, object: testObject } = await api.methods.begin(args ?? {});
        const lines = [`已选中：${state.current}（模式 ${state.mode}）；覆盖 ${stats.attempted}/${stats.total}。`];
        if (testObject !== null && testObject !== undefined) {
          lines.push('');
          lines.push(formatQuestion(testObject));
          lines.push('');
          lines.push('（把上面题干原样输出给用户，然后等用户回答；不要主动给出指标或判据，用户说“提示”只给 1 条方向，“参考答案”再调 testcoach_reference。）');
        }
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'testcoach_record',
      description:
        '把一道测试验证题的结论写进训练状态（左侧栏实时同步）：通过 passed / 待加强 weak / 跳过 skipped；可带实际用时秒数、一句点评 note，以及七维自评分 scores（quant 指标可量化 / repro 条件可复现 / boundary 边界与异常覆盖 / criteria 判据明确性 / tools 工具匹配度 / regression 记录与回归意识 / expression 表达逻辑，各 0-100）。复盘总分来自这些自评分。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '测试对象编号，如 T01。' },
          verdict: { type: 'string', enum: VERDICTS, description: '本题结论。' },
          seconds: { type: 'integer', description: '实际用时（秒）。' },
          note: { type: 'string', description: '一句点评：缺哪个指标、哪个条件没写、判据是否可观测、是否缺回归。' },
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
      name: 'testcoach_reference',
      description:
        '取当前（或指定）测试对象的教练底稿：指标清单（数值+单位+正常/异常范围）、测试条件构造、判据（每步正常/异常/工具）、工具匹配、记录表字段、回归看哪几个数、常见坏习惯与标准测试框架。只在用户明确说“参考答案/看参考答案”时调用，不要主动调用，也不要把底稿一次性全倒给用户。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '测试对象编号，默认当前对象。' } },
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { object: testObject } = await api.methods.reference(args ?? {});
        return { text: formatReference(testObject) };
      },
    },
    {
      name: 'testcoach_report',
      description:
        '生成测试与验证复盘（100 分制总分 + 七维分项 + 分组覆盖 + 表现最好的 3 点 + 最危险 3 个测试坏习惯及纠正方法与标准框架 + 测试对象覆盖矩阵 + 下一轮 3 个对象 + 一句话总结）。用户说“结束测试”时调用；不自动写文件，落盘用面板「结束并落盘复盘」。',
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
  const api = buildSubjects(
    typeof config?.workspace === 'string' && config.workspace.trim().length > 0 ? path.resolve(config.workspace.trim()) : DEFAULT_WORKSPACE,
  );
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
        'test-teacher: rpc route',
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
          name: 'test-verify-coach',
          description:
            '测试与验证老师：一次给一个测试对象（T01–T12：协议边界、PID 证明、姿态解算、蓝牙稳定性、电机闭环、双机可靠性、编码器测速、OLED、供电复位、整机长跑、用例与记录、异常注入），按“指标/条件/判据/工具/记录回归”六项作答并逐层追问，最后出 100 分制复盘。',
          whenToUse:
            '用户要求练习测试与验证、验证指标/判据、写测试方案、给系统做测试、面试前练“怎么证明它没问题”，或说“开始测试/只练通信/只练控制/只练记录/结束测试”时使用。',
          content: stripFrontmatter(content),
          invocation: { modelInvocable: true, userInvocable: true },
        }),
      );
      log('info', '已注册 skill：test-verify-coach');
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
      log('info', '已注册工具：testcoach_state / testcoach_begin / testcoach_record / testcoach_reference / testcoach_report');
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
      'test-teacher: dispose',
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
  QUESTIONS,
  DEFAULT_BANK,
  normalizeBank,
  normalizeTestObject,
  normalizeMetric,
  normalizeCriterion,
  normalizeState,
  normalizeRecord,
  statsOf,
  nextTestObjectId,
  buildReport,
  habitsOf,
  averageScore,
  questionIndexMap,
  stripFrontmatter,
  formatMetrics,
  formatCriteria,
  formatQuestion,
  formatReference,
};
