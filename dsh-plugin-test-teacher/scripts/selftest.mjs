/**
 * 离线自测（宿主半）：不启动 Harness，直接驱动 lib/index.js 的纯函数、
 * 注册的工具与 RPC 路由（用假的 req/res）。
 *
 * 覆盖：题库归一化 → 选题推进 → 记录/统计 → 复盘生成 → 工具输出 → RPC 闭环。
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
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'testcoach-selftest-'));
process.env.DSH_HOME = tmpHome;

const mod = await import(pathToFileURL(path.join(ROOT, 'lib', 'index.js')).href);
const { __test } = mod;

const STATE_FILE = path.join(tmpHome, 'test-teacher', 'state.json');
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
const checkAsync = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  FAIL ${label}`);
  }
};

console.log('[1] 模块形状');
check('导出 apply 与 name', () => {
  assert.equal(typeof mod.apply, 'function');
  assert.equal(mod.name, 'dsh-test-teacher');
});
check('模式与七维', () => {
  assert.deepEqual(Object.keys(__test.MODES), ['all', 'comms', 'control', 'record', 'display']);
  assert.equal(__test.DIMENSIONS.length, 7);
  assert.deepEqual(
    __test.DIMENSIONS.map((item) => item.key),
    ['quant', 'repro', 'boundary', 'criteria', 'tools', 'regression', 'expression'],
  );
});
check('兜底题库 12 条且编号唯一', () => {
  const bank = __test.normalizeBank(undefined);
  assert.equal(bank.length, 12);
  assert.equal(new Set(bank.map((item) => item.id)).size, 12);
  assert.equal(bank[0].id, 'T01');
  assert.equal(bank[11].id, 'T12');
});
check('题库分组符合用户指定（通信/控制/记录/显示）', () => {
  const bank = __test.normalizeBank(undefined);
  const ids = (category) => bank.filter((item) => item.category === category).map((item) => item.id);
  assert.deepEqual(ids('comms'), ['T01', 'T04', 'T06', 'T07']);
  assert.deepEqual(ids('control'), ['T02', 'T03', 'T05', 'T09']);
  assert.deepEqual(ids('record'), ['T10', 'T11', 'T12']);
  assert.deepEqual(ids('display'), ['T08']);
});

console.log('[2] 题库数据（真实工程数据文件）');
check('真实题库 12 条、六问、指标/条件/判据齐全', () => {
  const bank = __test.normalizeBank(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'test-objects.json'), 'utf8')));
  assert.equal(bank.length, 12);
  for (const object of bank) {
    assert.equal(object.questions.length, 5, `${object.id} 六问`);
    assert.ok(object.metrics.length >= 5, `${object.id} 指标 >= 5`);
    assert.ok(object.conditions.length >= 5, `${object.id} 条件 >= 5`);
    assert.ok(object.criteria.length >= 6, `${object.id} 判据 >= 6`);
    assert.ok(object.tools.length >= 3, `${object.id} 工具 >= 3`);
    assert.ok(object.record.length >= 4, `${object.id} 记录字段 >= 4`);
    assert.ok(object.regression.length >= 3, `${object.id} 回归 >= 3`);
    assert.ok(object.project.length > 80, `${object.id} 工程证据`);
    for (const criterion of object.criteria) {
      assert.ok(criterion.normal.length > 0 && criterion.abnormal.length > 0, `${object.id} 判据必须有正常与异常`);
    }
    for (const metric of object.metrics) {
      assert.ok(metric.normal.length > 0, `${object.id}/${metric.name} 正常范围`);
    }
  }
});
check('题库归一化：过滤非法条目、补默认字段', () => {
  const bank = __test.normalizeBank([
    { id: 'T99', category: 'comms', title: 't', target: 'x' },
    { id: 'bad' },
    { id: 't03', category: 'sensor', title: 'MPU', target: 'y' },
    'noise',
  ]);
  assert.equal(bank.length, 2);
  assert.equal(bank[0].id, 'T03');
  assert.equal(bank[0].category, 'record'); // 未知分组回落到 record
  assert.equal(bank[0].questions.length, 5);
});
check('指标/判据归一化：非法字段被丢弃', () => {
  assert.equal(__test.normalizeMetric({ unit: '%' }), undefined);
  assert.equal(__test.normalizeCriterion({ step: 'x' }), undefined);
  const metric = __test.normalizeMetric({ name: '  超调量 ', unit: '%', normal: '≤10', abnormal: '>20' });
  assert.equal(metric.name, '超调量');
});

console.log('[3] 状态与记录归一化');
check('记录：非法 id / verdict 兜底、秒数裁剪', () => {
  assert.equal(__test.normalizeRecord({ id: 'xx', verdict: 'passed' }), undefined);
  const record = __test.normalizeRecord({ id: 't01', verdict: 'nonsense', seconds: 99999 });
  assert.equal(record.id, 'T01');
  assert.equal(record.verdict, 'weak');
  assert.equal(record.seconds, 7200);
});
check('记录：七维评分裁剪到 0-100', () => {
  const record = __test.normalizeRecord({ id: 'T02', verdict: 'passed', scores: { quant: 130, repro: -5, bogus: 50 } });
  assert.equal(record.scores.quant, 100);
  assert.equal(record.scores.repro, 0);
  assert.equal(record.scores.bogus, undefined);
  assert.equal(__test.averageScore(record), 50);
});
check('状态：损坏 JSON 归一化为 idle', () => {
  const state = __test.normalizeState({ status: 'weird', mode: 'nope', current: 'ZZZ', records: [{ id: 'T05', verdict: 'passed' }] });
  assert.equal(state.status, 'idle');
  assert.equal(state.mode, 'all');
  assert.equal(state.current, null);
  assert.equal(state.records.length, 1);
});

console.log('[4] 选题推进与模式过滤');
check('nextTestObjectId 跳过已练对象', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({ records: [{ id: 'T01', verdict: 'passed' }, { id: 'T02', verdict: 'weak' }] });
  assert.equal(__test.nextTestObjectId(state, bank, undefined), 'T03');
  assert.equal(__test.nextTestObjectId(state, bank, 'T01'), 'T03');
});
check('只练通信 / 只练控制 只在对应分组里选题', () => {
  const bank = __test.normalizeBank(undefined);
  const comms = __test.nextTestObjectId(__test.normalizeState({ mode: 'comms' }), bank, undefined);
  assert.equal(bank.find((item) => item.id === comms).category, 'comms');
  const control = __test.nextTestObjectId(__test.normalizeState({ mode: 'control' }), bank, undefined);
  assert.equal(bank.find((item) => item.id === control).category, 'control');
});
check('题号按 begin 事件顺序编号', () => {
  const state = __test.normalizeState({
    log: [
      { at: 'a', kind: 'begin', id: 'T01' },
      { at: 'b', kind: 'record', id: 'T01' },
      { at: 'c', kind: 'begin', id: 'T04' },
      { at: 'd', kind: 'begin', id: 'T01' },
    ],
  });
  const map = __test.questionIndexMap(state);
  assert.equal(map.get('T01'), 1);
  assert.equal(map.get('T04'), 2);
});

console.log('[5] 统计');
check('statsOf 覆盖/分组/七维', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({
    records: [
      { id: 'T01', verdict: 'passed', seconds: 120, scores: { quant: 80, repro: 60 } },
      { id: 'T06', verdict: 'weak', seconds: 90, scores: { quant: 40, repro: 40 } },
      { id: 'T02', verdict: 'skipped' },
    ],
  });
  const stats = __test.statsOf(state, bank);
  assert.equal(stats.attempted, 3);
  assert.equal(stats.total, 12);
  assert.equal(stats.coverage, 25);
  assert.equal(stats.passed, 1);
  assert.equal(stats.weak, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.totalSeconds, 210);
  assert.equal(stats.score, 55); // T01 均分 70、T06 均分 40，跳过无分不计
  assert.equal(stats.dimensions.find((item) => item.key === 'quant').value, 60);
  const comms = stats.byCategory.find((item) => item.key === 'comms');
  assert.equal(comms.total, 4);
  assert.equal(comms.done, 2);
});

console.log('[6] 复盘生成');
check('buildReport 含 7 个章节、覆盖矩阵与题号', () => {
  const bank = __test.normalizeBank(undefined);
  const state = __test.normalizeState({
    status: 'running',
    log: [
      { at: 'a', kind: 'begin', id: 'T01' },
      { at: 'b', kind: 'begin', id: 'T02' },
    ],
    records: [
      {
        id: 'T01',
        verdict: 'passed',
        seconds: 120,
        note: '只说能跑，没有指标',
        scores: { quant: 40, repro: 60, boundary: 30, criteria: 30, tools: 50, regression: 10, expression: 70 },
      },
      { id: 'T02', verdict: 'weak', seconds: 200, note: '改完没有回归' },
    ],
  });
  const report = __test.buildReport({ state, bank, stats: __test.statsOf(state, bank), workspace: 'C:\\tmp' });
  for (const heading of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.']) {
    assert.ok(report.includes(heading), `缺少章节 ${heading}`);
  }
  assert.ok(report.includes('T01 通信协议边界测试'));
  assert.ok(report.includes('第 1 题'));
  assert.ok(report.includes('只测“能跑”') || report.includes('不可量化'));
  assert.ok(report.includes('标准测试框架'));
});
check('坏习惯优先级由 note 关键词触发', () => {
  const state = __test.normalizeState({ records: [{ id: 'T01', verdict: 'weak', note: '改完没有回归' }] });
  const habits = __test.habitsOf(state);
  assert.equal(habits.length, 3);
  assert.equal(habits[0].key, 'noregress');
});

console.log('[7] 工具与 RPC（临时 DSH_HOME）');
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
const api = mod.apply(ctx, { workspace: ROOT });
const toolEntries = installed.filter((entry) => entry.kind === 'tool');
const toolByName = new Map(toolEntries.map((entry) => [entry.definition.name, entry.definition]));

check('注册 skill 与 5 个工具', () => {
  const skill = installed.find((entry) => entry.kind === 'skill');
  assert.ok(skill, '应注册 skill');
  assert.equal(skill.definition.name, 'test-verify-coach');
  assert.ok(skill.definition.content.length > 1500, 'skill 正文应有实际内容');
  assert.equal(skill.definition.invocation.userInvocable, true);
  assert.deepEqual(
    [...toolByName.keys()].sort(),
    ['testcoach_begin', 'testcoach_record', 'testcoach_reference', 'testcoach_report', 'testcoach_state'],
  );
});
check('RPC 路由与状态文件路径', () => {
  assert.equal(installed.filter((entry) => entry.path !== undefined).length, 1);
  assert.equal(installed.find((entry) => entry.path !== undefined).path, '/plugins/dsh-test-teacher/rpc');
  assert.equal(api.statePath, path.join(tmpHome, 'test-teacher', 'state.json'));
});
check('写盘格式可被 normalizeState 读回', () => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ status: 'running', mode: 'control', current: 'T02', records: [{ id: 'T02', verdict: 'passed', seconds: 77 }] }));
  const state = __test.normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  assert.equal(state.current, 'T02');
  assert.equal(state.records[0].seconds, 77);
});

const route = installed.find((entry) => entry.path !== undefined);
function callRpc(body) {
  const req = {
    method: 'POST',
    destroy() {},
    on(event, callback) {
      if (event === 'data') callback(Buffer.from(JSON.stringify(body)));
      if (event === 'end') callback();
      return req;
    },
  };
  const res = {
    payload: undefined,
    setHeader() {},
    end(text) {
      res.payload = JSON.parse(text);
    },
  };
  return route.handler(req, res).then(() => res.payload);
}

/* [8] RPC 闭环 + 工具输出 */
const summaryOf = (value) => JSON.stringify(value);

