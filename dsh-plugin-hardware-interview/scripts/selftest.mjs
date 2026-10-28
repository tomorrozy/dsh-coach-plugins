/**
 * 离线自测：不启动 DSH，用假的 cordis ctx / webServer 驱动宿主半。
 * 覆盖：数据装载、状态机、扫描器、复盘生成、RPC 路由、skill/tools 注册调用。
 *
 * 运行：node scripts/selftest.mjs
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-hiw-'));
process.env.DSH_HOME = HOME;

const mod = await import('../lib/index.js');
const { __test } = mod;

/* ---------------------------------------------------------------- */
/* 1. 纯函数                                                         */
/* ---------------------------------------------------------------- */

const checklist = __test.DEFAULT_CHECKLIST;
assert.equal(checklist.length, 20, '默认清单应为 20 项');
assert.equal(new Set(checklist.map((item) => item.id)).size, 20, 'id 不应重复');
assert.deepEqual(checklist.map((item) => item.id), Array.from({ length: 20 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`), 'id 必须是 H01..H20');

const state = __test.normalizeState({
  status: 'running',
  mode: 'all',
  current: 'H03',
  records: [
    { id: 'H01', verdict: 'passed', seconds: 95, note: 'ok' },
    { id: 'H02', verdict: 'weak', seconds: 120 },
    { id: 'H03', verdict: 'skipped' },
    { id: 'XX', verdict: 'passed' },
  ],
});
assert.equal(state.records.length, 3, '非法 id 记录应被丢弃');
const stats = __test.statsOf(state, checklist);
assert.equal(stats.total, 20);
assert.equal(stats.attempted, 3);
assert.equal(stats.passed, 1);
assert.equal(stats.weak, 1);
assert.equal(stats.skipped, 1);
assert.equal(stats.coverage, 15);
assert.equal(stats.score, Math.round(((1 + 0.6) / 3) * 100), '必考得分 = 通过 + 0.6×待加强');
assert.ok(stats.groups.length >= 5, '分项统计应覆盖多个分组');

assert.equal(__test.nextPointId(state, checklist), 'H04', '未考的下一个点');
assert.equal(__test.nextPointId({ ...state, records: [] }, checklist), 'H01');
assert.equal(__test.nextPointId({ ...state, mode: 'power', records: [] }, checklist), 'H01');
assert.ok(__test.nextPointId({ ...state, mode: 'motor', records: [] }, checklist).startsWith('H06'), '只看电机模式应跳到电机组');

/* ---------------------------------------------------------------- */
/* 2. 状态机 + 复盘                                                   */
/* ---------------------------------------------------------------- */

const mkReportState = () => ({
  version: 1,
  status: 'running',
  mode: 'all',
  current: null,
  timer: null,
  startedAt: new Date().toISOString(),
  updatedAt: null,
  records: [
    { id: 'H01', verdict: 'passed', seconds: 88, note: '', at: new Date().toISOString() },
    { id: 'H06', verdict: 'weak', seconds: 140, note: '续流没讲', at: new Date().toISOString() },
  ],
  log: [],
});

const workspace = process.env.DSH_TEST_WORKSPACE ?? (os.homedir() + '\\Desktop\\Taurus car');
const report = __test.buildReport({
  state: mkReportState(),
  checklist,
  stats: __test.statsOf(mkReportState(), checklist),
  bank: new Map(),
  workspace,
  codeHardware: undefined,
});
for (const needle of ['# 电控硬件面试 · 复盘报告', '## 1. 总体评分与档位', '## 5. 硬件考核点覆盖矩阵', '## 7. 一句话总结']) {
  assert.ok(report.includes(needle), `复盘缺少章节 ${needle}`);
}
assert.ok(report.includes('H06'), '复盘矩阵应包含已考点');

/* ---------------------------------------------------------------- */
/* 3. 扫描器（只读；工程不存在时返回空结果）                            */
/* ---------------------------------------------------------------- */

const scan = __test.scanWorkspace(workspace);
assert.equal(typeof scan.fileCount, 'number');
assert.ok(Array.isArray(scan.materials));
assert.ok(Array.isArray(scan.modules));
if (fs.existsSync(workspace)) {
  assert.ok(scan.materials.some((material) => material.kind === '题目文档'), '应识别到 PDF 题目文档');
  assert.ok(scan.itemCount > 0, '真实工程目录应扫描出硬件配置证据');
  for (const item of scan.modules.flatMap((module) => module.items)) {
    assert.match(item.point, /^H\d{2}$/, '扫描结果应带 H 编号');
    assert.ok(item.file.length > 0 && item.line > 0);
  }
}

/* ---------------------------------------------------------------- */
/* 4. apply()：假 ctx + RPC 往返                                      */
/* ---------------------------------------------------------------- */

const routes = [];
const fakeCtx = {
  get(key) {
    if (key === 'webServer') {
      return {
        register(config) {
          routes.push(config);
          return () => {};
        },
      };
    }
    if (key === 'skills') {
      return {
        register(skill) {
          fakeCtx.__skill = skill;
          return () => {};
        },
      };
    }
    if (key === 'tools') {
      return {
        register(tool) {
          (fakeCtx.__tools ??= []).push(tool);
          return () => {};
        },
      };
    }
    return undefined;
  },
  on() {},
  effect(factory) {
    const dispose = factory();
    return typeof dispose === 'function' ? dispose : () => {};
  },
};

const applied = mod.apply(fakeCtx, { workspace });
assert.equal(applied.rpcPath, '/plugins/dsh-hardware-interview-teacher/rpc');
assert.equal(routes.length, 1, '应挂载一条 RPC 路由');
assert.ok(fakeCtx.__skill?.content.includes('电控硬件面试'), '应注册面试老师 skill 且内容来自 SKILL.md');
assert.equal(fakeCtx.__tools?.length, 4, '应注册 4 个同步工具');
const route = routes[0];

async function rpc(method, args) {
  const body = JSON.stringify({ method, args });
  const req = Readable.from([Buffer.from(body)]);
  req.method = 'POST';
  const headers = {};
  const res = {
    statusCode: 0,
    setHeader(key, value) {
      headers[key] = value;
    },
    end(text) {
      res.body = text;
    },
  };
  await route.handler(req, res);
  return { status: res.statusCode, payload: JSON.parse(res.body ?? '{}') };
}

const stateRes = await rpc('state');
assert.equal(stateRes.payload.ok, true);
assert.equal(stateRes.payload.value.checklist.length, 20);
assert.equal(stateRes.payload.value.stats.total, 20);

const beginRes = await rpc('begin', { mode: 'all', id: 'H06' });
assert.equal(beginRes.payload.ok, true);
assert.equal(beginRes.payload.value.state.current, 'H06');
assert.ok(fs.existsSync(path.join(HOME, 'hardware-interview', 'state.json')), '状态应落盘');

const recordRes = await rpc('record', { id: 'H06', verdict: 'passed', seconds: 100, note: 'selftest' });
assert.equal(recordRes.payload.ok, true);
assert.equal(recordRes.payload.value.stats.passed, 1);

const questionRes = await rpc('question', { id: 'H06' });
assert.equal(questionRes.payload.ok, true);
assert.ok(questionRes.payload.value.question.length > 5);

const finishRes = await rpc('finish');
assert.equal(finishRes.payload.ok, true);
assert.ok(fs.existsSync(finishRes.payload.value.reportPath), '复盘文件应写入面试记录/');
const saved = fs.readFileSync(finishRes.payload.value.reportPath, 'utf8');
assert.ok(saved.includes('H06'));

const scanRes = await rpc('scan');
assert.equal(scanRes.payload.ok, true);
assert.ok(scanRes.payload.value.itemCount >= 0);

const badRes = await rpc('nope');
assert.equal(badRes.payload.ok, false);

const promptRes = await rpc('copyPrompt');
assert.equal(promptRes.payload.ok, true);
assert.ok(promptRes.payload.value.bytes > 500, '面试老师 skill 正文应足够长');

/* ---------------------------------------------------------------- */
/* 5. 工具 execute 冒烟                                              */
/* ---------------------------------------------------------------- */

for (const tool of fakeCtx.__tools) {
  const value = await tool.execute({ id: 'H01', verdict: 'passed', seconds: 60 }, { signal: undefined });
  assert.equal(typeof value.text, 'string');
  assert.ok(value.text.length > 0, `工具 ${tool.name} 应返回非空文本`);
  assert.ok(Array.isArray(tool.output.render({}, value)), 'render 应返回 content blocks');
}

console.log('selftest OK');
console.log(`state: ${applied.statePath}`);
console.log(`scan: ${scan.fileCount} files / ${scan.itemCount} items / ${scan.modules.length} modules`);
console.log(`skill bytes: ${Buffer.byteLength(fakeCtx.__skill.content, 'utf8')}`);
console.log(`tools: ${fakeCtx.__tools.map((tool) => tool.name).join(', ')}`);
fs.rmSync(HOME, { recursive: true, force: true });
