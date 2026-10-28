/**
 * dsh-hardware-interview-teacher — host half.
 *
 * 电气硬件面试老师（RoboMaster 电控硬件评审）· DSH 插件宿主半。
 *
 * 职责：
 *  1. JSON RPC（浏览器半的唯一数据通道）
 *     POST /plugins/dsh-hardware-interview-teacher/rpc
 *     body: { method, args } → { ok: true, value } | { ok: false, error }
 *     methods: state / question / begin / record / skip / next / setMode /
 *              setWorkspace / reset / finish / report / copyPrompt / scan
 *  2. 注册模型可见的 skill：hardware-interview-teacher（面试老师人设 + 流程）
 *  3. 注册 4 个同步工具 hwinterview_state / hwinterview_begin /
 *     hwinterview_record / hwinterview_report，让会话里的“老师”能把逐题结果
 *     实时写进左侧栏面板显示的状态文件
 *  4. 读取 data/ 下的硬件清单、题库、工程硬件配置；扫描工作区源码提取硬件
 *     配置证据（只认硬件：引脚/外设/电平/上拉/时钟/中断/PWM/总线）
 *  5. 状态落盘 <DSH_HOME>/hardware-interview/state.json（原子写），
 *     复盘落盘 <workspace>/面试记录/硬件面试复盘-<时间>.md
 *
 * 不考软件：本插件不解析协议、不判 PID、不跑算法，只做硬件层资料与状态。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 跨平台：默认工作目录从用户主目录推导（可用 DSH_COACH_WORKSPACE 覆盖）
const USER_HOME = process.env.DSH_COACH_WORKSPACE || process.env.USERPROFILE || process.env.HOME || '';

export const name = 'dsh-hardware-interview-teacher';

const PLUGIN_ID = 'dsh-hardware-interview-teacher';
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
const STATE_DIR = path.join(DSH_HOME, 'hardware-interview');
const STATE_PATH = path.join(STATE_DIR, 'state.json');

/** 默认被扫描/出题的工程目录；可用 cordis.patch.yml 的 config.workspace 覆盖。 */
const DEFAULT_WORKSPACE = USER_HOME + '\\Desktop\\Taurus car';

