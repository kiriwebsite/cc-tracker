/* 刷卡記帳 — 純前端 PWA，資料存在 localStorage */
'use strict';

const KEY = 'cc-tracker-v1';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b', '#1f2937'
];

const CATEGORIES = [
  { id: 'food',      name: '餐飲', emoji: '🍜' },
  { id: 'grocery',   name: '生活', emoji: '🛒' },
  { id: 'transport', name: '交通', emoji: '🚇' },
  { id: 'shopping',  name: '購物', emoji: '🛍️' },
  { id: 'fun',       name: '娛樂', emoji: '🎬' },
  { id: 'bill',      name: '帳單', emoji: '🧾' },
  { id: 'health',    name: '醫療', emoji: '💊' },
  { id: 'travel',    name: '旅遊', emoji: '✈️' },
  { id: 'other',     name: '其他', emoji: '📦' }
];

const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/* ── 資料層 ───────────────────────────────── */

const defaultState = () => ({ cards: [], expenses: [], currency: '$', lastBackupAt: null });

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    return {
      cards: Array.isArray(p.cards) ? p.cards : [],
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      currency: typeof p.currency === 'string' && p.currency ? p.currency : '$',
      lastBackupAt: typeof p.lastBackupAt === 'number' ? p.lastBackupAt : null
    };
  } catch (e) {
    console.error('讀取資料失敗', e);
    return defaultState();
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    toast('儲存失敗，儲存空間可能已滿');
    console.error(e);
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ── 小工具 ───────────────────────────────── */

const $ = sel => document.querySelector(sel);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

const fmt = n => state.currency + Math.round(n).toLocaleString('en-US');

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const monthOf = dateStr => dateStr.slice(0, 7);           // "2026-07"

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function parseDate(s) {                                    // 避免 Safari 時區偏移
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(dateStr) {
  const d = parseDate(dateStr);
  const today = ymd(new Date());
  if (dateStr === today) return '今天';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (dateStr === ymd(yest)) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日 週${WEEKDAYS[d.getDay()]}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ── 檢視狀態 ─────────────────────────────── */

let view = {
  page: 'summary',
  month: new Date().toISOString().slice(0, 7),
  filterCard: 'all',
  editExpense: null,
  editCard: null,
  draft: {}
};

const expensesOfMonth = m => state.expenses.filter(e => monthOf(e.date) === m);

const sumBy = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

/* ── 渲染：總覽 ───────────────────────────── */

function renderSummary() {
  const list = expensesOfMonth(view.month);
  const total = sumBy(list, e => e.amount);

  $('#total-amount').textContent = fmt(total);
  $('#total-sub').textContent = list.length
    ? `${list.length} 筆消費 · 平均每筆 ${fmt(total / list.length)}`
    : '這個月還沒有消費紀錄';

  // 各卡小計
  const box = $('#summary-cards');
  box.textContent = '';

  if (!state.cards.length) {
    const e = el('div', 'empty');
    const b = el('span', 'big'); b.textContent = '💳';
    e.appendChild(b);
    e.appendChild(document.createTextNode('還沒有任何信用卡'));
    e.appendChild(el('br'));
    e.appendChild(document.createTextNode('先到「卡片」頁新增一張吧'));
    box.appendChild(e);
    renderCategories([], 0);
    return;
  }

  const rows = state.cards.map(c => ({
    card: c,
    amt: sumBy(list.filter(e => e.cardId === c.id), e => e.amount),
    cnt: list.filter(e => e.cardId === c.id).length
  })).sort((a, b) => b.amt - a.amt);

  const max = Math.max(...rows.map(r => r.amt), 1);

  rows.forEach(r => {
    const item = el('div', 'cs-item');

    const dot = el('div', 'cs-dot');
    dot.style.background = r.card.color;
    item.appendChild(dot);

    const mid = el('div', 'cs-mid');
    const name = el('div', 'cs-name');
    name.textContent = r.card.name;
    const meta = el('div', 'cs-meta');
    meta.textContent = r.cnt
      ? `${r.cnt} 筆 · 佔 ${total ? Math.round(r.amt / total * 100) : 0}%`
      : '本月未使用';
    const bar = el('div', 'cs-bar');
    const fill = el('i');
    fill.style.width = (r.amt / max * 100) + '%';
    fill.style.background = r.card.color;
    bar.appendChild(fill);
    mid.append(name, meta, bar);
    item.appendChild(mid);

    const amt = el('div', 'cs-amt');
    amt.textContent = fmt(r.amt);
    item.appendChild(amt);

    box.appendChild(item);
  });

  renderCategories(list, total);
}

function renderCategories(list, total) {
  const box = $('#cat-breakdown');
  box.textContent = '';
  const has = list.length > 0;
  $('#cat-title').hidden = !has;
  if (!has) return;

  const map = new Map();
  list.forEach(e => map.set(e.category, (map.get(e.category) || 0) + e.amount));

  [...map.entries()].sort((a, b) => b[1] - a[1]).forEach(([cid, amt]) => {
    const c = catOf(cid);
    const row = el('div', 'cat-row');
    const em = el('span', 'cat-emoji'); em.textContent = c.emoji;
    const nm = el('span', 'cat-name'); nm.textContent = c.name;
    const am = el('span', 'cat-amt'); am.textContent = fmt(amt);
    const pc = el('span', 'cat-pct'); pc.textContent = (total ? Math.round(amt / total * 100) : 0) + '%';
    row.append(em, nm, am, pc);
    box.appendChild(row);
  });
}

/* ── 渲染：明細 ───────────────────────────── */

function renderList() {
  // 篩選列
  const fr = $('#filter-row');
  fr.textContent = '';
  const mk = (id, label) => {
    const b = el('button', 'f-chip' + (view.filterCard === id ? ' on' : ''));
    b.textContent = label;
    b.onclick = () => { view.filterCard = id; renderList(); };
    return b;
  };
  fr.appendChild(mk('all', '全部'));
  state.cards.forEach(c => fr.appendChild(mk(c.id, c.name)));

  const box = $('#expense-list');
  box.textContent = '';

  let list = expensesOfMonth(view.month);
  if (view.filterCard !== 'all') list = list.filter(e => e.cardId === view.filterCard);

  if (!list.length) {
    const e = el('div', 'empty');
    const b = el('span', 'big'); b.textContent = '🧾';
    e.appendChild(b);
    e.appendChild(document.createTextNode('這個月沒有符合的紀錄'));
    e.appendChild(el('br'));
    e.appendChild(document.createTextNode('按下方的 ＋ 記一筆'));
    box.appendChild(e);
    return;
  }

  // 依日期分組（新到舊）
  const days = new Map();
  list.forEach(e => {
    if (!days.has(e.date)) days.set(e.date, []);
    days.get(e.date).push(e);
  });

  [...days.keys()].sort().reverse().forEach(date => {
    const items = days.get(date).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const group = el('div', 'day-group');
    const head = el('div', 'day-head');
    const l = el('span'); l.textContent = dayLabel(date);
    const r = el('span'); r.textContent = fmt(sumBy(items, x => x.amount));
    head.append(l, r);
    group.appendChild(head);

    const wrap = el('div', 'items');
    items.forEach(e => {
      const card = state.cards.find(c => c.id === e.cardId);
      const c = catOf(e.category);

      const row = el('button', 'ex-row');
      row.type = 'button';

      const ico = el('div', 'ex-ico');
      ico.textContent = c.emoji;
      ico.style.background = (card ? card.color : '#94a3b8') + '22';

      const mid = el('div', 'ex-mid');
      const t1 = el('div', 'ex-cat');
      t1.textContent = e.note ? e.note : c.name;
      const t2 = el('div', 'ex-sub');
      t2.textContent = [card ? card.name : '（已刪除的卡）', e.note ? c.name : null]
        .filter(Boolean).join(' · ');
      mid.append(t1, t2);

      const amt = el('div', 'ex-amt');
      amt.textContent = fmt(e.amount);

      row.append(ico, mid, amt);
      row.onclick = () => openExpenseSheet(e);
      wrap.appendChild(row);
    });

    group.appendChild(wrap);
    box.appendChild(group);
  });
}

/* ── 渲染：卡片管理 ───────────────────────── */

function renderCards() {
  const box = $('#card-manage');
  box.textContent = '';

  if (!state.cards.length) {
    const e = el('div', 'empty');
    const b = el('span', 'big'); b.textContent = '💳';
    e.appendChild(b);
    e.appendChild(document.createTextNode('還沒有信用卡'));
    e.appendChild(el('br'));
    e.appendChild(document.createTextNode('新增後就能開始記帳'));
    box.appendChild(e);
    return;
  }

  state.cards.forEach(c => {
    const monthAmt = sumBy(expensesOfMonth(view.month).filter(e => e.cardId === c.id), e => e.amount);

    const btn = el('button', 'cc');
    btn.type = 'button';
    btn.style.background = `linear-gradient(140deg, ${c.color}, ${shade(c.color, -28)})`;

    const nm = el('div', 'cc-name');
    nm.textContent = c.name;

    const bot = el('div', 'cc-bottom');
    const l4 = el('div', 'cc-last4');
    l4.textContent = c.last4 ? '•••• ' + c.last4 : '••••';
    const tot = el('div', 'cc-total');
    tot.appendChild(document.createTextNode('本月'));
    const bb = el('b');
    bb.textContent = fmt(monthAmt);
    tot.appendChild(bb);
    bot.append(l4, tot);

    btn.append(nm, bot);
    btn.onclick = () => openCardSheet(c);
    box.appendChild(btn);
  });
}

// 讓漸層有深淺變化
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const cl = v => Math.max(0, Math.min(255, v));
  const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ── 渲染：全部 ───────────────────────────── */

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return `${y} 年 ${Number(mo)} 月`;
}

function render() {
  const label = monthLabel(view.month);
  $('#mo-label').textContent = label;
  $('#mo-label2').textContent = label;

  ['summary', 'list', 'cards', 'settings'].forEach(p => {
    $('#page-' + p).hidden = p !== view.page;
  });
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === view.page);
  });

  if (view.page === 'summary') renderSummary();
  if (view.page === 'list') renderList();
  if (view.page === 'cards') renderCards();
  if (view.page === 'settings') {
    $('#sel-currency').value = state.currency;
    $('#stat-line').textContent =
      `目前共 ${state.cards.length} 張卡、${state.expenses.length} 筆消費紀錄。`;
    renderBackupStatus();
  }
}