console.log('[8] RPC 闭环与工具输出');
await checkAsync('POST state 返回状态与题库摘要', async () => {
  const payload = await callRpc({ method: 'state', args: {} });
  assert.equal(payload.ok, true);
  assert.equal(payload.value.state.status, 'running');
  assert.equal(payload.value.bankSummary.length, 12);
  assert.equal(payload.value.modes.length, 5);
  assert.equal(payload.value.dimensions.length, 7);
});
await checkAsync('POST begin（comms）选中通信分组并返回底稿字段', async () => {
  const payload = await callRpc({ method: 'begin', args: { mode: 'comms' } });
  assert.equal(payload.ok, true);
  const object = payload.value.object;
  assert.ok(['T01', 'T04', 'T06', 'T07'].includes(object.id));
  assert.equal(payload.value.state.mode, 'comms');
  assert.ok(object.metrics.length >= 5);
  assert.ok(object.project.length > 80);
});
await checkAsync('未知方法返回错误', async () => {
  const payload = await callRpc({ method: 'nope', args: {} });
  assert.equal(payload.ok, false);
  assert.match(payload.error, /unknown method/);
});
await checkAsync('POST record 更新统计', async () => {
  const payload = await callRpc({ method: 'record', args: { id: 'T01', verdict: 'passed', seconds: 150, note: '指标只写了一个', scores: { quant: 60 } } });
  assert.equal(payload.ok, true);
  assert.ok(payload.value.stats.attempted >= 1);
});
await checkAsync('POST report 返回 7 章复盘', async () => {
  const payload = await callRpc({ method: 'report', args: {} });
  assert.equal(payload.ok, true);
  assert.ok(payload.value.report.includes('## 1.'));
  assert.ok(payload.value.report.includes('## 7.'));
});
await checkAsync('POST reference 返回教练底稿', async () => {
  const payload = await callRpc({ method: 'reference', args: { id: 'T02' } });
  assert.equal(payload.ok, true);
  assert.ok(payload.value.object.metrics.length >= 5);
});