/** 硬件考核点清单（data/checklist.json 缺失时的兜底；与 data 文件同构）。 */
const DEFAULT_CHECKLIST = [
  { id: 'H01', group: 'power', groupLabel: '供电与地', source: 'PDF-主要物资', module: '12V 航模电池+降压模块', point: '12V→5V/3.3V 供电树、电流能力、共地、去耦、电池保护', required: '必考', seconds: 150, stage: '要求1 独立供电' },
  { id: 'H02', group: 'power', groupLabel: '供电与地', source: 'PDF-主要物资', module: 'STM32F103C8T6 最小系统板', point: '3.3V 供电、BOOT0/1、SWD 下载、复位、晶振、去耦电容', required: '必考', seconds: 150, stage: '要求1 独立供电' },
  { id: 'H03', group: 'sensor', groupLabel: '传感器/无线', source: 'PDF-主要物资', module: 'MPU6050 GY-521', point: '3.3V/5V 供电、I2C 上拉、AD0 地址、安装方向、零偏、振动/噪声', required: '必考', seconds: 150, stage: '第五阶段 任务1' },
  { id: 'H04', group: 'sensor', groupLabel: '传感器/无线', source: 'PDF-主要物资', module: 'HC-05 蓝牙', point: '供电电压、逻辑电平 3.3V 匹配、TX/RX 交叉、共地、配对/波特率、天线', required: '必考', seconds: 120, stage: '要求2 无线通信' },
  { id: 'H05', group: 'sensor', groupLabel: '传感器/无线', source: 'PDF-主要物资', module: 'NRF24L01', point: '3.3V 供电、去耦电容、SPI 线序、CE/CSN/IRQ、频道/地址、干扰', required: '必考', seconds: 150, stage: '要求2 无线通信' },
  { id: 'H06', group: 'motor', groupLabel: '电机驱动', source: 'PDF-主要物资', module: 'TB6612 电机驱动', point: 'VM/VCC/STBY、PWM 频率、AIN/BIN、共地、续流、电流/散热、电机并联电容', required: '必考', seconds: 150, stage: '第二阶段 任务1' },
  { id: 'H07', group: 'motor', groupLabel: '电机驱动', source: 'PDF-主要物资', module: '编码器电机', point: '编码器电源 5V/3.3V、AB 相上拉、滤波、线序、计数频率、机械安装', required: '必考', seconds: 150, stage: '第二阶段 任务2' },
  { id: 'H08', group: 'interface', groupLabel: '接口电平', source: 'PDF-主要物资', module: 'OLED（SSD1306，I2C/SPI）', point: '接口选择、3.3V 供电、上拉、地址、刷新与电源噪声', required: '必考', seconds: 120, stage: '要求6 OLED 显示' },
  { id: 'H09', group: 'interface', groupLabel: '接口电平', source: 'PDF-主要物资', module: '按键/LED', point: '上拉/下拉、消抖、限流电阻、灌/拉电流、LED 驱动方式', required: '必考', seconds: 120, stage: '第二阶段 任务3' },
  { id: 'H10', group: 'interface', groupLabel: '接口电平', source: 'PDF-得分点', module: 'UART 双机通信', point: 'TTL 电平 3.3V、TX-RX 交叉、共地、波特率、USB-TTL、线长/干扰', required: '必考', seconds: 120, stage: '第一阶段 任务1/2' },
  { id: 'H11', group: 'sensor', groupLabel: '传感器/无线', source: 'PDF-得分点', module: '蓝牙无线通信', point: '2.4G 天线、遮挡/距离、供电噪声、配对、频道、延迟', required: '必考', seconds: 120, stage: '第四阶段' },
  { id: 'H12', group: 'motor', groupLabel: '电机驱动', source: 'PDF-得分点', module: '电机 PWM 开环/正反转', point: 'PWM 频率、占空比、死区、驱动板供电、电机启动电流、电源跌落', required: '必考', seconds: 150, stage: '第二阶段 任务1' },
  { id: 'H13', group: 'motor', groupLabel: '电机驱动', source: 'PDF-得分点', module: '编码器反馈', point: 'AB 相接线、上拉、滤波、电源、共地、抗干扰', required: '必考', seconds: 150, stage: '第七阶段 任务1' },
  { id: 'H14', group: 'sensor', groupLabel: '传感器/无线', source: 'PDF-得分点', module: 'MPU6050 I2C 与姿态', point: 'I2C 速率、上拉、供电、地、安装、校准、yaw 零飘的硬件因素', required: '必考', seconds: 150, stage: '第五阶段' },
  { id: 'H15', group: 'interface', groupLabel: '接口电平', source: 'PDF-进阶', module: 'CAN 通信', point: '收发器供电 3.3V/5V、CAN_H/CAN_L、120Ω 终端电阻、共地、隔离', required: '选考', seconds: 150, stage: '进阶拓展' },
  { id: 'H16', group: 'interface', groupLabel: '接口电平', source: '代码-usart.c', module: 'USART1 PA9/PA10', point: '复用推挽/浮空输入、电平、接线、共地', required: '必考', seconds: 120, stage: '代码硬件配置' },
  { id: 'H17', group: 'interface', groupLabel: '接口电平', source: '代码-main.c', module: 'NRF/OLED/Motor/Encoder 初始化', point: '各模块供电、接口、上拉、PWM 引脚、编码器引脚', required: '必考', seconds: 150, stage: '代码硬件配置' },
  { id: 'H18', group: 'interface', groupLabel: '接口电平', source: '代码-sys.h', module: 'GPIO 位带/输出', point: '推挽/开漏、3.3V/5V 容忍、驱动电流', required: '选考', seconds: 90, stage: '代码硬件配置' },
  { id: 'H19', group: 'debug', groupLabel: '调试排错', source: '调试工具', module: '万用表/示波器/逻辑分析仪/ST-Link', point: '测电压/通断、看 PWM/串口/I2C、下载接口', required: '必考', seconds: 120, stage: '调试' },
  { id: 'H20', group: 'safety', groupLabel: '安全规范', source: '安全', module: '电池/电机/接线', point: '反接保护、保险丝、开关、短路、堵转、发热、绝缘', required: '必考', seconds: 150, stage: '要求1 独立供电' },
];

const MODES = {
  all: { label: '全部硬件点', groups: null },
  power: { label: '只看供电', groups: ['power'] },
  interface: { label: '只看接口', groups: ['interface'] },
  motor: { label: '只看电机', groups: ['motor'] },
};

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

/** 去掉 SKILL.md 开头的 YAML frontmatter：注册给模型的正文不应带元数据块。 */
function stripFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return text;
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match === null) return text;
  return text.slice(match[0].length).replace(/^\s+/, '');
}

/* ------------------------------------------------------------------ */
/* 数据装载                                                            */
/* ------------------------------------------------------------------ */