/* ── 消費表單 ─────────────────────────────── */

function openExpenseSheet(expense) {
  if (!state.cards.length) {
    toast('請先新增一張信用卡');
    go('cards');
    return;
  }

  view.editExpense = expense || null;
  const d = expense
    ? { cardId: expense.cardId, category: expense.category }
    : { cardId: lastUsedCardId(), category: 'food' };
  view.draft = d;

  $('#exp-title').textContent = expense ? '編輯消費' : '記一筆消費';
  $('#amount-cur').textContent = state.currency;
  $('#exp-amount').value = expense ? String(expense.amount) : '';
  $('#exp-date').value = expense ? expense.date : ymd(new Date());
  $('#exp-note').value = expense ? (expense.note || '') : '';
  $('#btn-del-expense').hidden = !expense;
  $('#exp-err').hidden = true;

  // 卡片選項
  const cb = $('#exp-cards');
  cb.textContent = '';
  state.cards.forEach(c => {
    const b = el('button', 'chip' + (c.id === d.cardId ? ' on' : ''));
    b.type = 'button';
    const dot = el('span', 'dot');
    dot.style.background = c.color;
    const tx = el('span');
    tx.textContent = c.name;
    b.append(dot, tx);
    b.onclick = () => {
      view.draft.cardId = c.id;
      [...cb.children].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    };
    cb.appendChild(b);
  });

  // 分類選項
  const tb = $('#exp-cats');
  tb.textContent = '';
  CATEGORIES.forEach(c => {
    const b = el('button', 'chip' + (c.id === d.category ? ' on' : ''));
    b.type = 'button';
    b.textContent = c.emoji + ' ' + c.name;
    b.onclick = () => {
      view.draft.category = c.id;
      [...tb.children].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    };
    tb.appendChild(b);
  });

  openSheet('#sheet-expense');
  setTimeout(() => $('#exp-amount').focus(), 340);
}

