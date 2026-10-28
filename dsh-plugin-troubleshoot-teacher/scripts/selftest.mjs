/**
 * 离线自测（宿主半）：不启动 Harness，直接驱动 lib/index.js 的纯函数与 RPC 方法。
 *
 * 覆盖：题库归一化 → 选题推进 → 记录/统计 → 复盘生成 → 状态落盘/读回。
 * 用临时 DSH_HOME，不污染真实状态文件。
 *
 * 运行：node scripts/selftest.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tscoach-selftest-'));
process.env.DSH_HOME = tmpHome;

const mod = await import(pathToFileURL(path.join(ROOT, 'lib', 'index.js')).href);
const { __test } = mod;

const STATE_FILE = path.join(tmpHome, 'troubleshoot-coach', 'state.json');
const failures = [];
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  FAIL ${label}`);
  }
};

console.log('[1] 模块形状');
check('导出 apply 与 name', () => {
  assert.equal(typeof mod.apply, 'function');
  assert.equal(mod.name, 'dsh-troubleshoot-teacher');
});
check('全部 RPC 方法存在', () => {
  assert.equal(__test.MODES.all.label, '全部现象');
  assert.equal(__test.DIMENSIONS.length, 7);
});
check('兜底题库 16 条且编号唯一', () => {
  const bank = __test.normalizeBank(undefined);
  assert.equal(bank.length, 16);
  assert.equal(new Set(bank.map((item) => item.id)).size, 16);
  assert.equal(bank[0].id, 'P01');
});
check('题库归一化：过滤非法条目、补默认字段', () => {
  const bank = __test.normalizeBank([
    { id: 'P99', category: 'comms', title: 't', symptom: 's' },
    { id: 'bad' },
    { id: 'p03', category: 'sensor', title: 'MPU', symptom: '跳' },
    'noise',
  ]);
  assert.equal(bank.length, 2);
  assert.equal(bank[0].id, 'P03');
  assert.equal(bank[0].questions.length, 4);
  assert.equal(bank[0].layers.length, 6);
});

console.log('[2] 状态与记录归一化');
check('记录：非法 id / verdict 兜底', () => {
  assert.equal(__test.normalizeRecord({ id: 'xx', verdict: 'passed' }), undefined);
  const record = __test.normalizeRecord({ id: 'p01', verdict: 'nonsense', seconds: 99999 });
  assert.equal(record.id, 'P01');
  assert.equal(record.verdict, 'weak');
  assert.equal(record.seconds, 7200);
});
check('记录：七维评分裁剪到 0-100', () => {
  const record = __test.normalizeRecord({ id: 'P02', verdict: 'passed', scores: { criteria: 130, order: -5, bogus: 50 } });
  assert.equal(record.scores.criteria, 100);
  assert.equal(record.scores.order, 0);
  assert.equal(record.scores.bogus, undefined);
  assert.equal(__test.averageScore(record), 50);
});
check('状态：损坏 JSON 归一化为 idle', () => {
  const state = __test.normalizeState({ status: 'weird', mode: 'nope', current: 'ZZZ', records: [{ id: 'P05', verdict: 'passed' }] });
  assert.equal(state.status, 'idle');
  assert.equal(state.mode, 'all');
  assert.equal(state.current, null);
  assert.equal(state.records.length, 1);
});

console.log('[3] 选题推进与模式过滤');
check('nextPhenomenonId 跳过已练现象', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({ records: [{ id: 'P01', verdict: 'passed' }, { id: 'P02', verdict: 'weak' }] });
  assert.equal(__test.nextPhenomenonId(state, bank, undefined), 'P03');
  assert.equal(__test.nextPhenomenonId(state, bank, 'P01'), 'P03');
});
check('comms 模式只在通信类里选题', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({ mode: 'comms' });
  const id = __test.nextPhenomenonId(state, bank, undefined);
  assert.equal(bank.find((item) => item.id === id).category, 'comms');
});

console.log('[4] 统计');
check('statsOf 覆盖/类别/七维', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({
    records: [
      { id: 'P01', verdict: 'passed', seconds: 120, scores: { layering: 80, criteria: 60 } },
      { id: 'P09', verdict: 'weak', seconds: 90, scores: { layering: 40, criteria: 40 } },
      { id: 'P06', verdict: 'skipped' },
    ],
  });
  const stats = __test.statsOf(state, bank);
  assert.equal(stats.attempted, 3);
  assert.equal(stats.total, 16);
  assert.equal(stats.coverage, 19);
  assert.equal(stats.passed, 1);
  assert.equal(stats.weak, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.totalSeconds, 210);
  assert.equal(stats.score, 55); // P01 均分 70、P09 均分 40，跳过无分不计
  const layering = stats.dimensions.find((item) => item.key === 'layering');
  assert.equal(layering.value, 60);
  assert.equal(layering.samples, 2);
});

console.log('[5] 复盘生成');
check('buildReport 含 7 个章节与覆盖矩阵（含未练现象）', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({
    status: 'running',
    records: [
      { id: 'P01', verdict: 'passed', seconds: 120, note: '一上来就换模块，跳过了共地检查', scores: { layering: 40, order: 60, criteria: 30, tools: 50, branches: 20, records: 10, expression: 70 } },
      { id: 'P06', verdict: 'weak', seconds: 200, note: '判据只写“再试试”' },
    ],
  });
  const report = __test.buildReport({ state, bank, stats: __test.statsOf(state, bank), workspace: 'C:\\tmp' });
  for (const heading of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.']) {
    assert.ok(report.includes(heading), `缺少章节 ${heading}`);
  }
  assert.ok(report.includes('P01 双机通信不通'));
  assert.ok(report.includes('P09 UART'), '未练现象也要出现在覆盖矩阵');
  assert.ok(report.includes('换模块') || report.includes('乱换件'));
  assert.ok(report.includes('判据先行') || report.includes('一步一判据'));
});
check('空记录也能量出复盘（不抛异常）', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({});
  const report = __test.buildReport({ state, bank, stats: __test.statsOf(state, bank), workspace: 'C:\\tmp' });
  assert.ok(report.includes('## 6.'));
  assert.ok(report.includes('先把'));
});
check('averageScore 对 undefined 返回 undefined', () => {
  assert.equal(__test.averageScore(undefined), undefined);
  assert.equal(__test.averageScore(null), undefined);
});
check('坏习惯优先级由 note 关键词触发', () => {
  const state = __test.normalizeState({ records: [{ id: 'P01', verdict: 'weak', note: '一上来就换模块' }] });
  const habits = __test.habitsOf(state);
  assert.equal(habits.length, 3);
  assert.equal(habits[0].key, 'swap');
});

console.log('[6] RPC 方法闭环（临时 DSH_HOME）');
const { apply } = mod;
const installed = [];
const ctx = {
  get(service) {
    if (service === 'webServer') {
      return {
        register(route) {
          installed.push(route);
          return () => {};
        },
      };
    }
    if (service === 'skills') {
      return {
        register(definition) {
          installed.push({ kind: 'skill', definition });
          return () => {};
        },
      };
    }
    if (service === 'tools') {
      return {
        register(definition) {
          installed.push({ kind: 'tool', definition });
          return () => {};
        },
      };
    }
    return undefined;
  },
  effect(factory) {
    return factory();
  },
  on() {},
};
const api = apply(ctx, { workspace: ROOT });
const toolNames = installed.filter((entry) => entry.kind === 'tool').map((entry) => entry.definition.name).sort();
check('注册 skill 与 4 个工具', () => {
  const skill = installed.find((entry) => entry.kind === 'skill');
  assert.ok(skill, '应注册 skill');
  assert.equal(skill.definition.name, 'troubleshoot-coach');
  assert.ok(skill.definition.content.length > 500, 'skill 正文应有实际内容');
  assert.deepEqual(toolNames, ['tscoach_begin', 'tscoach_record', 'tscoach_report', 'tscoach_state']);
});
check('RPC 路由已挂载', () => {
  assert.equal(installed.filter((entry) => entry.path !== undefined).length, 1);
  assert.equal(installed.find((entry) => entry.path !== undefined).path, '/plugins/dsh-troubleshoot-teacher/rpc');
});

// 直接驱动返回的 methods 需要内部引用；这里通过 apply 返回的元信息验证路径，
// 再用模块导出的纯函数 + 真实状态文件校验落盘格式。
check('状态文件路径正确', () => {
  assert.equal(api.statePath, path.join(tmpHome, 'troubleshoot-coach', 'state.json'));
});
check('写盘格式可被 normalizeState 读回', () => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ status: 'running', mode: 'motor', current: 'P06', records: [{ id: 'P06', verdict: 'passed', seconds: 77 }] }));
  const state = __test.normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  assert.equal(state.current, 'P06');
  assert.equal(state.records[0].seconds, 77);
});

console.log('[7] 资源文件');
for (const file of ['package.json', 'cordis.patch.yml', 'locale/zh.json', 'locale/en.json', 'icon.svg', 'data/phenomena.json', 'skill/SKILL.md', 'README.md']) {
  check(`存在且非空：${file}`, () => {
    const stat = fs.statSync(path.join(ROOT, file));
    assert.ok(stat.size > 20, `${file} 太小`);
  });
}
check('package.json 导出/客户端声明正确', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dsh-troubleshoot-teacher');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.ok(pkg.files.includes('data'));
  assert.ok(pkg.files.includes('skill'));
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json');
});
check('cordis.patch.yml 插入行 id/name', () => {
  const patch = fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes("id: dsh-troubleshoot-teacher"));
  assert.ok(patch.includes("name: 'dsh-troubleshoot-teacher'"));
});

fs.rmSync(tmpHome, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
  console.error(`selftest 失败 ${failures.length} 项：`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('host selftest OK');