function normalizeChecklist(raw) {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter((item) => item !== null && typeof item === 'object' && /^H\d{2}$/.test(String(item.id)));
  if (valid.length === 0) return undefined;
  return valid
    .map((item) => {
      const group = typeof item.group === 'string' && item.group.length > 0 ? item.group : 'interface';
      const id = String(item.id);
      return {
        id,
        group,
        groupLabel: typeof item.groupLabel === 'string' && item.groupLabel.length > 0 ? item.groupLabel : group,
        source: typeof item.source === 'string' ? item.source : '',
        module: typeof item.module === 'string' ? item.module : '',
        point: typeof item.point === 'string' ? item.point : '',
        required: item.required === '选考' ? '选考' : '必考',
        seconds: Number.isFinite(Number(item.seconds)) ? clamp(Math.round(Number(item.seconds)), 30, 600) : 120,
        stage: typeof item.stage === 'string' ? item.stage : '',
        note: typeof item.note === 'string' ? item.note : '',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function loadChecklist() {
  return normalizeChecklist(readJson(path.join(DATA_DIR, 'checklist.json'))) ?? DEFAULT_CHECKLIST;
}

function loadQuestionBank() {
  const raw = readJson(path.join(DATA_DIR, 'question-bank.json'));
  const bank = new Map();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry === null || typeof entry !== 'object') continue;
      const id = String(entry.id ?? '');
      if (!/^H\d{2}$/.test(id)) continue;
      bank.set(id, {
        id,
        question: typeof entry.question === 'string' ? entry.question : '',
        followUps: Array.isArray(entry.followUps) ? entry.followUps.filter((v) => typeof v === 'string') : [],
        hint: typeof entry.hint === 'string' ? entry.hint : '',
        answer: Array.isArray(entry.answer) ? entry.answer.filter((v) => typeof v === 'string') : [],
        risk: typeof entry.risk === 'string' ? entry.risk : '',
        improve: typeof entry.improve === 'string' ? entry.improve : '',
        troubleshoot: typeof entry.troubleshoot === 'string' ? entry.troubleshoot : '',
        seconds: Number.isFinite(Number(entry.seconds)) ? clamp(Math.round(Number(entry.seconds)), 30, 600) : undefined,
      });
    }
  }
  return bank;
}

function loadCodeHardware() {
  return readJson(path.join(DATA_DIR, 'code-hardware.json'));
}

function synthesizeQuestion(checklistItem, bankEntry) {
  if (bankEntry !== undefined && bankEntry.question.length > 0) {
    return {
      id: checklistItem.id,
      question: bankEntry.question,
      followUps: bankEntry.followUps,
      hint: bankEntry.hint,
      answer: bankEntry.answer,
      risk: bankEntry.risk,
      improve: bankEntry.improve,
      troubleshoot: bankEntry.troubleshoot,
      seconds: bankEntry.seconds ?? checklistItem.seconds,
      synthesized: false,
    };
  }
  return {
    id: checklistItem.id,
    question: `围绕「${checklistItem.module}」：${checklistItem.point.split('、')[0]}，具体怎么接、怎么选、怎么测？`,
    followUps: [`第1层：具体接在哪个引脚/哪个电源轨上？上拉多大？电源从哪里取？`, `第2层：为什么这么选？出问题你用万用表/示波器怎么定位？如果重来改哪里？`],
    hint: `先讲供电与地，再讲接口电平与上拉，最后讲测量方法。`,
    answer: checklistItem.point.split('、').map((v) => `要点：${v.trim()}`),
    risk: '',
    improve: '',
    troubleshoot: '万用表测电压/通断 → 示波器看波形 → 逻辑分析仪看总线 → 再回到电源与地。',
    seconds: checklistItem.seconds,
    synthesized: true,
  };
}

/* ------------------------------------------------------------------ */
/* 面试状态                                                            */
/* ------------------------------------------------------------------ */

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
  const id = String(raw.id ?? '');
  if (!/^H\d{2}$/.test(id)) return undefined;
  const verdict = raw.verdict === 'passed' || raw.verdict === 'weak' || raw.verdict === 'skipped' ? raw.verdict : 'weak';
  return {
    id,
    verdict,
    seconds: Number.isFinite(Number(raw.seconds)) ? clamp(Math.round(Number(raw.seconds)), 0, 3600) : 0,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '',
    at: typeof raw.at === 'string' ? raw.at : nowIso(),
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (raw === null || typeof raw !== 'object') return base;
  const state = {
    ...base,
    version: 1,
    status: raw.status === 'running' || raw.status === 'finished' ? raw.status : 'idle',
    mode: Object.hasOwn(MODES, raw.mode) ? raw.mode : 'all',
    current: /^H\d{2}$/.test(String(raw.current ?? '')) ? String(raw.current) : null,
    timer: raw.timer !== null && typeof raw.timer === 'object' && /^H\d{2}$/.test(String(raw.timer.id ?? '')) && typeof raw.timer.startedAt === 'string' ? { id: String(raw.timer.id), startedAt: raw.timer.startedAt } : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    records: Array.isArray(raw.records) ? raw.records.map(normalizeRecord).filter((v) => v !== undefined) : [],
    log: Array.isArray(raw.log) ? raw.log.slice(-200) : [],
  };
  return state;
}

function loadState() {
  return normalizeState(readJson(STATE_PATH));
}

function saveState(state) {
  const next = { ...state, updatedAt: nowIso() };
  writeJsonAtomic(STATE_PATH, next);
  return next;
}

function statsOf(state, checklist) {
  const byId = new Map(checklist.map((item) => [item.id, item]));
  const recordById = new Map(state.records.map((record) => [record.id, record]));
  const groups = new Map();
  for (const item of checklist) {
    const group = groups.get(item.group) ?? { group: item.group, label: item.groupLabel, total: 0, required: 0, passed: 0, weak: 0, skipped: 0, unattempted: 0 };
    group.total += 1;
    if (item.required === '必考') group.required += 1;
    const record = recordById.get(item.id);
    if (record === undefined) group.unattempted += 1;
    else if (record.verdict === 'passed') group.passed += 1;
    else if (record.verdict === 'weak') group.weak += 1;
    else group.skipped += 1;
    groups.set(item.group, group);
  }
  const attempted = state.records.length;
  const passed = state.records.filter((record) => record.verdict === 'passed').length;
  const weak = state.records.filter((record) => record.verdict === 'weak').length;
  const skipped = state.records.filter((record) => record.verdict === 'skipped').length;
  const attemptedRequired = state.records.filter((record) => byId.get(record.id)?.required === '必考').length;
  const passedRequired = state.records.filter((record) => byId.get(record.id)?.required === '必考' && record.verdict === 'passed').length;
  const weakRequired = state.records.filter((record) => byId.get(record.id)?.required === '必考' && record.verdict === 'weak').length;
  const score = attemptedRequired > 0 ? Math.round(((passedRequired + 0.6 * weakRequired) / attemptedRequired) * 100) : 0;
  const coverage = checklist.length > 0 ? Math.round((attempted / checklist.length) * 100) : 0;
  const totalSeconds = state.records.reduce((sum, record) => sum + record.seconds, 0);
  return {
    total: checklist.length,
    attempted,
    passed,
    weak,
    skipped,
    unattempted: Math.max(0, checklist.length - attempted),
    coverage,
    score,
    totalSeconds,
    groups: [...groups.values()].sort((a, b) => checklist.findIndex((x) => x.group === a.group) - checklist.findIndex((x) => x.group === b.group)),
  };
}

function modePoints(checklist, mode) {
  const config = MODES[mode] ?? MODES.all;
  if (config.groups === null) return checklist;
  return checklist.filter((item) => config.groups.includes(item.group));
}

function nextPointId(state, checklist, afterId) {
  const points = modePoints(checklist, state.mode);
  if (points.length === 0) return undefined;
  const recorded = new Set(state.records.map((record) => record.id));
  const startIndex = afterId === undefined ? -1 : points.findIndex((item) => item.id === afterId);
  for (let step = 1; step <= points.length; step += 1) {
    const item = points[(startIndex + step + points.length) % points.length];
    if (!recorded.has(item.id)) return item.id;
  }
  return points[(startIndex + 1 + points.length) % points.length]?.id;
}

function applyRecord(state, record) {
  const records = state.records.filter((item) => item.id !== record.id);
  records.push(record);
  records.sort((a, b) => a.id.localeCompare(b.id));
  const logLine = { at: record.at, id: record.id, verdict: record.verdict, seconds: record.seconds };
  return {
    ...state,
    status: 'running',
    records,
    log: [...state.log, logLine].slice(-200),
    timer: state.timer?.id === record.id ? null : state.timer,
    current: state.current === record.id ? null : state.current,
  };
}

/* ------------------------------------------------------------------ */
/* 复盘报告（纯确定性生成，不判断“答得好不好”，只看覆盖与自评）          */
/* ------------------------------------------------------------------ */

function pad(value) {
  return String(value).padStart(2, '0');
}

function stamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function gradeOf(score) {
  if (score >= 85) return '优秀（可以顶住硬件评审追问）';
  if (score >= 70) return '良好（主线清楚，个别项会被追问）';
  if (score >= 55) return '及格（能说清接线，但选型与测量偏弱）';
  return '待加强（多数硬件点只能背结论）';
}

function formatSeconds(total) {
  const seconds = Math.max(0, Math.round(Number(total) || 0));
  return `${Math.floor(seconds / 60)}分${pad(seconds % 60)}秒`;
}

function buildReport(context) {
  const { state, checklist, stats, bank, workspace, codeHardware } = context;
  const recordById = new Map(state.records.map((record) => [record.id, record]));
  const lines = [];
  const now = new Date();
  lines.push('# 电控硬件面试 · 复盘报告');
  lines.push('');
  lines.push(`- 生成时间：${now.toISOString()}`);
  lines.push(`- 工程目录：\`${workspace}\``);
  lines.push(`- 状态文件：\`${STATE_PATH}\``);
  lines.push(`- 覆盖：${stats.attempted}/${stats.total} 个硬件考核点（${stats.coverage}%），已考用时 ${formatSeconds(stats.totalSeconds)}`);
  if (codeHardware?.projects?.length) {
    lines.push(`- 工程代码：${codeHardware.projects.map((project) => project.name).join('、')}`);
  }
  lines.push('');
  lines.push('## 1. 总体评分与档位');
  lines.push('');
  const lowCoverage = stats.coverage < 60;
  lines.push(`**${stats.score} / 100**（已考项得分）— ${lowCoverage ? '覆盖不足，暂不评级（先跑完一轮再评分）' : gradeOf(stats.score)}`);
  lines.push('');
  lines.push('> 说明：评分 = 必考考核点（通过×1 + 待加强×0.6 + 跳过×0）/ 已考必考点；未考不扣分，但覆盖率单独统计。覆盖率 < 60% 时不给档位，避免“只考 1 题就 100 分”的误读。');
  lines.push('');
  lines.push('## 2. 分项评分');
  lines.push('');
  lines.push('| 分项 | 覆盖 | 通过 | 待加强 | 跳过 | 未考 | 分项得分 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const group of stats.groups) {
    const attempted = group.total - group.unattempted;
    const groupScore = attempted > 0 ? Math.round(((group.passed + 0.6 * group.weak) / attempted) * 100) : 0;
    lines.push(`| ${group.label} | ${attempted}/${group.total} | ${group.passed} | ${group.weak} | ${group.skipped} | ${group.unattempted} | ${groupScore} |`);
  }
  lines.push('');
  const passedRecords = state.records.filter((record) => record.verdict === 'passed').sort((a, b) => a.seconds - b.seconds).slice(0, 3);
  lines.push('## 3. 表现最好的 3 点');
  lines.push('');
  if (passedRecords.length === 0) lines.push('- 还没有“通过”记录；先把必考项跑完一轮。');
  for (const record of passedRecords) {
    const item = checklist.find((entry) => entry.id === record.id);
    lines.push(`- **${record.id} ${item?.module ?? ''}**：${item?.point ?? ''}（用时 ${formatSeconds(record.seconds)}）`);
  }
  lines.push('');
  lines.push('## 4. 最容易被淘汰的 3 个硬件风险点');
  lines.push('');
  const risky = checklist
    .filter((item) => item.required === '必考')
    .map((item) => ({ item, record: recordById.get(item.id) }))
    .filter(({ record }) => record === undefined || record.verdict !== 'passed')
    .sort((a, b) => (a.record === undefined ? 0 : 1) - (b.record === undefined ? 0 : 1) || a.item.id.localeCompare(b.item.id))
    .slice(0, 3);
  if (risky.length === 0) {
    lines.push('- 必考项全部通过，没有明显风险点；下一轮直接上干扰/保护/测量追问。');
  }
  risky.forEach(({ item, record }, index) => {
    const entry = bank.get(item.id);
    lines.push(`### 风险 ${index + 1}：${item.id} ${item.module}`);
    lines.push('');
    lines.push(`- **状态**：${record === undefined ? '未考' : record.verdict === 'weak' ? '待加强' : '跳过'}`);
    lines.push(`- **考核点**：${item.point}`);
    if (entry?.risk) lines.push(`- **风险**：${entry.risk}`);
    lines.push(`- **改进建议**：${entry?.improve || `把 ${item.point} 拆成“接哪个引脚/取哪路电源/上拉多大/怎么测”四问，逐问写出答案。`}`);
    lines.push(`- **排查框架**：${entry?.troubleshoot || '先测电源与地（万用表通断、压降）→ 再看信号波形（示波器/逻辑分析仪）→ 最后替换法验证模块。'}`);
    lines.push('');
  });
  lines.push('## 5. 硬件考核点覆盖矩阵');
  lines.push('');
  lines.push('| 编号 | 来源 | 具体项 | 考核点 | 必考/选考 | 是否考到 | 结果 | 用时 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const item of checklist) {
    const record = recordById.get(item.id);
    lines.push(`| ${item.id} | ${item.source} | ${item.module} | ${item.point} | ${item.required} | ${record === undefined ? '否' : '是'} | ${record === undefined ? '—' : record.verdict} | ${record === undefined ? '—' : formatSeconds(record.seconds)} |`);
  }
  lines.push('');
  lines.push('## 6. 下一轮重点练的 3 道硬件题');
  lines.push('');
  const practice = checklist
    .map((item) => ({ item, record: recordById.get(item.id), entry: bank.get(item.id) }))
    .filter(({ record }) => record === undefined || record.verdict !== 'passed')
    .sort((a, b) => (a.record === undefined ? 0 : a.record.verdict === 'skipped' ? 1 : 2) - (b.record === undefined ? 0 : b.record.verdict === 'skipped' ? 1 : 2) || a.item.id.localeCompare(b.item.id))
    .slice(0, 3);
  if (practice.length === 0) {
    lines.push('1. 覆盖完成，建议加练“只看电机 + 干扰/保护”组合追问。');
  }
  practice.forEach(({ item, entry }, index) => {
    lines.push(`${index + 1}. ${item.id} ${item.module}：${entry?.question || item.point}`);
  });
  lines.push('');
  lines.push('## 7. 一句话总结');
  lines.push('');
  const summary =
    stats.score >= 85
      ? '硬件主线（供电—地—电平—驱动—测量）已经能自洽，剩下的是把每个“为什么”讲成可测量的证据。'
      : stats.score >= 70
        ? '接线和模块都认识了，但选型依据与排错证据链还不完整；下一轮把“怎么测”讲具体。'
        : '先把供电与地、接口电平两类必考项练到能直接说出引脚、电压和测量步骤，再谈电机与传感器。';
  lines.push(summary);
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 工作区扫描：只提硬件配置                                             */
/* ------------------------------------------------------------------ */

const SKIP_DIR = /(^|[\\/])(node_modules|\.git|\.dsh|\.verify|\.work|Libraries|STM32F10x_FWLib|CORE|FreeRTOS|OBJ|Listings|OUTPUT|build|__pycache__)([\\/]|$)/i;

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return undefined;
  }
}

