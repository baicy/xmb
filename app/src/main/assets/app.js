// 小芒榜 PWA 页面逻辑：渲染 + 交互 + 自动刷新 + 历史榜单
// 核心纯逻辑见 core.js（浏览器全局 XMB）
(function () {
  const $ = (id) => document.getElementById(id);
  const X = window.XMB;
  let curBoard = 'month';   // 'month' | 'quarter'
  let curView = 'board';
  let timer = null;

  // ---------- 榜单行 ----------
  function makeRow(it) {
    const row = document.createElement('div'); row.className = 'row';
    const rank = document.createElement('span');
    rank.className = 'rank' + (it.top <= 3 ? ' r' + it.top : '');
    rank.textContent = it.top;
    const img = document.createElement('img');
    img.className = 'avatar'; img.src = it.icon; img.alt = '';
    img.loading = 'lazy'; img.onerror = () => { img.style.visibility = 'hidden'; };
    const name = document.createElement('span');
    name.className = 'name'; name.textContent = it.show_name;
    row.append(rank, img, name);
    return row;
  }
  function renderList(list) {
    const box = $('list');
    box.innerHTML = '';
    (list || []).forEach((it) => box.append(makeRow(it)));
  }
  function showBoard(which) {
    curBoard = which;
    $('tabMonth').classList.toggle('on', which === 'month');
    $('tabQuarter').classList.toggle('on', which === 'quarter');
    const key = which === 'month' ? X.MONTH_KEY : X.QUARTER_KEY;
    const meta = X.readMeta(key);
    const label = which === 'month' ? X.boardNow().monthLabel : X.boardNow().quarterLabel;
    if (meta && Array.isArray(meta.list) && meta.list.length) {
      renderList(meta.list);
      $('meta').textContent = label + ' · 刷新于 ' + X.fmtTime(new Date(meta.ts || Date.now()));
    } else {
      $('meta').textContent = '点击刷新加载榜单';
    }
  }

  // ---------- 变动记录 ----------
  function renderChanges() {
    const arr = X.lget(X.CHANGES_KEY) || [];
    $('cvTitle').textContent = '变动记录' + (arr.length ? ' (' + arr.length + ')' : '');
    const box = $('changesList'); box.innerHTML = '';
    if (!arr.length) { box.innerHTML = '<div class="empty">暂无变动记录</div>'; return; }
    arr.forEach((rec) => {
      const c = document.createElement('div'); c.className = 'chg';
      const t = document.createElement('div'); t.className = 'chg-time';
      t.textContent = X.boardLabelOf(rec) + ' · ' + rec.time;
      const items = document.createElement('div');
      (rec.items || []).forEach((s) => {
        const d = document.createElement('div'); d.className = 'chg-item'; d.textContent = s;
        items.append(d);
      });
      c.append(t, items); box.append(c);
    });
  }

  // ---------- 未读红点 ----------
  function updateDot() {
    const n = X.countUnread();
    $('chgDot').style.display = n > 0 ? 'flex' : 'none';
    if (n > 0) $('chgDot').textContent = n > 99 ? '99+' : n;
    const navBadge = $('navBadge');
    if (navBadge) { navBadge.textContent = n > 99 ? '99+' : n; navBadge.classList.toggle('show', n > 0); }
  }

  // ---------- 视图切换 ----------
  function showView(name) {
    curView = name;
    ['board', 'changes', 'history'].forEach((v) => $('view-' + v).classList.toggle('on', v === name));
    $('navBoard').classList.toggle('on', name === 'board');
    $('navChanges').classList.toggle('on', name === 'changes');
    $('navHistory').classList.toggle('on', name === 'history');
    if (name === 'changes') { X.markRead(); updateDot(); renderChanges(); }
    if (name === 'history') { renderHistory(); }
  }

  // ---------- 刷新 ----------
  async function refresh() {
    $('meta').textContent = '加载中…';
    try {
      await X.fetchAndStore();
      showBoard(curBoard);
      updateDot();
      if (curView === 'changes') renderChanges();
    } catch (e) {
      $('meta').textContent = '加载失败：' + e.message + '（请检查网络）';
    }
  }

  // ---------- 自动刷新 ----------
  function applyAuto() {
    const on = $('auto').checked;
    X.setAuto(on);
    if (timer) { clearInterval(timer); timer = null; }
    if (on) {
      timer = setInterval(() => {
        if (curView === 'board') refresh();
        else X.fetchAndStore().then(updateDot).catch(() => {});
      }, 60000);
    }
  }

  // ---------- 历史榜单（复用扩展 history.js 的 period 编码） ----------
  const SEASONS = X.SEASONS.map((name, q) => ({ q: q + 1, name, months: [q * 3 + 1, q * 3 + 2, q * 3 + 3] }));
  const NOW = new Date();
  const CUR_Y = NOW.getFullYear(), CUR_M = NOW.getMonth() + 1, CUR_Q = Math.floor((CUR_M - 1) / 3) + 1;
  const EARLIEST = new Date(2025, 3, 1);
  const yyOf = (y) => String(y).slice(-2);
  const monthPeriod = (m) => 'm' + m;
  const urlFor = (y, p) => X.API_BASE + yyOf(y) + p;
  function quarterDisabled(y, q) { const s = new Date(y, (q - 1) * 3, 1); return s < EARLIEST || s > NOW; }
  function monthAvailable(y, m) { return !(y === CUR_Y && m > CUR_M); }
  const hstate = { year: CUR_Y, quarter: CUR_Q, board: 0 }; // board: 0=季度总榜, 1..n=该季第 n 个可用月份

  function makeBoard(title) {
    const el = document.createElement('div'); el.className = 'board';
    const t = document.createElement('div'); t.className = 'btitle'; t.textContent = title;
    const status = document.createElement('div'); status.className = 'bstatus'; status.textContent = '加载中…';
    const list = document.createElement('div'); list.className = 'brows';
    el.append(t, status, list); return { el, status, list };
  }
  function loadBoard(b, y, period) {
    X.fetchBoard(urlFor(y, period)).then((list) => {
      if (b.status && b.status.parentNode) b.status.remove();
      b.list.innerHTML = '';
      list.forEach((it) => b.list.append(makeRow(it)));
    }).catch((e) => { b.status.textContent = '加载失败：' + e.message; });
  }
  function renderHTabs() {
    const wrap = $('htabs'); wrap.innerHTML = '';
    SEASONS.forEach((s) => {
      const tab = document.createElement('span');
      const dis = quarterDisabled(hstate.year, s.q);
      tab.className = 'htab' + (hstate.quarter === s.q ? ' on' : '') + (dis ? ' disabled' : '');
      tab.textContent = s.name;
      if (!dis) tab.onclick = () => {
        hstate.quarter = s.q;
        hstate.board = 0; // 切季度后回到"季度总榜"
        renderHTabs(); renderBTabs(); renderBoards();
      };
      wrap.append(tab);
    });
  }
  function initYearOnce() {
    const sel = $('year');
    if (sel.dataset.done) return;
    sel.dataset.done = '1';
    for (let y = 2025; y <= CUR_Y; y++) {
      const o = document.createElement('option'); o.value = y; o.textContent = y + '年'; sel.append(o);
    }
    sel.value = hstate.year;
    sel.onchange = () => {
      hstate.year = parseInt(sel.value, 10);
      if (quarterDisabled(hstate.year, hstate.quarter)) {
        const f = SEASONS.find((s) => !quarterDisabled(hstate.year, s.q));
        if (f) hstate.quarter = f.q;
      }
      hstate.board = 0; // 切年份后回到"季度总榜"
      renderHTabs(); renderBTabs(); renderBoards();
    };
  }
  // 板切换标签：季度总榜 / 7月 / 8月 / 9月（只列可用月份），一次只显示一个榜
  function availMonths(y, q) { return SEASONS[q - 1].months.filter((m) => monthAvailable(y, m)); }
  function renderBTabs() {
    const wrap = $('btabs'); wrap.innerHTML = '';
    if (quarterDisabled(hstate.year, hstate.quarter)) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const y = hstate.year, q = hstate.quarter;
    const defs = [{ idx: 0, label: '季度总榜' }].concat(availMonths(y, q).map((m, i) => ({ idx: i + 1, label: m + '月' })));
    // 越界保护：切季度后 board 可能超出新季度可用数
    const maxIdx = defs.length - 1;
    if (hstate.board > maxIdx) hstate.board = maxIdx;
    defs.forEach((d) => {
      const tab = document.createElement('span');
      tab.className = 'btab' + (hstate.board === d.idx ? ' on' : '');
      tab.textContent = d.label;
      tab.onclick = () => { hstate.board = d.idx; renderBTabs(); renderBoards(); };
      wrap.append(tab);
    });
  }
  function renderBoards() {
    const wrap = $('boards'); wrap.innerHTML = '';
    const y = hstate.year, q = hstate.quarter;
    if (quarterDisabled(y, q)) { wrap.innerHTML = '<div class="empty">该季度暂无榜单数据</div>'; return; }
    const season = SEASONS[q - 1];
    const avail = availMonths(y, q);
    // 只渲染当前选中的一个板：0=季度总榜，1..n=月份
    let title, period;
    if (hstate.board <= 0) {
      title = y + '年 ' + season.name + '（Q' + q + '）· 季度总榜';
      period = 'q' + q;
    } else {
      const m = avail[hstate.board - 1];
      title = y + '年' + m + '月';
      period = monthPeriod(m);
    }
    const b = makeBoard(title);
    if (hstate.board <= 0) b.el.classList.add('quarter');
    wrap.append(b.el);
    loadBoard(b, y, period);
  }
  function renderHistory() { initYearOnce(); renderHTabs(); renderBTabs(); renderBoards(); }

  // ---------- 初始化 ----------
  function init() {
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js').catch(() => {}); }
    const b = X.boardNow();
    $('tabMonth').textContent = b.monthLabel;
    $('tabQuarter').textContent = b.quarterLabel;
    if (X.HIDE_QUARTER_IN_FIRST_MONTH && b.isFirst) $('tabQuarter').hidden = true;

    const auto = $('auto'); auto.checked = X.getAuto();
    $('tabMonth').onclick = () => showBoard('month');
    $('tabQuarter').onclick = () => showBoard('quarter');
    auto.onchange = applyAuto;
    $('refresh').onclick = refresh;
    $('navBoard').onclick = () => showView('board');
    $('navChanges').onclick = () => showView('changes');
    $('navHistory').onclick = () => showView('history');
    $('cvClear').onclick = () => {
      if (typeof confirm === 'function' && !confirm('确定清空全部变动记录？此操作不可恢复。')) return;
      X.clearChanges(); renderChanges(); updateDot();
    };

    showBoard('month');
    updateDot();
    applyAuto();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