function lastUsedCardId() {
  const last = [...state.expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (last && state.cards.some(c => c.id === last.cardId)) return last.cardId;
  return state.cards[0].id;
}

$('#form-expense').addEventListener('submit', ev => {
  ev.preventDefault();
  const raw = $('#exp-amount').value.trim().replace(/[,\s]/g, '');
  const amount = Number(raw);
  const err = $('#exp-err');

  if (!raw || !isFinite(amount) || amount <= 0) {
    err.textContent = '請輸入大於 0 的金額';
    err.hidden = false;
    $('#exp-amount').focus();
    return;
  }
  const date = $('#exp-date').value || ymd(new Date());

  if (view.editExpense) {
    Object.assign(view.editExpense, {
      amount,
      cardId: view.draft.cardId,
      category: view.draft.category,
      date,
      note: $('#exp-note').value.trim()
    });
    toast('已更新');
  } else {
    state.expenses.push({
      id: uid(),
      amount,
      cardId: view.draft.cardId,
      category: view.draft.category,
      date,
      note: $('#exp-note').value.trim(),
      createdAt: Date.now()
    });
    toast('已記錄 ' + fmt(amount));
  }

  save();
  view.month = monthOf(date);          // 跳到該筆所屬月份，免得存完看不到
  closeSheets();
  render();
});

$('#btn-del-expense').onclick = () => {
  if (!view.editExpense) return;
  if (!confirm('確定刪除這筆消費？')) return;
  state.expenses = state.expenses.filter(e => e.id !== view.editExpense.id);
  save();
  closeSheets();
  render();
  toast('已刪除');
};

/* ── 卡片表單 ─────────────────────────────── */

function openCardSheet(card) {
  view.editCard = card || null;
  view.draft = { color: card ? card.color : COLORS[state.cards.length % COLORS.length] };

  $('#card-title').textContent = card ? '編輯信用卡' : '新增信用卡';
  $('#card-name').value = card ? card.name : '';
  $('#card-last4').value = card ? (card.last4 || '') : '';
  $('#btn-del-card').hidden = !card;
  $('#card-err').hidden = true;

  const sw = $('#card-colors');
  sw.textContent = '';
  COLORS.forEach(col => {
    const b = el('button', 'sw' + (col === view.draft.color ? ' on' : ''));
    b.type = 'button';
    b.style.background = col;
    b.setAttribute('aria-label', '顏色 ' + col);
    b.onclick = () => {
      view.draft.color = col;
      [...sw.children].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      updateCardPreview();
    };
    sw.appendChild(b);
  });

  updateCardPreview();
  openSheet('#sheet-card');
  setTimeout(() => $('#card-name').focus(), 340);
}

function updateCardPreview() {
  const p = $('#card-preview');
  const col = view.draft.color;
  p.style.background = `linear-gradient(140deg, ${col}, ${shade(col, -28)})`;
  p.querySelector('.cp-name').textContent = $('#card-name').value.trim() || '卡片名稱';
  const l4 = $('#card-last4').value.trim();
  p.querySelector('.cp-last4').textContent = l4 ? '•••• ' + l4 : '•••• ••••';
}

$('#card-name').addEventListener('input', updateCardPreview);
$('#card-last4').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  updateCardPreview();
});