function collectSourceFiles(workspace) {
  const files = [];
  const dirs = [];
  const walk = (dir, depth) => {
    if (depth > 5 || files.length >= 80) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= 80) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.test(full)) continue;
        dirs.push(full);
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (!lower.endsWith('.c') && !lower.endsWith('.h')) continue;
        const stat = safeStat(full);
        if (stat === undefined || stat.size > 512 * 1024) continue;
        files.push(full);
      }
    }
  };
  walk(workspace, 0);
  return files;
}

function detectMaterials(workspace) {
  const materials = [];
  let entries = [];
  try {
    entries = fs.readdirSync(workspace, { withFileTypes: true });
  } catch {
    return materials;
  }
  for (const entry of entries) {
    const full = path.join(workspace, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(full)) continue;
      const hasMain = ['USER\\main.c', 'User\\main.c', 'USER/main.c', 'User/main.c', 'user/main.c', 'APP\\main.c'].some((rel) => fs.existsSync(path.join(workspace, entry.name, rel)));
      if (hasMain) materials.push({ kind: '工程代码', name: entry.name, path: full });
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.pdf')) materials.push({ kind: '题目文档', name: entry.name, path: full });
      else if (lower.endsWith('.uvprojx')) materials.push({ kind: 'Keil 工程', name: entry.name, path: full });
    }
  }
  return materials;
}

