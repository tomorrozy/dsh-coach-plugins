/**
 * dsh-safety-cost-teacher · 离线自检
 *
 * 不启动 DSH，只校验宿主半的纯函数与题库数据：
 *   node scripts/selftest.mjs
 *
 * 校验项：
 *  1. 题库：12 条 S01–S12，字段齐全、长度合规、normal/abnormal 非空。
 *  2. 归一化：normalizeBank / normalizeReview 不丢条目。
 *  3. 模式过滤：六个模式的 id 组与提示词一致。
 *  4. 记录与统计：ordinal 递增、八维均分、覆盖率。
 *  5. 复盘：八个章节标题、覆盖矩阵 12 行、坏习惯检测。
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { __test } from '../lib/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BANK_PATH = path.join(ROOT, 'data', 'question-bank.json');

const { normalizeBank, statsOf, nextReviewId, buildReport, habitsOf, averageScore, stripFrontmatter, AXES, MODES } = __test;

let checks = 0;
function ok(name) {
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const raw = (await import(`file://${BANK_PATH.replace(/\\/g, '/')}`, { with: { type: 'json' } })).default;
assert.ok(Array.isArray(raw), 'question-bank.json 必须是数组');
assert.equal(raw.length, 12, `题库必须有 12 条，实际 ${raw.length}`);
ok('题库是 12 条 JSON 数组');

const EXPECTED = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const ids = raw.map((item) => String(item.id));
assert.deepEqual([...ids].sort(), EXPECTED, '题库 id 必须是 S01–S12');
ok('id 覆盖 S01–S12');

const AXIS_KEYS = AXES.map((axis) => axis.key).sort();
for (const item of raw) {
  assert.ok(item.title && item.title.length >= 2, `${item.id} 缺 title`);
  assert.ok(item.focus && item.focus.length >= 4, `${item.id} 缺 focus`);
  assert.ok(item.background && item.background.length >= 8, `${item.id} 缺 background`);
  assert.equal(item.asks.length, 5, `${item.id} asks 必须 5 条`);
  assert.equal(item.axes.length, 6, `${item.id} axes 必须 6 条`);
  assert.deepEqual(item.axes.map((axis) => axis.key).sort(), AXIS_KEYS, `${item.id} axes key 不完整`);
  for (const axis of item.axes) assert.ok(axis.points.length >= 1, `${item.id} ${axis.key} 缺 points`);
  assert.ok(item.checks.length >= 4 && item.checks.length <= 6, `${item.id} checks 必须 4–6 条`);
  for (const check of item.checks) {
    assert.ok(check.check && check.check.length >= 2, `${item.id} check 缺描述`);
    assert.ok(check.normal && check.normal.length >= 2, `${item.id} check 缺 normal`);
    assert.ok(check.abnormal && check.abnormal.length >= 2, `${item.id} check 缺 abnormal`);
  }
  assert.ok(item.framework.length >= 5 && item.framework.length <= 7, `${item.id} framework 必须 5–7 条`);
  assert.ok(item.traps.length >= 3 && item.traps.length <= 4, `${item.id} traps 必须 3–4 条`);
  assert.ok(item.hint && item.hint.length >= 4, `${item.id} 缺 hint`);
  assert.ok(item.reference && item.reference.length >= 8, `${item.id} 缺 reference`);
}
ok('12 条字段齐全（asks5 / axes6 / checks4-6 / framework5-7 / traps3-4 / hint / reference）');

const bank = normalizeBank(raw);
assert.equal(bank.length, 12, 'normalizeBank 不应丢条目');
assert.equal(bank[0].categoryLabel.length > 0, true, 'categoryLabel 必须可读');
ok('normalizeBank 保留 12 条并补全 categoryLabel');

const modeIds = {
  power: ['S01', 'S02', 'S04', 'S10'],
  motor: ['S03', 'S04', 'S05', 'S09'],
  connect: ['S07', 'S08', 'S12'],
  emc: ['S06', 'S09'],
  cost: ['S11', 'S12'],
};
for (const [mode, expected] of Object.entries(modeIds)) {
  assert.deepEqual([...MODES[mode].ids].sort(), [...expected].sort(), `${mode} 模式 id 组与提示词不一致`);
}
assert.equal(MODES.all.ids, null, 'all 模式必须覆盖全部');
ok('六个训练模式 id 组与提示词一致');

const baseState = { version: 1, status: 'running', mode: 'all', current: 'S02', startedAt: null, updatedAt: null, nextOrdinal: 1, records: [], log: [] };
const r1 = { id: 'S01', verdict: 'weak', seconds: 150, note: '只说了加个保险丝，没给额定值和熔断时间', scores: { risk: 80, consequence: 60, protect: 50, verify: 30, wiring: 70, emc: 60, cost: 40, expression: 75 }, at: new Date().toISOString() };
const s1 = { ...baseState, records: [{ ...r1, ordinal: 1 }], nextOrdinal: 2 };
const stats1 = statsOf(s1, bank);
assert.equal(stats1.attempted, 1, '记录数应为 1');
assert.equal(stats1.total, 12, '题库总数应为 12');
assert.equal(stats1.coverage, 8, '覆盖率 1/12 四舍五入应为 8');
assert.equal(stats1.score, 58, `总分应为八维均分 58，实际 ${stats1.score}`);
assert.equal(stats1.dimensions.length, 8, '分项必须 8 项');
assert.equal(averageScore(s1.records[0]), 58, 'averageScore 应等于八维均分');
ok('statsOf：覆盖率 / 八维均分 / 总分 58');

const next = nextReviewId(s1, bank, 'S01');
assert.equal(next, 'S02', `未练的下一个对象应为 S02，实际 ${next}`);
ok('nextReviewId 跳过已练对象');

const habits = habitsOf(s1);
assert.equal(habits.length, 3, '必须给出 3 个坏习惯');
assert.equal(habits[0].key, 'fuse-only', `应优先命中“只加保险丝”，实际 ${habits[0].key}`);
ok('habitsOf 命中“只加保险丝不验证”');

const report = buildReport({ state: s1, bank, stats: stats1, workspace: ROOT });
for (const heading of ['## 1. 安全可靠性与成本意识总分', '## 2. 分项评分', '## 3. 表现最好的 3 点', '## 4. 最危险的 3 个工程坏习惯', '## 5. 每个坏习惯的纠正方法与标准评审框架', '## 6. 评审对象覆盖矩阵', '## 7. 下一轮建议练的 3 个评审对象', '## 8. 一句话总结']) {
  assert.ok(report.includes(heading), `复盘缺章节：${heading}`);
}
for (const review of bank) assert.ok(report.includes(`| ${review.id} `), `覆盖矩阵缺 ${review.id}`);
assert.ok(report.includes('第1题'), '覆盖矩阵应显示题号');
assert.ok(report.includes('58 / 100'), '复盘应显示总分 58');
ok('buildReport：8 章节 + 12 行覆盖矩阵 + 题号 + 总分');

assert.equal(stripFrontmatter('---\nkind: role\n---\n\n# 标题'), '# 标题', 'frontmatter 必须被去掉');
ok('stripFrontmatter 去掉 YAML 头');

console.log(`\n全部通过：${checks} 项检查。`);
