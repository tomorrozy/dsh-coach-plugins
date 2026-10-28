/**
 * UI 验证脚本：对隔离 DSH 实例（web）用 Edge 无头浏览器截图，
 * 验证「左侧栏入口 → 硬件面试台」真实渲染。
 *
 * 前提：已用隔离 DSH_HOME 启动 dsh web，并拿到带 token 的 URL。
 * 用法（需要能启动浏览器的环境；DSH 沙箱内 Chromium 无法启动）：
 *   $env:VERIFY_URL = "http://127.0.0.1:3137/?token=..."
 *   node scripts/verify-ui.mjs
 *
 * 产物：
 *   docs/screenshots/01-sidebar.png … 05-report.png
 *   .verify/diag-lead.json（正文、H 点命中、console/pageerror、失败请求）
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
  console.error('缺少 VERIFY_URL（带 token 的实例 URL）');
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
        let depth = 0;
        for (let node = el; node.parentElement; node = node.parentElement) depth += 1;
        if (best === null || depth > best.depth) best = { depth, x: rect.x, y: rect.y, w: rect.width, h: rect.height, tag: el.tagName, text: own.slice(0, 60) };
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
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, tag: el.tagName, cls: String(el.className).slice(0, 80) };
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

const waitForText = async (page, needle, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await bodyText(page);
    if (text.includes(needle)) return true;
    await sleep(400);
  }
  return false;
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  userDataDir: path.join(OUT, 'edge-profile-lead'),
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
  diag.checks.sidebarEntry = (await bodyText(page)).includes('硬件面试');

  // 左侧栏入口 → 全局面板
  const clickedEntry = await clickText(page, '硬件面试', true);
  diag.checks.clickedEntry = clickedEntry;
  const panelReady = await waitForText(page, '电控硬件面试老师', 15000);
  diag.checks.panelTitle = panelReady;
  await sleep(1200);
  await screenshot(page, '02-panel');
  let panelText = await bodyText(page);
  diag.texts.panel = panelText.slice(0, 6000);
  diag.checks.checklistIds = [...new Set((panelText.match(/H\d{2}/g) || []))].sort().length;

  // 扫描工程硬件配置
  await clickText(page, '扫描工程硬件配置');
  await sleep(3000);
  await screenshot(page, '03-scan');
  const scanText = await bodyText(page);
  diag.texts.scan = scanText.slice(0, 6000);
  diag.checks.scanEvidence = /扫描完成|条硬件配置|源文件/.test(scanText);

  // 开始面试 → 当前题
  await clickText(page, '开始面试');
  await sleep(2000);
  await screenshot(page, '04-question');
  const questionText = await bodyText(page);
  diag.texts.question = questionText.slice(0, 6000);
  diag.checks.questionCard = questionText.includes('覆盖硬件考核点');

  // 记录一题 + 预览复盘
  await clickText(page, '通过并下一题');
  await sleep(1500);
  await clickText(page, '预览复盘');
  await sleep(2500);
  await screenshot(page, '05-report');
  const reportText = await bodyText(page);
  diag.texts.report = reportText.slice(0, 8000);
  diag.checks.report = reportText.includes('复盘') && reportText.includes('H0');
} catch (error) {
  diag.fatal = String(error);
  log('FATAL', error);
} finally {
  fs.writeFileSync(path.join(OUT, 'diag-lead.json'), JSON.stringify(diag, null, 2), 'utf8');
  await browser.close();
}

log('checks', JSON.stringify(diag.checks));
if (diag.pageErrors.length > 0) log('pageErrors', diag.pageErrors.join(' | '));
if (diag.consoleErrors.length > 0) log('consoleErrors', diag.consoleErrors.join(' | '));
const ok = diag.checks.sidebarEntry === true && diag.checks.panelTitle === true && diag.checks.checklistIds >= 20;
process.exit(ok ? 0 : 1);