await checkAsync('testcoach_begin 只给题干、不泄露指标与判据', async () => {
  const tool = toolByName.get('testcoach_begin');
  const result = await tool.execute({ id: 'T01' });
  assert.match(result.text, /请回答/);
  assert.match(result.text, /建议熟练回答时间/);
  assert.ok(!result.text.includes('## 指标'), 'begin 不应返回指标清单');
  assert.ok(!result.text.includes('判据（'));
  const rendered = tool.output.render({}, result);
  assert.equal(rendered[0].type, 'text');
});
await checkAsync('testcoach_reference 返回指标/条件/判据/回归/框架', async () => {
  const tool = toolByName.get('testcoach_reference');
  const result = await tool.execute({ id: 'T07' });
  for (const marker of ['## 指标', '## 测试条件构造', '## 判据', '## 工具匹配', '## 记录表字段', '## 回归看哪几个数', '## 标准测试框架']) {
    assert.ok(result.text.includes(marker), `底稿缺少 ${marker}`);
  }
  assert.ok(result.text.includes('工程证据'));
});
await checkAsync('testcoach_record 同步状态并给出覆盖/总分', async () => {
  const tool = toolByName.get('testcoach_record');
  const result = await tool.execute({ id: 'T07', verdict: 'weak', seconds: 100, scores: { quant: 70 } });
  assert.match(result.text, /覆盖/);
  assert.match(result.text, /总分/);
});
await checkAsync('testcoach_state 汇总状态', async () => {
  const tool = toolByName.get('testcoach_state');
  const result = await tool.execute({});
  assert.match(result.text, /覆盖/);
  assert.match(result.text, /七维均分/);
});

