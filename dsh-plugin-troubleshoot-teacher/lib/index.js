/**
 * dsh-troubleshoot-teacher — host half.
 *
 * 排错方法论老师 · DSH 插件宿主半。
 *
 * 职责：
 *  1. JSON RPC（浏览器半的唯一数据通道）
 *     POST /plugins/dsh-troubleshoot-teacher/rpc
 *     body: { method, args } → { ok: true, value } | { ok: false, error }
 *     methods: state / phenomenon / begin / record / skip / next / setMode /
 *              setWorkspace / reset / finish / report / copyPrompt / bank
 *  2. 注册模型可见的 skill：troubleshoot-coach（排错方法论老师人设 + 流程）
 *  3. 注册 4 个同步工具 tscoach_state / tscoach_begin / tscoach_record /
 *     tscoach_report，让会话里的“老师”把逐题结果实时写进左侧栏面板
 *  4. 读取 data/phenomena.json（P01–P16 现象题库，含判据/标准框架/常见跳步）
 *  5. 状态落盘 <DSH_HOME>/troubleshoot-coach/state.json（原子写），
 *     复盘落盘 <workspace>/面试记录/排错复盘-<时间>.md
 *
 * 本插件只教排错方法论（顺序、判据、工具、异常分支、记录），不写代码、
 * 不选元件、不替用户排查。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 跨平台：默认工作目录从用户主目录推导（可用 DSH_COACH_WORKSPACE 覆盖）
const USER_HOME = process.env.DSH_COACH_WORKSPACE || process.env.USERPROFILE || process.env.HOME || '';

export const name = 'dsh-troubleshoot-teacher';

const PLUGIN_ID = 'dsh-troubleshoot-teacher';
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
const STATE_DIR = path.join(DSH_HOME, 'troubleshoot-coach');
const STATE_PATH = path.join(STATE_DIR, 'state.json');

/** 默认工程目录（复盘与记录落盘处）；可用 cordis.patch.yml 的 config.workspace 覆盖。 */
const DEFAULT_WORKSPACE = USER_HOME + '\\Desktop\\Taurus car';

const CATEGORIES = {
  comms: '通信',
  motor: '电机',
  sensor: '传感器',
  system: '系统/跨层',
};

const MODES = {
  all: { label: '全部现象', categories: null },
  comms: { label: '只练通信', categories: ['comms'] },
  motor: { label: '只练电机', categories: ['motor'] },
  sensor: { label: '只练传感器', categories: ['sensor'] },
  system: { label: '只练系统/跨层', categories: ['system'] },
};

/** 六项点评维度（复盘分项用）。 */
const DIMENSIONS = [
  { key: 'layering', label: '分层隔离', max: 100 },
  { key: 'order', label: '排查顺序', max: 100 },
  { key: 'criteria', label: '判据可观测性', max: 100 },
  { key: 'tools', label: '工具使用', max: 100 },
  { key: 'branches', label: '异常分支', max: 100 },
  { key: 'records', label: '记录与复现', max: 100 },
  { key: 'expression', label: '表达逻辑', max: 100 },
];

/** 现象 → 硬件考核点（复盘交叉引用，缺省不影响功能）。 */
const PHENOMENON_TO_HARDWARE = {
  P01: ['H05', 'H10'],
  P02: ['H01', 'H20'],
  P03: ['H03', 'H14'],
  P04: ['H04', 'H11'],
  P05: ['H07', 'H13'],
  P06: ['H12', 'H13'],
  P07: ['H01', 'H10'],
  P08: ['H01', 'H20'],
  P09: ['H10', 'H16'],
  P10: ['H12', 'H13'],
  P11: ['H03', 'H08'],
  P12: ['H10', 'H19'],
  P13: ['H03', 'H14'],
  P14: ['H02', 'H17'],
  P15: ['H10', 'H05'],
  P16: ['H06', 'H08'],
};

