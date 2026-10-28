/**
 * 离线自测（客户端半）：用假的 window.__ModuleLoader__ + 假 react + 假 slots
 * 驱动 lib/client.js，确认模块格式、apply() 的 slot 注册、左侧栏入口与
 * 主面板 key 一致，并检查所有面板组件都是函数。
 *
 * 运行：node scripts/client-selftest.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8');

/* 最小 React 形状：本测试不渲染，只校验 hooks 调用顺序下的纯逻辑不崩。 */
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
const styles = [];
let loaded = null;

const windowStub = {
  __ModuleLoader__: {
    load(entry) {
      loaded = entry;
    },
  },
};

const sandbox = {
  window: windowStub,
  document: {
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
    head: { appendChild: () => {} },
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
assert.equal(loaded.id, 'dsh-hardware-interview-teacher', '模块 id 必须与 package.json 插件名一致');

const mod = loaded.factory((id) => {
  if (id === 'react') return reactStub;
  throw new Error(`unexpected require(${id})`);
});

assert.equal(typeof mod.apply, 'function', '必须导出 apply');
assert.deepEqual([...mod.inject], ['slots'], '必须只注入 slots');

const ctx = {
  effect(factory, label) {
    const dispose = factory();
    styles.push({ label, dispose });
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
assert.equal(sidebar.meta.id, 'hardware-interview');
assert.equal(sidebar.meta.label, '硬件面试');
assert.equal(typeof sidebar.meta.order, 'number');
const main = registrations.find((entry) => entry.meta.name === 'main');
assert.ok(main, '必须注册 main 面板');
assert.equal(main.meta.key, sidebar.meta.id, 'sidebar 入口 id 必须与 main key 一致');
assert.ok(styles.some((entry) => entry.label === 'hardware-interview: styles'), '必须注入样式 effect');

/* 组件渲染一次（假 React 不执行 hooks，只验证创建树不抛异常） */
const page = main.component();
assert.ok(page && typeof page === 'object', '面板组件应返回元素树');
assert.equal(page.type, 'div');
const icon = sidebar.component();
assert.ok(icon && typeof icon === 'object', '图标组件应返回元素树');

console.log('client selftest OK');
console.log(`slots: ${registrations.map((entry) => `${entry.meta.name}:${entry.meta.id ?? entry.meta.key}`).join(', ')}`);
console.log(`css bytes: ${Array.from(fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')).length}`);
