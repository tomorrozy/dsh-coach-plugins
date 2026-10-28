/**
 * UI 验证脚本：用 Edge 无头浏览器打开正在运行的 DSH GUI，
 * 验证「左侧栏入口 → 排错教练台」真实渲染并截图。
 *
 * 用法：
 *   $env:VERIFY_URL = "http://127.0.0.1:55957"
 *   node scripts/verify-ui.mjs
 *
 * 产物：
 *   docs/screenshots/01-sidebar.png / 02-panel.png / 03-criteria.png / 04-bank.png
 *   .verify/diag-troubleshoot.json（正文、检查项、console/pageerror、失败请求）
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const WORKSPACE = path.resolve(ROOT, '..');
const OUT = path.join(WORKSPACE, '.verify');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const URL_ = process.env.VERIFY_URL;
const PUPPETEER = process.env.VERIFY_PUPPETEER ?? 'USER_HOME/.dsh/profiles/desktop/node_modules/puppeteer-core';
const EDGE = process.env.VERIFY_EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

if (!URL_) {
  console.error('缺少 VERIFY_URL（正在运行的 DSH GUI 地址，如 http://127.0.0.1:55957）');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const puppeteer = require(PUPPETEER);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const diag = { url: URL_, shots: [], consoleErrors: [], pageErrors: [], failedRequests: [], checks: {}, texts: {} };

const screenshot = async (page, name) => {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  diag.shots.push({ name, file, at: new Date().toISOString() });
  log('shot', file);
};

const bodyText = (page) => page.evaluate(() => document.body.innerText || '');

async function clickText(page, needle, exact = false) {
  const hit = await page.evaluate(
    (needle, exact) => {
      let best = null;
      for (const el of document.querySelectorAll('body *')) {
        const own = [...el.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
          .join(' ')
          .trim();
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (own.length === 0 && text.length === 0) continue;
        const match = exact ? own === needle || text === needle : own.includes(needle) || text.includes(needle);
        if (!match) continue;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const after = el.getBoundingClientRect();
        let depth = 0;
        for (let node = el; node.parentElement; node = node.parentElement) depth += 1;
        if (best === null || depth > best.depth) best = { depth, x: after.x, y: after.y, w: after.width, h: after.height, tag: el.tagName, text: own.slice(0, 60) };
      }
      return best;
    },
    needle,
    exact,
  );
  if (hit === null) {
    log('miss', needle);
    return false;
  }
  await page.mouse.click(hit.x + Math.min(hit.w, 200) / 2, hit.y + Math.min(hit.h, 60) / 2);
  log('click', JSON.stringify(hit));
  return true;
}

async function clickButton(page, needle) {
  const hit = await page.evaluate((needle) => {
    for (const el of document.querySelectorAll('button, [role="button"], a')) {
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text !== needle) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const after = el.getBoundingClientRect();
      return { x: after.x, y: after.y, w: after.width, h: after.height, tag: el.tagName, cls: String(el.className).slice(0, 80) };
    }
    return null;
  }, needle);
  if (hit === null) {
    log('miss-button', needle);
    return false;
  }
  await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2);
  log('click-button', JSON.stringify(hit));
  return true;
}

async function scrollCardIntoView(page, needle) {
  const ok = await page.evaluate((needle) => {
    const cards = [...document.querySelectorAll('.tc-card')];
    const card = cards.find((item) => (item.innerText || '').includes(needle));
    if (!card) return false;
    card.scrollIntoView({ block: 'start' });
    return true;
  }, needle);
  if (ok) await sleep(500);
  return ok;
}

const waitForText = async (page, needle, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await bodyText(page)).includes(needle)) return true;
    await sleep(400);
  }
  return false;
};

const rpc = async (page, method, args) => {
  const value = await page.evaluate(
    async (method, args) => {
      const response = await fetch('/plugins/dsh-troubleshoot-teacher/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args }),
      });
      return response.json();
    },
    method,
    args ?? {},
  );
  return value;
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  userDataDir: path.join(OUT, 'edge-profile-tscoach'),
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--disable-gpu', '--lang=zh-CN', '--window-size=1440,1000'],
  defaultViewport: { width: 1440, height: 1000 },
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') diag.consoleErrors.push(message.text().slice(0, 500));
  });
  page.on('pageerror', (error) => diag.pageErrors.push(String(error).slice(0, 500)));
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && (url.includes('/plugins/') || url.includes('/client') || url.includes('/api/'))) {
      diag.failedRequests.push({ status: response.status(), url: url.slice(0, 300) });
    }
  });

  log('goto', URL_);
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);

  // 首次启动弹窗
  for (let step = 0; step < 3; step += 1) {
    const text = await bodyText(page);
    if (text.includes('预览版说明') || text.includes('欢迎使用')) {
      await clickButton(page, '继续');
      await sleep(1500);
    } else {
      break;
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(800);

  // 准备数据：重置到干净状态，选第 1 题
  const reset = await rpc(page, 'reset');
  diag.checks.rpcReset = reset?.ok === true;
  const begin = await rpc(page, 'begin', { mode: 'all', id: 'P01' });
  diag.checks.rpcBegin = begin?.ok === true;
  await sleep(1200);

  await screenshot(page, '01-sidebar');
  diag.texts.home = (await bodyText(page)).slice(0, 4000);
  diag.checks.sidebarEntry = (await bodyText(page)).includes('排错教练');

  // 左侧栏入口 → 全局面板
  diag.checks.clickedEntry = await clickText(page, '排错教练', true);
  diag.checks.panelTitle = await waitForText(page, '排错方法论老师', 15000);
  await sleep(1500);
  await screenshot(page, '02-panel');
  let panelText = await bodyText(page);
  diag.texts.panel = panelText.slice(0, 8000);
  diag.checks.currentPhenomenon = panelText.includes('P01') && panelText.includes('双机通信不通');
  diag.checks.criteria = panelText.includes('判据清单') && panelText.includes('正常') && panelText.includes('异常');
  diag.checks.framework = panelText.includes('标准排查框架');
  diag.checks.bank = (panelText.match(/P\d{2}/g) || []).length;

  // 判据清单
  await scrollCardIntoView(page, '判据清单');
  await screenshot(page, '03-criteria');

  // 题库
  await scrollCardIntoView(page, '现象题库');
  await screenshot(page, '04-bank');

  // 面板交互：在面板里点「记：待加强」，验证面板实时同步（不刷新页面）
  diag.checks.recordButtonClicked = await clickButton(page, '记：待加强');
  diag.checks.recordVisible = await waitForText(page, '1/16', 25000);
  const progressText = await bodyText(page);
  diag.checks.verdictSynced = progressText.includes('0 / 1 / 0') || progressText.includes('1 / 0 / 0');
  diag.texts.progress = progressText.slice(0, 6000);
  await scrollCardIntoView(page, '覆盖与分项');
  await screenshot(page, '05-progress');

  // 复盘生成（在清理之前生成，保留记录）
  const report = await rpc(page, 'report');
  diag.checks.rpcReport = report?.ok === true && String(report?.value?.report ?? '').includes('排错能力总分');
  diag.texts.report = String(report?.value?.report ?? '').slice(0, 3000);

  // 清理测试状态，恢复空状态
  const cleanup = await rpc(page, 'reset');
  diag.checks.cleanup = cleanup?.ok === true;
} finally {
  await browser.close();
}

diag.checks.consoleClean = diag.consoleErrors.length === 0;
diag.checks.noPageError = diag.pageErrors.length === 0;
diag.checks.noFailedRequests = diag.failedRequests.filter((entry) => !entry.url.includes('/favicon')).length === 0;

const file = path.join(OUT, 'diag-troubleshoot.json');
fs.writeFileSync(file, `${JSON.stringify(diag, null, 2)}\n`, 'utf8');
log('diag', file);

const failed = Object.entries(diag.checks).filter(([, value]) => value === false || value === 0);
if (failed.length > 0) {
  console.error('UI 验证未通过项：', failed.map(([key]) => key).join(', '));
  process.exit(1);
}
console.log('UI verify OK');
console.log(JSON.stringify(diag.checks, null, 2));