/** 题库兜底（data/phenomena.json 缺失时仍能出题）。 */
const DEFAULT_BANK = [
  { id: 'P01', category: 'comms', title: '双机通信不通', symptom: '手带端发送正常，小车端收不到，OLED 无显示。' },
  { id: 'P02', category: 'motor', title: '电机一转就复位/花屏', symptom: '电机一转单片机复位或 OLED 花屏。' },
  { id: 'P03', category: 'sensor', title: 'MPU6050 角度跳动/不回零', symptom: 'MPU6050 静止时角度跳动大，倾斜后回不到零。' },
  { id: 'P04', category: 'comms', title: '无线时好时坏', symptom: '蓝牙/NRF 控制时好时坏，距离稍远就丢包或延迟。' },
  { id: 'P05', category: 'sensor', title: '编码器计数异常', symptom: '编码器不计数、只加不减或数值乱跳。' },
  { id: 'P06', category: 'motor', title: '速度闭环振荡/超调', symptom: '电机能转但速度闭环振荡、超调或稳态误差大。' },
  { id: 'P07', category: 'system', title: '电机启动瞬间丢帧', symptom: '电机启动瞬间，串口通信丢帧。' },
  { id: 'P08', category: 'system', title: '电池电压下降后异常', symptom: '电池电压下降后，系统重启或电机无力。' },
  { id: 'P09', category: 'comms', title: 'UART 能收不能发', symptom: '两块板 UART 能收不能发，或发一会儿就卡死。' },
  { id: 'P10', category: 'motor', title: '小车直线跑偏', symptom: '小车直线跑偏，差速补偿后仍偏。' },
  { id: 'P11', category: 'sensor', title: 'I2C 偶尔读失败', symptom: '传感器 I2C 偶尔读失败，重新上电又好。' },
  { id: 'P12', category: 'system', title: 'VOFA+ 正常但不跟随', symptom: 'VOFA+ 波形正常但实际电机不跟随。' },
  { id: 'P13', category: 'sensor', title: '手势方向反/死区不动', symptom: '手势控制方向反了，或在死区附近完全不动。' },
  { id: 'P14', category: 'system', title: 'RTOS 卡死/数据错乱', symptom: 'FreeRTOS 任务间显示卡死或数据错乱。' },
  { id: 'P15', category: 'comms', title: '协议解包总失败', symptom: '自定义协议帧头 0xA5、帧尾 0x0D 校验总是解包失败。' },
  { id: 'P16', category: 'motor', title: 'OLED 电机启动时花屏', symptom: 'OLED 在电机启动时花屏或无显示。' },
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

function normalizeCriterion(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const check = typeof raw.check === 'string' ? raw.check.trim() : '';
  if (check.length === 0) return undefined;
  return {
    step: typeof raw.step === 'string' ? raw.step : '',
    layer: typeof raw.layer === 'string' ? raw.layer : '',
    check,
    normal: typeof raw.normal === 'string' ? raw.normal : '',
    abnormal: typeof raw.abnormal === 'string' ? raw.abnormal : '',
    tool: typeof raw.tool === 'string' ? raw.tool : '',
  };
}

function normalizePhenomenon(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const id = String(raw.id ?? '').trim().toUpperCase();
  if (!/^P\d{2}$/.test(id)) return undefined;
  const category = typeof raw.category === 'string' && Object.hasOwn(CATEGORIES, raw.category) ? raw.category : 'system';
  return {
    id,
    category,
    categoryLabel: typeof raw.categoryLabel === 'string' && raw.categoryLabel.length > 0 ? raw.categoryLabel : CATEGORIES[category],
    title: typeof raw.title === 'string' ? raw.title : id,
    symptom: typeof raw.symptom === 'string' ? raw.symptom : '',
    background: typeof raw.background === 'string' ? raw.background : '',
    questions:
      arr(raw.questions).length > 0
        ? arr(raw.questions)
        : ['1）你的排查顺序是什么？', '2）每一步的判据是什么（看到什么算正常/异常）？', '3）每一步用什么工具/手段？', '4）异常分支怎么走，正常分支下一步查什么？'],
    layers: arr(raw.layers).length > 0 ? arr(raw.layers) : ['供电', '地', '信号', '协议', '执行', '显示'],
    criteria: (Array.isArray(raw.criteria) ? raw.criteria.map(normalizeCriterion).filter((v) => v !== undefined) : []).slice(0, 12),
    steps: arr(raw.steps),
    traps: arr(raw.traps),
    hint: typeof raw.hint === 'string' ? raw.hint : '',
    reference: typeof raw.reference === 'string' ? raw.reference : '',
    hardware: Array.isArray(PHENOMENON_TO_HARDWARE[id]) ? PHENOMENON_TO_HARDWARE[id] : [],
  };
}

function normalizeBank(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const byId = new Map();
  for (const entry of source) {
    const phenomenon = normalizePhenomenon(entry);
    if (phenomenon !== undefined && !byId.has(phenomenon.id)) byId.set(phenomenon.id, phenomenon);
  }
  if (byId.size === 0) {
    for (const entry of DEFAULT_BANK) {
      const phenomenon = normalizePhenomenon(entry);
      if (phenomenon !== undefined) byId.set(phenomenon.id, phenomenon);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function loadBank() {
  return normalizeBank(readJson(path.join(DATA_DIR, 'phenomena.json')));
}

/* ------------------------------------------------------------------ */
/* 排错状态                                                            */
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
  if (!/^P\d{2}$/.test(id)) return undefined;
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
    current: /^P\d{2}$/.test(String(raw.current ?? '')) ? String(raw.current) : null,
    timer:
      raw.timer !== null && typeof raw.timer === 'object' && /^P\d{2}$/.test(String(raw.timer.id ?? '')) && typeof raw.timer.startedAt === 'string'
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
  return bank.filter((phenomenon) => config.categories.includes(phenomenon.category));
}

function nextPhenomenonId(state, bank, afterId) {
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
  if (record === null || record === undefined) return undefined;
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
    const pool = bank.filter((phenomenon) => phenomenon.category === key);
    const done = state.records.filter((record) => pool.some((phenomenon) => phenomenon.id === record.id)).length;
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
  if (score >= 85) return '优秀（排错像流程，不像碰运气）';
  if (score >= 70) return '良好（有分层意识，判据还欠具体）';
  if (score >= 55) return '及格（顺序大致对，隔离与记录偏弱）';
  return '待加强（容易跳步、凭感觉换件）';
}

const HABIT_LIBRARY = [
  {
    key: 'swap',
    name: '乱换件：现象一出现就先换模块/换板/换线',
    detect: (text) => /换模块|换板|换一块|换线|换电机|换传感器|直接换/.test(text),
    fix: '换件前先给一条可测量的判据：换了能证明什么？如果换完现象不变，你排除了哪一层？写下来再换。',
    framework: '「判据先行」：现象 → 分层 → 每层一条可观测判据 → 才允许换件，换件必须记录“换了什么/现象是否变化”。',
  },
  {
    key: 'nocriteria',
    name: '无判据：只写“检查一下/再试试”，说不出正常与异常的样子',
    detect: (text) => /检查一下|再看看|再试试|试试看|观察一下/.test(text),
    fix: '每一步都写成“看到什么算正常、看到什么算异常”，并绑定量值或波形特征。',
    framework: '「一步一判据」：步骤 + 正常值/波形 + 异常值/波形 + 仪器，四项缺一不算完成。',
  },
  {
    key: 'gndlater',
    name: '不共地先查协议：还没确认供电与地就开始改帧格式、换波特率',
    detect: (text) => /改协议|帧格式|换波特率|改波特率|查协议/.test(text),
    fix: '先把供电/地/电平钉死（万用表测电压、测共地通断），再动协议与代码。',
    framework: '「先供电后信号」：供电 → 地 → 电平 → 信号 → 协议 → 执行 → 显示。',
  },
  {
    key: 'noisolate',
    name: '不做隔离：问题范围一直覆盖整机，没有缩到某一层/某一模块',
    detect: (text) => /整机|全局|都查一遍|逐个查/.test(text),
    fix: '每步问自己：查完这一步，问题范围缩小到哪？缩不下去说明这步设计无效。',
    framework: '「二分隔离」：单模块自测 → 两两联调 → 全系统，每步把嫌疑集对半切。',
  },
  {
    key: 'nobranch',
    name: '没有异常分支：正常就继续、异常就卡住，不知道下一步怎么绕',
    detect: (text) => /正常就继续|异常再说|看情况/.test(text),
    fix: '每步先写“异常分支怎么走”（换线/换口/降速/分段短接/换板），再写正常分支。',
    framework: '「正常/异常双出口」：每步必须有两条出口路径，且都能落到具体动作。',
  },
  {
    key: 'norecord',
    name: '不记录：改动和结果不落纸，重复试错',
    detect: (text) => /没记|不记得|忘了|重复/.test(text),
    fix: '用“时间—现象—改动—结果—是否可复现”五列记录，改一次记一行。',
    framework: '「改动日志」：复现条件、改动内容、结果、是否可复现，四要素一条不落。',
  },
];

function habitsOf(state) {
  const corpus = state.records.map((record) => record.note).join(' ');
  const hitKeys = new Set(HABIT_LIBRARY.filter((habit) => habit.detect(corpus)).map((habit) => habit.key));
  const hits = HABIT_LIBRARY.filter((habit) => hitKeys.has(habit.key));
  const fallback = HABIT_LIBRARY.filter((habit) => !hitKeys.has(habit.key));
  const chosen = [...hits, ...fallback].slice(0, 3);
  return chosen.map((habit) => habit);
}

function buildReport(context) {
  const { state, bank, stats, workspace } = context;
  const byId = new Map(bank.map((phenomenon) => [phenomenon.id, phenomenon]));
  const recordById = new Map(state.records.map((record) => [record.id, record]));
  const lines = [];
  const now = new Date();
  lines.push('# 排错方法论 · 复盘报告');
  lines.push('');
  lines.push(`- 生成时间：${now.toISOString()}`);
  lines.push(`- 工程目录：\`${workspace}\``);
  lines.push(`- 状态文件：\`${STATE_PATH}\``);
  lines.push(`- 覆盖：${stats.attempted}/${stats.total} 个现象（${stats.coverage}%），练习用时 ${formatSeconds(stats.totalSeconds)}`);
  lines.push('');

  lines.push('## 1. 排错能力总分（100 分制）');
  lines.push('');
  const lowCoverage = stats.coverage < 50;
  lines.push(
    lowCoverage
      ? `**${stats.score} / 100**（已记录自评分）— 覆盖不足（${stats.coverage}%），先跑完一轮再当结论。`
      : `**${stats.score} / 100** — ${gradeOf(stats.score)}`,
  );
  lines.push('');
  lines.push('> 说明：总分 = 已记录题目的平均分（每题按七维自评/教练评分取均值）；未考不扣分，但覆盖率单独统计。');
  lines.push('');

  lines.push('## 2. 分项评分');
  lines.push('');
  lines.push('| 分项 | 得分 | 样本数 |');
  lines.push('| --- | --- | --- |');
  for (const dimension of stats.dimensions) {
    lines.push(`| ${dimension.label} | ${dimension.samples > 0 ? dimension.value : '—'} | ${dimension.samples} |`);
  }
  lines.push('');
  lines.push(`| 现象类别 | 覆盖 | 通过 | 待加强 | 跳过 |`);
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
    lines.push('- 还没有带分数的记录；先把一题完整走完（顺序/判据/工具/分支/记录），再谈亮点。');
  }
  for (const { record, value } of best) {
    const phenomenon = byId.get(record.id);
    const dimensions = record.scores
      ? Object.entries(record.scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([key, score]) => `${DIMENSIONS.find((item) => item.key === key)?.label ?? key} ${score}`)
          .join('、')
      : '—';
    lines.push(`- **${record.id} ${phenomenon?.title ?? ''}**：${value} 分（强项：${dimensions}）${record.note ? `；${record.note}` : ''}`);
  }
  lines.push('');

  lines.push('## 4. 最危险的 3 个排错坏习惯');
  lines.push('');
  habitsOf(state).forEach((habit, index) => {
    lines.push(`### 坏习惯 ${index + 1}：${habit.name}`);
    lines.push('');
    lines.push(`- **纠正方法**：${habit.fix}`);
    lines.push(`- **标准排查框架**：${habit.framework}`);
    lines.push('');
  });

  lines.push('## 5. 现象覆盖矩阵');
  lines.push('');
  lines.push('| 现象 | 类别 | 是否练到 | 结果 | 得分 | 用时 | 薄弱点 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const phenomenon of bank) {
    const record = recordById.get(phenomenon.id);
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
      `| ${phenomenon.id} ${phenomenon.title} | ${phenomenon.categoryLabel} | ${record === undefined ? '否' : '是'} | ${
        record === undefined ? '—' : record.verdict
      } | ${record === undefined ? '—' : averageScore(record) ?? '—'} | ${record === undefined ? '—' : formatSeconds(record.seconds)} | ${wall} |`,
    );
  }
  lines.push('');

  lines.push('## 6. 下一轮建议练的 3 个现象');
  lines.push('');
  const practice = bank
    .map((phenomenon) => ({ phenomenon, record: recordById.get(phenomenon.id) }))
    .filter(({ record }) => record === undefined || record.verdict !== 'passed' || (averageScore(record) ?? 100) < 75)
    .sort((a, b) => {
      // 先补“最弱”的：待加强 → 跳过 → 未练 → 通过但分低
      const rank = (record) => (record === undefined ? 2 : record.verdict === 'weak' ? 0 : record.verdict === 'skipped' ? 1 : 3);
      return rank(a.record) - rank(b.record) || (averageScore(a.record) ?? 0) - (averageScore(b.record) ?? 0) || a.phenomenon.id.localeCompare(b.phenomenon.id);
    })
    .slice(0, 3);
  if (practice.length === 0) {
    lines.push('1. 覆盖完成，建议加练“只练系统/跨层 + 记录与复现”组合，把判据写得更可观测。');
  }
  practice.forEach(({ phenomenon }, index) => {
    lines.push(`${index + 1}. **${phenomenon.id} ${phenomenon.title}**：${phenomenon.symptom}`);
  });
  lines.push('');

  lines.push('## 7. 一句话总结');
  lines.push('');
  const summary = lowCoverage
    ? `目前只练到 ${stats.coverage}%，还看不出方法论成型；先把通信、电机、传感器各练 2 题，再回头看这张表。`
    : stats.score >= 85
      ? '你的排错已经形成“分层—判据—隔离—记录”的闭环，下一步是把判据量值化，做到别人照你的记录能复现。'
      : stats.score >= 70
        ? '顺序和分层基本对，但判据还偏“看一眼”，异常分支也常缺；下一轮每题强制写“正常/异常/下一分支”三行。'
        : '先戒掉“先换件”和“只描述现象不写判据”两个习惯，每步都问：看到什么算正常？';
  lines.push(summary);
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* RPC 方法                                                            */
/* ------------------------------------------------------------------ */

const RPC_METHOD_NAMES = ['state', 'bank', 'phenomenon', 'begin', 'record', 'skip', 'next', 'setMode', 'setWorkspace', 'reset', 'finish', 'report', 'copyPrompt'];

function stripPhenomenonAnswer(phenomenon) {
  return {
    id: phenomenon.id,
    category: phenomenon.category,
    categoryLabel: phenomenon.categoryLabel,
    title: phenomenon.title,
    symptom: phenomenon.symptom,
    background: phenomenon.background,
    questions: phenomenon.questions,
    layers: phenomenon.layers,
    criteria: phenomenon.criteria,
    hardware: phenomenon.hardware,
  };
}

function buildSubjects(configWorkspace) {
  const session = { workspace: configWorkspace ?? DEFAULT_WORKSPACE, config: {} };

  const methods = {
    async state() {
      const bank = loadBank();
      const state = loadState();
      const current = state.current === null ? undefined : bank.find((phenomenon) => phenomenon.id === state.current);
      return {
        state,
        stats: statsOf(state, bank),
        current: current === undefined ? null : stripPhenomenonAnswer(current),
        bankSummary: bank.map((phenomenon) => ({
          id: phenomenon.id,
          category: phenomenon.category,
          categoryLabel: phenomenon.categoryLabel,
          title: phenomenon.title,
          symptom: phenomenon.symptom,
          hardware: phenomenon.hardware,
        })),
        modes: Object.entries(MODES).map(([id, value]) => ({ id, label: value.label })),
        dimensions: DIMENSIONS,
        paths: { state: STATE_PATH, bank: path.join(DATA_DIR, 'phenomena.json'), skill: SKILL_PATH, workspace: session.workspace },
        now: nowIso(),
      };
    },
    async bank() {
      return { bank: loadBank(), categories: CATEGORIES };
    },
    async phenomenon(args) {
      const bank = loadBank();
      const id = String(args?.id ?? '').trim().toUpperCase();
      const phenomenon = bank.find((item) => item.id === id);
      if (phenomenon === undefined) throw new Error(`unknown phenomenon ${JSON.stringify(args?.id)}`);
      return { phenomenon };
    },
    async begin(args) {
      const bank = loadBank();
      let state = loadState();
      const mode = args?.mode ?? state.mode;
      if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}`);
      const requested = typeof args?.id === 'string' ? args.id.trim().toUpperCase() : undefined;
      const pool = modeBank(bank, mode);
      const id =
        requested !== undefined && pool.some((phenomenon) => phenomenon.id === requested)
          ? requested
          : nextPhenomenonId({ ...state, mode }, bank, state.current ?? undefined);
      if (id === undefined) throw new Error('no phenomenon available');
      state = {
        ...state,
        status: 'running',
        mode,
        current: id,
        startedAt: state.startedAt ?? nowIso(),
        timer: { id, startedAt: nowIso() },
        log: [...state.log, { at: nowIso(), kind: 'begin', id, mode }].slice(-200),
      };
      const phenomenon = bank.find((item) => item.id === id);
      return {
        state: saveState(state),
        stats: statsOf(state, bank),
        phenomenon: phenomenon === undefined ? null : stripPhenomenonAnswer(phenomenon),
      };
    },
    async record(args) {
      const bank = loadBank();
      const record = normalizeRecord(args);
      if (record === undefined) throw new Error('record requires { id: Pxx, verdict: passed|weak|skipped }');
      const state = applyRecord(loadState(), record);
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async skip(args) {
      const bank = loadBank();
      const state0 = loadState();
      const id = String(args?.id ?? state0.current ?? '').trim().toUpperCase();
      const record = normalizeRecord({ id, verdict: 'skipped', seconds: args?.seconds ?? 0, note: args?.note ?? '跳过' });
      if (record === undefined) throw new Error('skip requires a valid phenomenon id');
      const state = applyRecord(state0, record);
      return { state: saveState(state), stats: statsOf(state, bank) };
    },
    async next(args) {
      const bank = loadBank();
      let state = loadState();
      const after = typeof args?.after === 'string' ? args.after.trim().toUpperCase() : state.current ?? undefined;
      const id = nextPhenomenonId(state, bank, after);
      if (id === undefined) throw new Error('no next phenomenon');
      state = { ...state, status: state.status === 'idle' ? 'running' : state.status, current: id, timer: { id, startedAt: nowIso() } };
      const phenomenon = bank.find((item) => item.id === id);
      return {
        state: saveState(state),
        stats: statsOf(state, bank),
        phenomenon: phenomenon === undefined ? null : stripPhenomenonAnswer(phenomenon),
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
      const file = path.join(dir, `排错复盘-${stamp(new Date())}.md`);
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

function formatCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) return '（题库未提供判据清单，按“正常/异常分别看到什么”自己补）';
  return criteria
    .map((item) => {
      const head = [item.step, item.layer].filter((value) => typeof value === 'string' && value.length > 0).join(' ');
      const tool = item.tool ? `｜工具：${item.tool}` : '';
      return `- ${head ? `${head}：` : ''}${item.check} ｜正常：${item.normal} ｜异常：${item.abnormal}${tool}`;
    })
    .join('\n');
}

function buildToolDefinitions(api) {
  return [
    {
      name: 'tscoach_state',
      description: '读取排错训练当前状态：模式、当前现象、已练/未练现象数、七维分项得分与题库一览。开始或继续排错训练前先调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: TOOL_OUTPUT,
      async execute() {
        const value = await api.methods.state();
        const { state, stats, current } = value;
        const lines = [];
        lines.push(`状态：${state.status}｜模式：${state.mode}（${MODES[state.mode]?.label ?? state.mode}）｜当前现象：${state.current ?? '无'}`);
        lines.push(`覆盖：${stats.attempted}/${stats.total}（${stats.coverage}%）｜总分：${stats.score}｜用时：${formatSeconds(stats.totalSeconds)}`);
        lines.push(`已练：${state.records.map((record) => `${record.id}:${record.verdict}${averageScore(record) === undefined ? '' : `(${averageScore(record)})`}`).join(', ') || '无'}`);
        const recorded = new Set(state.records.map((record) => record.id));
        lines.push(`未练：${value.bankSummary.filter((item) => !recorded.has(item.id)).map((item) => item.id).join(', ') || '无'}`);
        lines.push(`七维均分：${stats.dimensions.map((dimension) => `${dimension.label}${dimension.samples > 0 ? ` ${dimension.value}` : ' —'}`).join('｜')}`);
        if (current !== null && current !== undefined) {
          lines.push(`当前题干：${current.id} ${current.title}——${current.symptom}`);
        }
        lines.push(`题库来源：data/phenomena.json（${stats.total} 条）；面板状态文件：${value.paths.state}`);
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'tscoach_begin',
      description: '开始/继续排错训练：设定模式（all/comms/motor/sensor/system）并选中当前故障现象（不给 id 时自动跳到下一个未练现象）。左侧栏「排错教练」面板会同步显示当前现象、判据清单与标准框架。',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['all', 'comms', 'motor', 'sensor', 'system'], description: '训练模式，默认沿用当前模式；只练通信=comms，只练电机=motor，只练传感器=sensor。' },
          id: { type: 'string', description: '指定从哪个现象开始，如 P01。' },
        },
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { state, stats, phenomenon } = await api.methods.begin(args ?? {});
        const lines = [`已选中：${state.current}（模式 ${state.mode}）；覆盖 ${stats.attempted}/${stats.total}。`];
        if (phenomenon !== null) {
          lines.push('');
          lines.push(`【现象：${phenomenon.id} ${phenomenon.title}】`);
          lines.push(`描述：${phenomenon.symptom}`);
          if (phenomenon.background) lines.push(`背景：${phenomenon.background}`);
          lines.push('');
          lines.push('请让学员按 1）排查顺序 2）每步判据 3）工具 4）正常/异常分支 作答，再点评追问。');
        }
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'tscoach_record',
      description:
        '把一道排错题的结论写进训练状态（左侧栏实时同步）：通过 passed / 待加强 weak / 跳过 skipped；可带实际用时秒数、一句点评 note，以及七维自评分 scores（layering 分层隔离 / order 顺序 / criteria 判据 / tools 工具 / branches 异常分支 / records 记录 / expression 表达，各 0-100）。复盘总分来自这些自评分。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '现象编号，如 P01。' },
          verdict: { type: 'string', enum: VERDICTS, description: '本题结论。' },
          seconds: { type: 'integer', description: '实际用时（秒）。' },
          note: { type: 'string', description: '一句点评：缺哪条判据、跳了哪步、违反哪条原则。' },
          scores: RECORD_SCORE_SCHEMA,
        },
        required: ['id', 'verdict'],
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { state, stats } = await api.methods.record(args ?? {});
        return {
          text: `已记录 ${String(args?.id ?? '').toUpperCase()}：${args?.verdict}；覆盖 ${stats.attempted}/${stats.total}，总分 ${stats.score}，当前现象 ${state.current ?? '无'}。`,
        };
      },
    },
    {
      name: 'tscoach_report',
      description: '生成排错方法论复盘（100 分制 + 七维分项 + 覆盖矩阵 + 最危险 3 个坏习惯 + 下一轮 3 个现象）。用户说“结束排错”时调用；不自动写文件，落盘用面板「结束并落盘复盘」。',
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
        'troubleshoot-teacher: rpc route',
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
          name: 'troubleshoot-coach',
          description:
            '排错方法论老师：一次给一个故障现象（P01–P16，来自双机 nRF24L01/USART、MPU6050、编码器、TB6612、FreeRTOS 小车项目），训练“排查顺序 + 每步判据 + 工具 + 正常/异常分支 + 记录”，逐层点评追问并生成 100 分制复盘。',
          whenToUse:
            '用户要求练习排错、调试方法论、“给现象我列排查顺序”、故障诊断训练、面试前练硬件/嵌入式排错，或说“开始排错/只练通信/只练电机/只练传感器/结束排错”时使用。',
          content: stripFrontmatter(content),
          invocation: { modelInvocable: true, userInvocable: true },
        }),
      );
      log('info', '已注册 skill：troubleshoot-coach');
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
      log('info', '已注册工具：tscoach_state / tscoach_begin / tscoach_record / tscoach_report');
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
      'troubleshoot-teacher: dispose',
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
  DEFAULT_BANK,
  normalizeBank,
  normalizePhenomenon,
  normalizeState,
  normalizeRecord,
  statsOf,
  nextPhenomenonId,
  buildReport,
  habitsOf,
  averageScore,
  stripFrontmatter,
  formatCriteria,
};
