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
    const L = $('colL'), R = $('colR');
    L.innerHTML = ''; R.innerHTML = '';
    (list || []).forEach((it, i) => { (i < 10 ? L : R).append(makeRow(it)); });
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
  const hstate = { year: CUR_Y, quarter: CUR_Q };

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
      if (!dis) tab.onclick = () => { hstate.quarter = s.q; renderHTabs(); renderBoards(); };
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
      renderHTabs(); renderBoards();
    };
  }
  function renderBoards() {
    const wrap = $('boards'); wrap.innerHTML = '';
    const y = hstate.year, q = hstate.quarter;
    if (quarterDisabled(y, q)) { wrap.innerHTML = '<div class="empty">该季度暂无榜单数据</div>'; return; }
    const season = SEASONS[q - 1];
    const qBoard = makeBoard(y + '年 ' + season.name + '（Q' + q + '）· 季度总榜');
    qBoard.el.classList.add('quarter');
    wrap.append(qBoard.el);
    const avail = season.months.filter((m) => monthAvailable(y, m));
    avail.forEach((m) => { const mb = makeBoard(y + '年' + m + '月'); wrap.append(mb.el); });
    loadBoard(qBoard, y, 'q' + q);
    avail.forEach((m, idx) => {
      const el = wrap.children[idx + 1];
      loadBoard({ el, status: el.querySelector('.bstatus'), list: el.querySelector('.brows') }, y, monthPeriod(m));
    });
  }
  function renderHistory() { initYearOnce(); renderHTabs(); renderBoards(); }

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