console.log('[9] 资源文件与清单');
for (const file of ['package.json', 'cordis.patch.yml', 'locale/zh.json', 'locale/en.json', 'icon.svg', 'data/test-objects.json', 'skill/SKILL.md', 'README.md']) {
  check(`存在且非空：${file}`, () => {
    const stat = fs.statSync(path.join(ROOT, file));
    assert.ok(stat.size > 20, `${file} 太小`);
  });
}
check('locale 提供中英文标题与描述', () => {
  for (const locale of ['zh', 'en']) {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'locale', `${locale}.json`), 'utf8')).meta;
    assert.ok(meta.title.length > 0, `${locale} title`);
    assert.ok(meta.description.length > 20, `${locale} description`);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'locale', 'zh.json'), 'utf8')).meta.title, '测试验证老师');
});
check('icon.svg 是合法 SVG（尺寸/根元素）', () => {
  const svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');
  assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 64 64"/);
});
check('package.json 导出/客户端声明/文件清单正确', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dsh-test-teacher');
  assert.equal(pkg.main, 'lib/index.js');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json');
  assert.equal(pkg.exports['./icon'], './icon.svg');
  for (const entry of ['lib', 'data', 'skill', 'locale', 'icon.svg', 'cordis.patch.yml', 'README.md']) {
    assert.ok(pkg.files.includes(entry), `files 缺少 ${entry}`);
  }
});
check('cordis.patch.yml 插入行 id/name/workspace', () => {
  const patch = fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes('id: dsh-test-teacher'));
  assert.ok(patch.includes("name: 'dsh-test-teacher'"));
  assert.ok(patch.includes('workspace:'));
});

fs.rmSync(tmpHome, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
  console.error(`selftest 失败 ${failures.length} 项：`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`host selftest OK · ${summaryOf({ tools: toolEntries.length, rpc: route.path })}`);