$('#form-card').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('#card-name').value.trim();
  const err = $('#card-err');

  if (!name) {
    err.textContent = '請輸入卡片名稱';
    err.hidden = false;
    $('#card-name').focus();
    return;
  }

  const last4 = $('#card-last4').value.trim();

  if (view.editCard) {
    Object.assign(view.editCard, { name, last4, color: view.draft.color });
    toast('已更新');
  } else {
    state.cards.push({ id: uid(), name, last4, color: view.draft.color, createdAt: Date.now() });
    toast('已新增 ' + name);
  }

  save();
  closeSheets();
  render();
});

$('#btn-del-card').onclick = () => {
  if (!view.editCard) return;
  const n = state.expenses.filter(e => e.cardId === view.editCard.id).length;
  const msg = n
    ? `這張卡有 ${n} 筆消費紀錄，一併刪除？此動作無法復原。`
    : '確定刪除這張卡？';
  if (!confirm(msg)) return;

  state.expenses = state.expenses.filter(e => e.cardId !== view.editCard.id);
  state.cards = state.cards.filter(c => c.id !== view.editCard.id);
  if (view.filterCard === view.editCard.id) view.filterCard = 'all';
  save();
  closeSheets();
  render();
  toast('已刪除');
};

/* ── 面板開關 ─────────────────────────────── */

