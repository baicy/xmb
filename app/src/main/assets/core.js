// 小芒榜 PWA 核心：纯逻辑，localStorage 存储，无 chrome.* 依赖（浏览器与 node 测试通用）
const API_BASE = 'https://mgeact.api.mgtv.com/activity/conf?activity_sn=top20250207xgylypx';
const MONTH_KEY = 'xm_cache_month';       // 月榜缓存 {list, ts}
const QUARTER_KEY = 'xm_cache_quarter';   // 季榜缓存 {list, ts}
const CHANGES_KEY = 'xm_changes';         // 变动记录数组
const READ_KEY = 'xm_read_at';            // 最后"读过变动记录"的时刻（毫秒）
const AUTO_KEY = 'xm_auto';               // 自动刷新开关

// 季初月(1/4/7/10月)：隐藏季榜且不重复记季榜（季榜=当月榜）。已确认开启。
const HIDE_QUARTER_IN_FIRST_MONTH = true;
const SEASONS = ['春季', '夏季', '秋季', '冬季'];
const yyOf = (y) => String(y).slice(-2);

// ---------- 存储封装（localStorage，Promise 化；node 测试可 mock global.localStorage） ----------
function lget(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function lset(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

// ---------- 时间工具（本地时区，禁 toISOString 防东八区差一天） ----------
function fmtTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------- 取"当前时间"对应的月榜/季榜参数 ----------
function boardNow() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const q = Math.floor((m - 1) / 3) + 1;
  const isFirst = ((m - 1) % 3) === 0; // 1/4/7/10 月 = 季度首月
  return {
    y, m, q, isFirst,
    yy: yyOf(y),
    monthSn: API_BASE + yyOf(y) + 'm' + m,
    quarterSn: API_BASE + yyOf(y) + 'q' + q,
    monthLabel: m + '月',
    quarterLabel: SEASONS[q - 1]
  };
}

// ---------- 拉取单个榜单 ----------
async function fetchBoard(sn) {
  const r = await fetch(sn, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.code !== 200 || !j.data || !Array.isArray(j.data.top_list)) {
    throw new Error('接口返回异常 code=' + j.code);
  }
  return j.data.top_list;
}

// ---------- 对比两份榜单，返回变动描述 ----------
function diffLists(oldList, newList) {
  const oldMap = {}, newMap = {};
  (oldList || []).forEach((it) => { oldMap[it.show_name] = it; });
  (newList || []).forEach((it) => { newMap[it.show_name] = it; });
  const out = [];
  (newList || []).forEach((it) => {
    const o = oldMap[it.show_name];
    if (!o) { out.push(it.show_name + '：新进第 ' + it.top + ' 名'); return; }
    if (o.top !== it.top) out.push(it.show_name + '：第 ' + o.top + ' 名 → 第 ' + it.top + ' 名');
  });
  (oldList || []).forEach((it) => {
    if (!newMap[it.show_name]) out.push(it.show_name + '：跌出榜单（原第 ' + it.top + ' 名）');
  });
  return out;
}

// ---------- 变动记录：取一条的可比时间戳 ----------
function recTs(rec) {
  if (rec && typeof rec.ts === 'number') return rec.ts;
  const s = rec && rec.time;
  if (typeof s === 'string') {
    const t = Date.parse(s.replace(/-/g, '/'));
    if (!isNaN(t)) return t;
  }
  return 0;
}

// 记录自描述标签：新记录用自带 boardLabel；旧记录从 time 推导月份/季节
function boardLabelOf(rec) {
  if (rec && rec.boardLabel) return rec.boardLabel;
  const s = rec && rec.time;
  if (typeof s === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      const mon = +m[2];
      if (rec && rec.board === '季榜') return SEASONS[Math.floor((mon - 1) / 3)];
      return mon + '月';
    }
  }
  return rec && rec.board === '季榜' ? '季榜' : '月榜';
}

// ---------- 未读计数（变动时间晚于已读基线才计未读；基线缺省=今天零点） ----------
function countUnread() {
  const arr = lget(CHANGES_KEY) || [];
  const readAt = lget(READ_KEY) || startOfToday();
  let n = 0;
  for (const rec of arr) if (recTs(rec) > readAt) n++;
  return n;
}

// 标记已读：写入当前时刻
function markRead() { lset(READ_KEY, Date.now()); }

// 一次拉取月榜+季榜，写双缓存，变动记录带 board 标记（标是哪个榜）。
// 季初月：季榜=当月榜，不重复拉取、不重复记季榜。
async function fetchAndStore() {
  const b = boardNow();
  const ts0 = Date.now();
  const stamp = fmtTime(new Date(ts0));

  const monthList = await fetchBoard(b.monthSn);
  const newChanges = [];
  const oldM = lget(MONTH_KEY);
  const mDiff = oldM ? diffLists(oldM.list, monthList) : []; // 无旧基准不记变动（避免首装满屏"新进"）
  if (mDiff.length) newChanges.push({ time: stamp, ts: ts0, board: '月榜', boardLabel: b.monthLabel, items: mDiff });

  let quarterList = null;
  if (b.isFirst) {
    quarterList = monthList;
  } else {
    quarterList = await fetchBoard(b.quarterSn);
    const oldQ = lget(QUARTER_KEY);
    const qDiff = oldQ ? diffLists(oldQ.list, quarterList) : [];
    if (qDiff.length) newChanges.push({ time: stamp, ts: ts0, board: '季榜', boardLabel: b.quarterLabel, items: qDiff });
  }

  const save = {
    [MONTH_KEY]: { list: monthList, ts: ts0 },
    [QUARTER_KEY]: { list: quarterList, ts: ts0 }
  };
  if (newChanges.length) {
    const prev = lget(CHANGES_KEY) || [];
    save[CHANGES_KEY] = newChanges.concat(prev); // 新变动置顶，永久累积无上限
  }
  for (const k in save) lset(k, save[k]);
  return { month: monthList, quarter: quarterList, isFirst: b.isFirst, board: b };
}

// 清空全部变动记录（清 storage + 已读基线）
function clearChanges() {
  lset(CHANGES_KEY, []);
  markRead();
}

// 读某榜缓存 list（无则 null）
function readCache(key) {
  const c = lget(key);
  return c && Array.isArray(c.list) ? c.list : null;
}
function readMeta(key) {
  return lget(key) || null;
}

// 自动刷新开关
function getAuto() { return lget(AUTO_KEY) === true; }
function setAuto(on) { lset(AUTO_KEY, !!on); }

// 导出：浏览器挂全局 XMB；node 测试走 module.exports
(function (root) {
  const api = {
    API_BASE, MONTH_KEY, QUARTER_KEY, CHANGES_KEY, READ_KEY, AUTO_KEY,
    HIDE_QUARTER_IN_FIRST_MONTH, SEASONS, yyOf,
    fmtTime, startOfToday, boardNow, fetchBoard, diffLists, recTs, boardLabelOf,
    countUnread, markRead, fetchAndStore, clearChanges, readCache, readMeta,
    getAuto, setAuto, lget, lset
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XMB = api;
})(typeof window !== 'undefined' ? window : globalThis);