function scanWorkspace(workspace) {
  const files = collectSourceFiles(workspace);
  const items = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.file}|${item.line}|${item.point}|${item.code}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (items.length < 90) items.push({ ...item, file: path.relative(workspace, item.file) });
  };
  const rules = [
    { point: 'H16', module: 'USART 引脚', pattern: /GPIO_Pin_(9|10)\b.*(USART|AF_PP|IN_FLOATING)|USART\d+\s*,\s*GPIO_Pin/i },
    { point: 'H10', module: 'USART 波特率', pattern: /USART_BaudRate\s*=\s*(\d{4,6})|baud\w*\s*[:=]\s*(\d{4,6})/i },
    { point: 'H10', module: 'USART 模式', pattern: /USART_Mode_(RX|TX|Rx|Tx)/ },
    { point: 'H03', module: 'I2C/MPU6050 引脚', pattern: /#define\s+\w*(SCL|SDA|I2C|MPU6050|AD0)\w*\s+.*GPIO/i },
    { point: 'H03', module: 'I2C/MPU6050 地址', pattern: /MPU6050_ADDRESS|0x68|0x69|AD0/i },
    { point: 'H08', module: 'OLED 引脚/地址', pattern: /#define\s+\w*(OLED|SCL|SDA)\w*\s+.*GPIO/i },
    { point: 'H08', module: 'OLED 接口', pattern: /OLED_.*(I2C|SPI|SSD1306)|0x3C|0x3D/i },
    { point: 'H05', module: 'nRF24L01 引脚', pattern: /#define\s+NRF\w*\s+.*GPIO|NRF24L01_(CE|CSN|SCK|MOSI|MISO|IRQ)/i },
    { point: 'H06', module: '电机 PWM/方向', pattern: /GPIO_Pin_\d+.*(AIN|BIN|PWMA|PWMB|STBY)|TIM_SetCompare\d|TIM_OCMode_PWM/i },
    { point: 'H12', module: 'PWM 定时器', pattern: /TIM_TimeBaseInit|TIM_Prescaler|TIM_Period|TIM_CtrlPWMOutputs/i },
    { point: 'H07', module: '编码器定时器', pattern: /TIM_EncoderInterfaceConfig|TIM_ICInit|Encoder_Init|encoder/i },
    { point: 'H09', module: '按键/LED', pattern: /#define\s+\w*(KEY|LED)\w*\s+.*GPIO|GPIO_Mode_IPU|GPIO_Mode_IPD/i },
    { point: 'H18', module: 'GPIO 模式/速度', pattern: /GPIO_Mode_(Out_PP|Out_OD|AF_PP|AF_OD|IN_FLOATING|IPU|IPD|AIN)|GPIO_Speed_\d+MHz/i },
    { point: 'H19', module: 'NVIC/调试', pattern: /NVIC_PriorityGroupConfig|NVIC_Init|SWJ_CFG|JTAG/i },
    { point: 'H02', module: '最小系统时钟', pattern: /SystemInit\(|RCC_APB2Periph_AFIO|RCC_APB1Periph_TIM|RCC_APB2Periph_GPIO/i },
  ];
  for (const file of files) {
    const text = readText(file);
    if (text === undefined) continue;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const code = lines[index].trim();
      if (code.length === 0 || code.startsWith('//') || code.startsWith('/*') || code.startsWith('*')) continue;
      if (code.length > 160) continue;
      for (const rule of rules) {
        if (!rule.pattern.test(code)) continue;
        const window = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).map((line) => line.trim()).filter(Boolean).join(' | ');
        push({ point: rule.point, module: rule.module, file, line: index + 1, code: window.slice(0, 240) });
        break;
      }
    }
  }
  const groups = new Map();
  for (const item of items) {
    const bucket = groups.get(item.module) ?? [];
    bucket.push(item);
    groups.set(item.module, bucket);
  }
  return {
    workspace,
    scannedAt: nowIso(),
    materials: detectMaterials(workspace),
    fileCount: files.length,
    itemCount: items.length,
    modules: [...groups.entries()]
      .map(([module, entries]) => ({ module, point: entries[0].point, items: entries.slice(0, 8) }))
      .sort((a, b) => a.point.localeCompare(b.point) || a.module.localeCompare(b.module)),
  };
}

/* ------------------------------------------------------------------ */
/* RPC 方法                                                            */
/* ------------------------------------------------------------------ */

const RPC_METHOD_NAMES = ['state', 'question', 'begin', 'record', 'skip', 'next', 'setMode', 'setWorkspace', 'reset', 'finish', 'report', 'copyPrompt', 'scan'];

function buildSubjects() {
  const session = { workspace: DEFAULT_WORKSPACE, config: {} };
  const reload = () => ({
    checklist: loadChecklist(),
    bank: loadQuestionBank(),
    codeHardware: loadCodeHardware(),
  });

  const methods = {
    async state() {
      const state = loadState();
      const { checklist } = reload();
      const bank = loadQuestionBank();
      return {
        state,
        checklist,
        stats: statsOf(state, checklist),
        modes: Object.entries(MODES).map(([id, value]) => ({ id, label: value.label })),
        bank: [...bank.keys()],
        paths: { state: STATE_PATH, workspace: session.workspace, skill: SKILL_PATH, plugin: PLUGIN_ROOT },
        now: nowIso(),
      };
    },
    async question(args) {
      const { checklist, bank } = reload();
      const id = String(args?.id ?? '');
      const item = checklist.find((entry) => entry.id === id);
      if (item === undefined) throw new Error(`unknown hardware point ${JSON.stringify(args?.id)}`);
      return synthesizeQuestion(item, bank.get(id));
    },
    async begin(args) {
      const { checklist } = reload();
      let state = loadState();
      const mode = args?.mode ?? state.mode;
      if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}`);
      const requested = typeof args?.id === 'string' ? args.id : undefined;
      const id = requested !== undefined && checklist.some((item) => item.id === requested) ? requested : nextPointId(state, checklist, state.current ?? undefined);
      if (id === undefined) throw new Error('no hardware point available');
      state = {
        ...state,
        status: 'running',
        mode,
        current: id,
        startedAt: state.startedAt ?? nowIso(),
        timer: { id, startedAt: nowIso() },
        log: [...state.log, { at: nowIso(), kind: 'begin', id, mode }].slice(-200),
      };
      return { state: saveState(state), stats: statsOf(state, checklist) };
    },
    async record(args) {
      const { checklist } = reload();
      const record = normalizeRecord(args);
      if (record === undefined) throw new Error('record requires { id: Hxx, verdict: passed|weak|skipped }');
      let state = loadState();
      state = applyRecord(state, record);
      return { state: saveState(state), stats: statsOf(state, checklist) };
    },
    async skip(args) {
      const { checklist } = reload();
      const id = String(args?.id ?? loadState().current ?? '');
      const record = normalizeRecord({ id, verdict: 'skipped', seconds: args?.seconds ?? 0, note: args?.note ?? '跳过' });
      if (record === undefined) throw new Error('skip requires a valid hardware point id');
      let state = applyRecord(loadState(), record);
      return { state: saveState(state), stats: statsOf(state, checklist) };
    },
    async next(args) {
      const { checklist } = reload();
      let state = loadState();
      const after = typeof args?.after === 'string' ? args.after : state.current ?? undefined;
      const id = nextPointId(state, checklist, after);
      if (id === undefined) throw new Error('no next hardware point');
      state = { ...state, status: state.status === 'idle' ? 'running' : state.status, current: id, timer: { id, startedAt: nowIso() } };
      return { state: saveState(state), stats: statsOf(state, checklist) };
    },
    async setMode(args) {
      const { checklist } = reload();
      const mode = String(args?.mode ?? '');
      if (!Object.hasOwn(MODES, mode)) throw new Error(`unknown mode ${JSON.stringify(args?.mode)}`);
      const state = { ...loadState(), mode };
      return { state: saveState(state), stats: statsOf(state, checklist) };
    },
    async setWorkspace(args) {
      const next = String(args?.workspace ?? '').trim();
      if (next.length === 0) throw new Error('workspace path is empty');
      if (!fs.existsSync(next)) throw new Error(`workspace does not exist: ${next}`);
      session.workspace = path.resolve(next);
      return { workspace: session.workspace };
    },
    async reset() {
      const { checklist } = reload();
      const state = saveState(defaultState());
      return { state, stats: statsOf(state, checklist) };
    },
    async report() {
      const { checklist, bank, codeHardware } = reload();
      const state = loadState();
      const stats = statsOf(state, checklist);
      return { report: buildReport({ state, checklist, stats, bank, workspace: session.workspace, codeHardware }), stats, state };
    },
    async finish() {
      const { checklist, bank, codeHardware } = reload();
      const state0 = loadState();
      const stats = statsOf(state0, checklist);
      const report = buildReport({ state: state0, checklist, stats, bank, workspace: session.workspace, codeHardware });
      const dir = path.join(session.workspace, '面试记录');
      ensureDir(dir);
      const file = path.join(dir, `硬件面试复盘-${stamp(new Date())}.md`);
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
    async scan() {
      return { ...scanWorkspace(session.workspace), codeHardware: loadCodeHardware() };
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

function buildToolDefinitions(api) {
  return [
    {
      name: 'hwinterview_state',
      description: '读取电控硬件面试当前状态：模式、当前考核点、已考/未考点数、各分项统计与提示。开始或继续硬件面试前先调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: TOOL_OUTPUT,
      async execute() {
        const { state, checklist, stats } = await api.methods.state();
        const lines = [];
        lines.push(`状态：${state.status}｜模式：${state.mode}｜当前：${state.current ?? '无'}`);
        lines.push(`覆盖：${stats.attempted}/${stats.total}（${stats.coverage}%）｜分项得分：${stats.score}`);
        lines.push(`已考：${state.records.map((record) => `${record.id}:${record.verdict}`).join(', ') || '无'}`);
        lines.push(`未考：${checklist.filter((item) => !state.records.some((record) => record.id === item.id)).map((item) => item.id).join(', ') || '无'}`);
        lines.push(`考核点清单：${checklist.map((item) => `${item.id} ${item.module}（${item.required}）`).join('；')}`);
        return { text: lines.join('\n') };
      },
    },
    {
      name: 'hwinterview_begin',
      description: '开始/继续硬件面试：设定模式（all/power/interface/motor）并选中当前硬件考核点（不给 id 时自动跳到下一个未考点）。左侧栏“硬件面试台”会同步显示。',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['all', 'power', 'interface', 'motor'], description: '面试模式，默认沿用当前模式。' },
          id: { type: 'string', description: '指定从哪个考核点开始，如 H01。' },
        },
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { state, stats } = await api.methods.begin(args ?? {});
        return { text: `已开始：${state.current}（模式 ${state.mode}）；覆盖 ${stats.attempted}/${stats.total}。` };
      },
    },
    {
      name: 'hwinterview_record',
      description: '把一道硬件题的结果写进面试状态（左侧栏实时同步）：通过 passed / 待加强 weak / 跳过 skipped，可带实际用时秒数和一句备注。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '硬件考核点编号，如 H06。' },
          verdict: { type: 'string', enum: ['passed', 'weak', 'skipped'], description: '本题结论。' },
          seconds: { type: 'integer', description: '实际用时（秒）。' },
          note: { type: 'string', description: '一句点评或追问记录。' },
        },
        required: ['id', 'verdict'],
        additionalProperties: false,
      },
      output: TOOL_OUTPUT,
      async execute(args) {
        const { state, stats } = await api.methods.record(args ?? {});
        return { text: `已记录 ${args?.id}：${args?.verdict}；覆盖 ${stats.attempted}/${stats.total}，当前题 ${state.current ?? '无'}。` };
      },
    },
    {
      name: 'hwinterview_report',
      description: '生成电控硬件面试复盘（100 分制 + 分项评分 + 覆盖矩阵 + 风险点 + 下一轮重点题）。结束面试时调用；不会自动写文件，写文件用面板「结束面试并落盘」。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: TOOL_OUTPUT,
      async execute() {
        const { report, stats } = await api.methods.report();
        return { text: `覆盖 ${stats.attempted}/${stats.total}，评分 ${stats.score}\n\n${report}` };
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

export function apply(ctx, config = {}) {
  const api = buildSubjects();
  if (typeof config?.workspace === 'string' && config.workspace.trim().length > 0) {
    api.session.workspace = path.resolve(config.workspace.trim());
  }
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
        'hardware-interview: rpc route',
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
          name: 'hardware-interview-teacher',
          description: '电控硬件面试老师（RoboMaster 十年硬件评审）：只考供电/地/电平/上拉/驱动/保护/抗干扰/接插件/调试测量，逐点覆盖 H01–H20；配合左侧栏「硬件面试台」与 hwinterview_* 工具记录进度。',
          whenToUse: '用户要求进行电控/嵌入式硬件面试、硬件评审、按硬件考核点逐题考察，或要复盘硬件面试时使用。',
          content: stripFrontmatter(content),
          invocation: { modelInvocable: true, userInvocable: true },
        }),
      );
      log('info', '已注册 skill：hardware-interview-teacher');
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
      log('info', '已注册工具：hwinterview_state / hwinterview_begin / hwinterview_record / hwinterview_report');
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
      'hardware-interview: dispose',
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
  DEFAULT_CHECKLIST,
  normalizeChecklist,
  normalizeState,
  normalizeRecord,
  statsOf,
  nextPointId,
  buildReport,
  scanWorkspace,
  synthesizeQuestion,
  MODES,
};
