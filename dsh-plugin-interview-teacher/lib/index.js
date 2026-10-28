/**
 * dsh-interview-teacher — host half.
 *
 * Serves one JSON RPC route for the browser half:
 *   POST /plugins/dsh-interview-teacher/rpc
 *   body: { method, args }  →  { ok: true, value } | { ok: false, error }
 *
 * Methods (read only):
 *   console  → 面试控制台快照（状态文件解析 + 考核点清单统计）
 *
 * No harness.handle/host.call is available to bundle plugins, so the browser
 * half talks JSON over this plain HTTP route (same pattern as
 * dsh-skills-mcp-group-manager).
 */

import fs from 'node:fs';

// 跨平台：默认工作目录从用户主目录推导（可用 DSH_COACH_WORKSPACE 覆盖）
const USER_HOME = process.env.DSH_COACH_WORKSPACE || process.env.USERPROFILE || process.env.HOME || '';

const RPC_PATH = '/plugins/dsh-interview-teacher/rpc';
const MAX_BODY_BYTES = 64 * 1024;

/** 运行时状态文件（与 taurus-interview 技能共用）。 */
const STATE_PATH = USER_HOME + '\\Desktop\\Taurus car\\面试记录\\interview_state.md';
/** 考核点清单（81 点）。 */
const CHECKLIST_PATH = USER_HOME + '\\.dsh\\skills\\taurus-interview\\references\\考核点清单.md';
/** 复盘可写目录：面试记录/ 下的 md 即历史复盘。 */
const RECORD_DIR = USER_HOME + '\\Desktop\\Taurus car\\面试记录';

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function parseState(md) {
  if (md === undefined) return undefined;
  const get = (label) => {
    const m = md.match(new RegExp(`^${label}[:：]\\s*(.*)$`, 'm'));
    return m === null ? undefined : m[1].trim();
  };
  const listAfter = (heading) => {
    const idx = md.indexOf(heading);
    if (idx < 0) return [];
    const rest = md.slice(idx + heading.length);
    const end = rest.search(/^## /m);
    const block = end < 0 ? rest : rest.slice(0, end);
    return block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^-\s+[A-Z]\d{2}\b/.test(line))
      .map((line) => {
        const m = line.match(/^-\s+([A-Z]\d{2})\s*✔?\s*(Q\d+)?\s*([\d.]+)?(?:\/([\d.]+))?/);
        return m === null ? undefined : { id: m[1], question: m[2], score: m[3], max: m[4] };
      })
      .filter((v) => v !== undefined);
  };
  const done = listAfter('## 已考');
  const scores = {};
  const scoreBlock = md.match(/## 分项得分([\s\S]*?)(?:^## |$)/m);
  if (scoreBlock !== null) {
    for (const line of scoreBlock[1].split('\n')) {
      const m = line.match(/^-\s*([^:：]+)[:：]\s*([\d.-]+)\s*\/\s*([\d.-]+)/);
      if (m !== null) scores[m[1].trim()] = { value: Number(m[2]), max: Number(m[3]) };
    }
  }
  return {
    status: get('状态') ?? '未知',
    updatedAt: get('更新时间') ?? '-',
    phase: get('阶段') ?? '-',
    progress: get('题号') ?? '0/81',
    current: get('当前考核点') ?? '-',
    suggestTime: get('本题建议时间') ?? '-',
    actualTime: get('本题实际用时') ?? '-',
    mode: get('题量模式') ?? '-',
    done,
    doneIds: done.map((d) => d.id),
    scores,
  };
}

function parseChecklist(md) {
  if (md === undefined) return undefined;
  const rows = md
    .split('\n')
    .map((line) => line.match(/^\|\s*([A-Z]\d{2})\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/))
    .filter((m) => m !== null)
    .map((m) => ({ id: m[1], source: m[2].trim(), point: m[3].trim(), required: m[4].trim(), time: m[5].trim() }));
  const groups = { D: [], S: [], L: [] };
  for (const row of rows) {
    const g = row.id[0];
    if (groups[g] !== undefined) groups[g].push(row);
  }
  const required = rows.filter((row) => row.required === '是').length;
  return {
    total: rows.length,
    required,
    groups: {
      D: groups.D.length,
      S: groups.S.length,
      L: groups.L.length,
    },
    points: rows,
  };
}

function listReviews() {
  try {
    return fs
      .readdirSync(RECORD_DIR)
      .filter((name) => name.endsWith('.md') && name !== 'interview_state.md')
      .map((name) => {
        const stat = fs.statSync(`${RECORD_DIR}\\${name}`);
        return { name, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
      .slice(0, 10);
  } catch {
    return [];
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
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

const methods = {
  async console() {
    const state = parseState(readText(STATE_PATH));
    const checklist = parseChecklist(readText(CHECKLIST_PATH));
    const done = new Set(state === undefined ? [] : state.doneIds);
    const coverage =
      checklist === undefined
        ? undefined
        : {
            total: checklist.total,
            done: checklist.points.filter((point) => done.has(point.id)).length,
            byGroup: {
              D: checklist.points.filter((point) => point.id[0] === 'D' && done.has(point.id)).length,
              S: checklist.points.filter((point) => point.id[0] === 'S' && done.has(point.id)).length,
              L: checklist.points.filter((point) => point.id[0] === 'L' && done.has(point.id)).length,
            },
            remaining: checklist.points.filter((point) => !done.has(point.id)).map((point) => point.id),
          };
    return {
      state,
      checklist,
      coverage,
      reviews: listReviews(),
      paths: { state: STATE_PATH, checklist: CHECKLIST_PATH, records: RECORD_DIR },
      now: new Date().toISOString(),
    };
  },
  async ping() {
    return { pong: true };
  },
};

export const name = 'dsh-interview-teacher';

/** Pure parsers exported for offline verification (not part of the plugin API). */
export const __test = { parseState, parseChecklist };

export function apply(ctx) {
  const WEB_SERVER_KEYS = ['webServer', 'httpServer'];
  let registered = false;

  const register = () => {
    if (registered) return;
    const webServer = ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]);
    if (webServer === undefined) return;
    registered = true;
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
            try {
              const body = JSON.parse(await readBody(req));
              const handler = typeof body.method === 'string' ? methods[body.method] : undefined;
              if (handler === undefined) {
                sendJson(res, 400, { ok: false, error: `unknown method ${JSON.stringify(body.method)}` });
                return;
              }
              const value = await handler(body.args ?? {});
              sendJson(res, 200, { ok: true, value });
            } catch (error) {
              sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
      'interview-teacher: rpc route',
    );
  };

  register();
  ctx.on('internal/service', (serviceName) => {
    if (WEB_SERVER_KEYS.includes(serviceName)) register();
  });
}
