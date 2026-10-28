/**
 * UI 验证脚本：对正在运行的 DSH Web GUI 用 Edge 无头浏览器截图，
 * 验证「左侧栏入口 → 测试验证台」真实渲染（不是只看 slot 注册）。
 *
 * 用法（需要能启动浏览器的环境；DSH 沙箱内 Chromium 无法启动）：
 *   $env:VERIFY_URL = "http://127.0.0.1:55957"
 *   node scripts/verify-ui.mjs
 *
 * 产物：
 *   docs/screenshots/01-sidebar.png … 05-report.png
 *   <workspace>/.verify/diag-test-teacher.json（正文、检查项、console/pageerror、失败请求）
 *
 * 脚本会先 reset 状态、最后再 reset 一次，避免把验证数据留在用户的状态文件里。
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
const RPC = '/plugins/dsh-test-teacher/rpc';

if (!URL_) {
  console.error('缺少 VERIFY_URL（运行中的 GUI URL，如 http://127.0.0.1:55957）');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const puppeteer = require(PUPPETEER);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const diag = { url: URL_, shots: [], consoleErrors: [], pageErrors: [], failedRequests: [], checks: {}, texts: {}, rpc: {} };

const screenshot = async (page, name) => {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  diag.shots.push({ name, file, at: new Date().toISOString() });
  log('shot', file);
  return file;
};

const bodyText = (page) => page.evaluate(() => document.body.innerText || '');

/** 找到自身文本/整段文本匹配的最深层可见元素并点击其中心。 */
async function clickText(page, needle, exact = false) {
  const hit = await page.evaluate(
    (needle, exact) => {
      let best = null;
      const all = document.querySelectorAll('body *');
      for (const el of all) {
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

/** 精确点击文本等于 needle 的可见按钮（优先 <button>）。 */
async function clickButton(page, needle) {
  const hit = await page.evaluate((needle) => {
    const candidates = [...document.querySelectorAll('button, [role="button"], a')];
    for (const el of candidates) {
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

/** 把包含指定文本的 .tv-card 滚到视口顶部，便于截图。 */
async function scrollCardIntoView(page, needle) {
  const ok = await page.evaluate((needle) => {
    const cards = [...document.querySelectorAll('.tv-card')];
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
    const text = await bodyText(page);
    if (text.includes(needle)) return true;
    await sleep(400);
  }
  return false;
};

const rpc = (page, method, args) =>
  page
    .evaluate(
      (path, method, args) =>
        fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, args: args ?? {} }),
        }).then((res) => res.json()),
      RPC,
      method,
      args,
    )
    .catch((error) => ({ ok: false, error: String(error) }));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  userDataDir: path.join(OUT, 'edge-profile-test-teacher'),
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--disable-gpu', '--lang=zh-CN', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
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

  // 清空状态，保证从"未开始"开始验证
  diag.rpc.reset = await rpc(page, 'reset');
  await sleep(800);

  // 首次启动会有「预览版说明」弹窗，先点按钮「继续」（不要点含“继续”的正文段落）。
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
  await screenshot(page, '01-sidebar');
  diag.texts.home = (await bodyText(page)).slice(0, 4000);
  diag.checks.sidebarEntry = (await bodyText(page)).includes('测试验证');

  // 左侧栏入口 → 全局面板
  const clickedEntry = await clickText(page, '测试验证', true);
  diag.checks.clickedEntry = clickedEntry;
  const panelReady = await waitForText(page, '测试验证老师', 15000);
  diag.checks.panelTitle = panelReady;
  await sleep(1200);
  await screenshot(page, '02-panel');
  const panelText = await bodyText(page);
  diag.texts.panel = panelText.slice(0, 8000);
  diag.checks.objectIds = [...new Set((panelText.match(/T\d{2}/g) || []))].sort().length;
  diag.checks.hasCommands = ['开始测试', '提示', '参考答案', '跳过', '只练通信', '只练控制', '只练记录', '结束测试'].every((item) => panelText.includes(item));
  diag.checks.emptyState = panelText.includes('还没有当前题');

  // 面板出题：点「只练通信」→ 当前对象卡出现
  await clickButton(page, '只练通信');
  await sleep(2500);
  await scrollCardIntoView(page, '当前测试对象');
  await screenshot(page, '03-question');
  const questionText = await bodyText(page);
  diag.texts.question = questionText.slice(0, 8000);
  diag.checks.currentObject = /当前测试对象[\s\S]{0,200}T0[1467]/.test(questionText);
  diag.checks.projectEvidence = questionText.includes('工程证据');
  diag.checks.sixQuestions = questionText.includes('你要测哪些指标');

  // 展开教练底稿（参考答案）
  await clickButton(page, '显示参考答案');
  await sleep(1500);
  await scrollCardIntoView(page, '教练底稿');
  await screenshot(page, '04-reference');
  const refText = await bodyText(page);
  diag.texts.reference = refText.slice(0, 10000);
  diag.checks.metrics = refText.includes('指标（数值 + 单位 + 正常/异常范围）');
  diag.checks.criteria = refText.includes('判据（每步 正常/异常/工具）');
  diag.checks.regression = refText.includes('回归看哪几个数');
  diag.checks.traps = refText.includes('常见坏习惯');

  // 记一题 + 生成复盘
  await clickButton(page, '记：待加强');
  await sleep(1200);
  await clickButton(page, '生成复盘');
  await sleep(2500);
  await scrollCardIntoView(page, '复盘');
  await screenshot(page, '05-report');
  const reportText = await bodyText(page);
  diag.texts.report = reportText.slice(0, 12000);
  diag.checks.report = reportText.includes('测试与验证能力总分') && reportText.includes('测试对象覆盖矩阵');

  // 面板内记录是否真的写回状态
  diag.rpc.state = await rpc(page, 'state');
  diag.checks.recorded = diag.rpc.state?.value?.stats?.attempted >= 1;

  // 收尾：恢复干净状态
  diag.rpc.resetAfter = await rpc(page, 'reset');
} catch (error) {
  diag.fatal = String(error);
  log('FATAL', error);
} finally {
  fs.writeFileSync(path.join(OUT, 'diag-test-teacher.json'), JSON.stringify(diag, null, 2), 'utf8');
  await browser.close();
}

log('checks', JSON.stringify(diag.checks));
if (diag.pageErrors.length > 0) log('pageErrors', diag.pageErrors.join(' | '));
if (diag.consoleErrors.length > 0) log('consoleErrors', diag.consoleErrors.join(' | '));
const ok =
  diag.checks.sidebarEntry === true &&
  diag.checks.panelTitle === true &&
  diag.checks.objectIds >= 12 &&
  diag.checks.currentObject === true &&
  diag.checks.projectEvidence === true &&
  diag.checks.metrics === true &&
  diag.checks.criteria === true &&
  diag.checks.report === true &&
  diag.checks.recorded === true;
process.exit(ok ? 0 : 1);
