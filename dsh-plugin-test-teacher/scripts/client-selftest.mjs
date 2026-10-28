/**
 * 离线自测（客户端半）：用假的 window.__ModuleLoader__ + 假 react + 假 slots
 * 驱动 lib/client.js，确认模块格式、apply() 的 slot 注册、左侧栏入口与
 * 主面板 key 一致，并检查面板组件与图标组件都能安全创建元素树。
 *
 * 运行：node scripts/client-selftest.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8');

/* 最小 React 形状：不真正渲染，只验证创建树不抛异常。 */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
};

const registrations = [];
const injectedSlots = [];
const effects = [];
let loaded = null;

const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        loaded = entry;
      },
    },
  },
  document: {
    createElement: () => ({ dataset: {}, textContent: '', remove() {}, style: {} }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {} },
  },
  navigator: { clipboard: undefined },
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  fetch: () => Promise.reject(new Error('offline')),
  console,
  require: (id) => {
    if (id === 'react') return reactStub;
    throw new Error(`unexpected require(${id})`);
  },
  module: { exports: {} },
  exports: {},
  Symbol,
  Map,
  Set,
  JSON,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  Promise,
  Error,
  RegExp,
  isNaN,
};

const context = vm.createContext(sandbox);
vm.runInContext(source, context, { filename: 'lib/client.js' });

assert.ok(loaded !== null, 'client.js 必须调用 window.__ModuleLoader__.load');
assert.equal(loaded.id, 'dsh-test-teacher', '模块 id 必须与 package.json 插件名一致');

const mod = loaded.factory((id) => {
  if (id === 'react') return reactStub;
  throw new Error(`unexpected require(${id})`);
});

assert.equal(typeof mod.apply, 'function', '必须导出 apply');
assert.deepEqual([...mod.inject], ['slots', 'locale', 'layout'], '必须注入 slots/locale/layout');

const ctx = {
  effect(factory, label) {
    const dispose = factory();
    effects.push({ label, dispose });
    return dispose;
  },
  slots: {
    inject(name, callback) {
      injectedSlots.push(name);
      const result = callback();
      // `main` 用 function* 声明式注册：把生成器跑到结束。
      if (result !== null && typeof result === 'object' && typeof result.next === 'function') {
        let step = result.next();
        while (step.done !== true) step = result.next();
      }
      return result;
    },
    register(meta, component) {
      assert.ok(meta && typeof meta.name === 'string', 'slot 注册必须带 name');
      assert.equal(typeof component, 'function', `${meta.name} 组件必须是函数`);
      registrations.push({ meta, component });
      return () => {};
    },
  },
};

mod.apply(ctx);

assert.ok(injectedSlots.includes('sidebar.panellist'), '必须注入 sidebar.panellist');
assert.ok(injectedSlots.includes('main'), '必须注入 main');
const sidebar = registrations.find((entry) => entry.meta.name === 'sidebar.panellist');
assert.ok(sidebar, '必须注册 sidebar.panellist 入口');
assert.equal(sidebar.meta.id, 'test-teacher', 'panel id 必须与 main key 一致');
assert.equal(sidebar.meta.label, '测试验证');
assert.equal(typeof sidebar.meta.order, 'number');
const main = registrations.find((entry) => entry.meta.name === 'main');
assert.ok(main, '必须注册 main 面板');
assert.equal(main.meta.key, sidebar.meta.id, 'sidebar 入口 id 必须与 main key 一致');
assert.ok(
  effects.some((entry) => entry.label === 'test-teacher: styles'),
  '必须注入样式 effect',
);

/* 组件创建一次（假 React 不执行 hooks，只验证创建树不抛异常） */
const page = main.component();
assert.ok(page && typeof page === 'object', '面板组件应返回元素树');
assert.equal(page.type, 'div');
assert.equal(page.props.className, 'tv-page');
const icon = sidebar.component();
assert.ok(icon && typeof icon === 'object', '图标组件应返回元素树');
assert.equal(icon.type, 'svg');

/* 面板必须包含关键区块文案（防止布局被误删）。
   首屏 data 为空、没有 current，所以「教练底稿」等按需区块只在源码层面校验。 */
const flat = JSON.stringify(page, (key, value) => (typeof value === 'function' ? '[fn]' : value));
for (const marker of ['测试验证老师', '当前测试对象', '标准测试框架', '测试对象题库', '面试命令', '复盘', '只练通信', '只练控制', '只练记录', '结束测试']) {
  assert.ok(flat.includes(marker), `面板缺少区块：${marker}`);
}
for (const marker of ['教练底稿', '显示参考答案', '工程证据', '指标（数值 + 单位 + 正常/异常范围）', '回归看哪几个数']) {
  assert.ok(source.includes(marker), `面板源码缺少区块：${marker}`);
}
assert.ok(!flat.includes('排错教练') && !source.includes('排错教练'), '面板不应残留排错插件文案');

/* 卸载：样式 effect 的 cleanup 必须可调用 */
for (const effect of effects) effect.dispose();

console.log('client selftest OK');
console.log(`slots: ${registrations.map((entry) => `${entry.meta.name}:${entry.meta.id ?? entry.meta.key}`).join(', ')}`);
console.log(`client bytes: ${Buffer.byteLength(source, 'utf8')}`);