function openSheet(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';   // 面板開著時別讓背景跟著捲
}

function closeSheets() {
  $('#sheet-expense').hidden = true;
  $('#sheet-card').hidden = true;
  document.body.style.overflow = '';
  view.editExpense = null;
  view.editCard = null;
}

document.querySelectorAll('[data-close]').forEach(n => n.addEventListener('click', closeSheets));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

/* ── 導覽 ─────────────────────────────────── */

function go(page) {
  view.page = page;
  render();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => go(t.dataset.page);
});

$('#btn-add-expense').onclick = () => openExpenseSheet(null);
$('#btn-add-card').onclick = () => openCardSheet(null);

function shiftMonth(delta) {
  const [y, m] = view.month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  view.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  render();
}

$('#mo-prev').onclick = $('#mo-prev2').onclick = () => shiftMonth(-1);
$('#mo-next').onclick = $('#mo-next2').onclick = () => shiftMonth(1);
$('#mo-label').onclick = $('#mo-label2').onclick = () => {
  view.month = new Date().toISOString().slice(0, 7);
  render();
  toast('已回到本月');
};

/* ── 設定 ─────────────────────────────────── */

$('#sel-currency').addEventListener('change', e => {
  state.currency = e.target.value.trim() || '$';
  e.target.value = state.currency;
  save();
  render();
});

function renderBackupStatus() {
  const n = $('#backup-status');
  n.className = 'hint';

  if (!state.expenses.length) { n.textContent = ''; return; }

  if (!state.lastBackupAt) {
    n.textContent = '⚠️ 還沒備份過。資料只存在這支手機裡，建議現在就匯出一份。';
    n.className = 'hint warn';
    return;
  }

  const days = Math.floor((Date.now() - state.lastBackupAt) / 86400000);
  const label = days === 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`;
  n.textContent = '上次備份：' + label;
  if (days >= 30) {
    n.textContent += '，距離上次有點久了，建議再匯出一份。';
    n.className = 'hint warn';
  }
}

function markBackedUp() {
  state.lastBackupAt = Date.now();
  save();
  render();
}

$('#btn-export').onclick = async () => {
  const name = `刷卡記帳備份-${ymd(new Date())}.json`;
  const json = JSON.stringify(state, null, 2);

  // iOS 加到主畫面後，<a download> 常常整個沒反應。
  // 先試系統分享單，使用者可以直接存進「檔案」App／iCloud 雲碟。
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      markBackedUp();
      toast('已匯出備份');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;      // 使用者自己在分享單按取消
    console.warn('分享失敗，改用下載', e);
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markBackedUp();
  toast('已匯出備份');
};

$('#btn-import').onclick = () => $('#file-import').click();

$('#file-import').addEventListener('change', ev => {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      if (!Array.isArray(p.cards) || !Array.isArray(p.expenses)) throw new Error('格式不符');
      if (!confirm(`匯入後會覆蓋現有資料（${p.cards.length} 張卡、${p.expenses.length} 筆紀錄），確定？`)) return;
      state = {
        cards: p.cards,
        expenses: p.expenses,
        currency: typeof p.currency === 'string' && p.currency ? p.currency : '$'
      };
      save();
      render();
      toast('匯入完成');
    } catch (e) {
      toast('檔案格式不正確');
      console.error(e);
    }
  };
  reader.readAsText(f);
  ev.target.value = '';
});

$('#btn-wipe').onclick = () => {
  if (!confirm('將清除所有卡片與消費紀錄，且無法復原。確定？')) return;
  if (!confirm('真的確定？建議先匯出備份。')) return;
  state = defaultState();
  save();
  view.filterCard = 'all';
  render();
  toast('已清除');
};

/* ── 啟動 ─────────────────────────────────── */

render();

// 要求「持久化儲存」：拿到的話，瀏覽器不會為了清空間而自動砍掉這個網站的資料。
// Safari 只在使用者把網站加到主畫面／常用時才會給，拿不到也不影響功能。
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted()
    .then(already => already || navigator.storage.persist())
    .then(ok => console.info('持久化儲存：' + (ok ? '已取得' : '未取得')))
    .catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 註冊失敗', e));
  });
}
