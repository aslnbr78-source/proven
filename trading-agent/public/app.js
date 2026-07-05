// Frontend for the auto trading agent.
// Talks to the Express backend over REST, refreshes state on a short interval,
// and renders KPIs, charts, and the trade log.

const $ = (id) => document.getElementById(id);

const state = {
  meta: null,       // { symbols, strategies }
  server: null,     // last state fetched from the server
  editing: null,    // in-progress config edits
  charts: {},
  refreshTimer: null,
};

// ---- API helpers -----------------------------------------------------------

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

// ---- Formatting ------------------------------------------------------------

const fmtUsd = (n, digits = 2) => (typeof n === 'number' && isFinite(n))
  ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

const fmtNum = (n, digits = 4) => (typeof n === 'number' && isFinite(n))
  ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

const fmtPct = (n, digits = 2) => (typeof n === 'number' && isFinite(n))
  ? `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
  : '—';

const fmtTime = (t) => {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// ---- Config panel ----------------------------------------------------------

function renderConfigOptions() {
  const symSel = $('cfgSymbol');
  symSel.innerHTML = state.meta.symbols.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  const stSel = $('cfgStrategy');
  stSel.innerHTML = state.meta.strategies.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
}

function renderStrategyParams(strategyId, currentParams) {
  const wrap = $('cfgStrategyParams');
  const strat = state.meta.strategies.find(s => s.id === strategyId);
  $('cfgStrategyDesc').textContent = strat?.description || '';
  if (!strat || !strat.paramSchema?.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = strat.paramSchema.map(p => {
    const val = currentParams?.[p.key] ?? strat.defaultParams[p.key] ?? '';
    const step = p.step ?? (p.type === 'int' ? 1 : 0.01);
    return `
      <label class="block col-span-1">
        <span class="text-xs text-muted">${escapeHtml(p.label)}</span>
        <input data-param="${p.key}" type="number"
               value="${val}"
               ${p.min != null ? `min="${p.min}"` : ''}
               ${p.max != null ? `max="${p.max}"` : ''}
               step="${step}"
               class="mt-1 w-full bg-panel2 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
      </label>`;
  }).join('');
}

function fillConfigFromServer(server) {
  const cfg = server.config;
  $('cfgSymbol').value = cfg.symbol;
  $('cfgPriceSource').value = cfg.priceSource;
  $('cfgStrategy').value = cfg.strategy;
  $('cfgTickSec').value = Math.round(cfg.tickIntervalMs / 1000);
  $('cfgTradeFraction').value = cfg.tradeFraction;
  $('cfgStartingCash').value = cfg.startingCash;
  renderStrategyParams(cfg.strategy, cfg.strategyParams);
}

function collectConfigPatch() {
  const patch = {
    symbol: $('cfgSymbol').value,
    priceSource: $('cfgPriceSource').value,
    strategy: $('cfgStrategy').value,
    tickIntervalMs: Math.max(5, Number($('cfgTickSec').value) || 15) * 1000,
    tradeFraction: Math.min(1, Math.max(0.01, Number($('cfgTradeFraction').value) || 1)),
    startingCash: Math.max(1, Number($('cfgStartingCash').value) || 10000),
  };
  const params = {};
  document.querySelectorAll('#cfgStrategyParams [data-param]').forEach(el => {
    params[el.dataset.param] = Number(el.value);
  });
  patch.strategyParams = params;
  return patch;
}

// ---- Rendering -------------------------------------------------------------

function renderStatus(server) {
  const badge = $('statusBadge');
  const err = server.lastError;
  let cls = 'status-stopped', text = 'stopped';
  if (err) { cls = 'status-error'; text = 'error'; }
  else if (server.status === 'running')  { cls = 'status-running';  text = 'running'; }
  else if (server.status === 'starting') { cls = 'status-starting'; text = 'starting'; }
  badge.className = `px-3 py-1 rounded-full text-xs font-semibold ${cls}`;
  badge.textContent = text;
  $('lastTickAt').textContent = fmtTime(server.lastTickAt);

  const errBox = $('errorBox');
  if (err) { errBox.classList.remove('hidden'); errBox.textContent = err; }
  else     { errBox.classList.add('hidden');   errBox.textContent = ''; }
}

function renderKPIs(server) {
  const d = server.derived;
  const p = server.portfolio;
  $('kpiEquity').textContent = fmtUsd(d.equity);
  const delta = d.equity - p.startingCash;
  $('kpiEquityDelta').textContent = `${delta >= 0 ? '+' : ''}${fmtUsd(delta)} vs. ${fmtUsd(p.startingCash)}`;
  $('kpiEquityDelta').className = `text-xs mt-0.5 ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  $('kpiPnl').textContent = `${d.totalPnl >= 0 ? '+' : ''}${fmtUsd(d.totalPnl)}`;
  $('kpiPnl').className = `text-2xl font-semibold tabular-nums mt-1 ${d.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  $('kpiPnlPct').textContent = fmtPct(d.pnlPct);
  $('kpiPnlPct').className = `text-xs mt-0.5 ${d.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

  $('kpiCash').textContent = fmtUsd(p.cash);
  if (p.position.qty > 0) {
    $('kpiPosition').textContent = `Position: ${fmtNum(p.position.qty, 6)} @ ${fmtUsd(p.position.avgPrice)} (unreal ${d.unrealizedPnl >= 0 ? '+' : ''}${fmtUsd(d.unrealizedPnl)})`;
    $('kpiPosition').className = `text-xs mt-0.5 ${d.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  } else {
    $('kpiPosition').textContent = 'no position';
    $('kpiPosition').className = 'text-xs mt-0.5 text-muted';
  }

  $('kpiPrice').textContent = d.price ? fmtUsd(d.price, d.price < 1 ? 4 : 2) : '—';
  const sym = state.meta.symbols.find(s => s.id === server.config.symbol);
  $('kpiSymbol').textContent = sym ? sym.label : server.config.symbol;
  $('priceMeta').textContent = `${sym ? sym.label : server.config.symbol} • ${server.config.priceSource === 'coingecko' ? 'CoinGecko' : 'synthetic'}`;
}

function renderTrades(server) {
  const tb = $('tradesBody');
  const trades = [...server.trades].reverse();
  $('tradeCount').textContent = server.trades.length;
  if (!trades.length) { tb.innerHTML = ''; $('tradesEmpty').classList.remove('hidden'); return; }
  $('tradesEmpty').classList.add('hidden');
  tb.innerHTML = trades.slice(0, 100).map(t => {
    const pnl = typeof t.pnl === 'number' ? `${t.pnl >= 0 ? '+' : ''}${fmtUsd(t.pnl)}` : '—';
    const pnlCls = typeof t.pnl === 'number' ? (t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-muted';
    const sideCls = t.side === 'BUY' ? 'text-emerald-300 bg-emerald-500/10' : 'text-rose-300 bg-rose-500/10';
    return `
      <tr>
        <td class="py-2 pr-3 text-muted whitespace-nowrap">${fmtTime(t.t)}</td>
        <td class="py-2 pr-3"><span class="px-2 py-0.5 rounded text-xs font-semibold ${sideCls}">${t.side}</span></td>
        <td class="py-2 pr-3 text-right tabular-nums">${fmtNum(t.qty, 6)}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${fmtUsd(t.price, t.price < 1 ? 4 : 2)}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${fmtUsd(t.value)}</td>
        <td class="py-2 pr-3 text-right tabular-nums ${pnlCls}">${pnl}</td>
        <td class="py-2 text-muted">${escapeHtml(t.reason || '')}</td>
      </tr>`;
  }).join('');
}

// ---- Charts ----------------------------------------------------------------

function ensureCharts() {
  if (state.charts.price) return;
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: true, labels: { color: '#cbd5e1', boxWidth: 10 } },
      tooltip: { backgroundColor: '#0b0f17', borderColor: '#1f2937', borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#1f2937' } },
    },
  };
  state.charts.price = new Chart($('priceChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Price', data: [], borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,.10)', borderWidth: 2, pointRadius: 0, tension: 0.15, fill: true },
        { label: 'Buys',  data: [], borderColor: 'transparent', backgroundColor: '#10b981', pointRadius: 6, pointStyle: 'triangle', showLine: false },
        { label: 'Sells', data: [], borderColor: 'transparent', backgroundColor: '#ef4444', pointRadius: 6, pointStyle: 'rectRot', showLine: false },
      ],
    },
    options: common,
  });
  state.charts.equity = new Chart($('equityChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Equity', data: [], borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,.10)', borderWidth: 2, pointRadius: 0, tension: 0.15, fill: true },
      ],
    },
    options: { ...common, plugins: { ...common.plugins, legend: { display: false } } },
  });
}

function renderCharts(server) {
  ensureCharts();
  const ph = server.priceHistory || [];
  const labels = ph.map(p => fmtTime(p.t));
  const prices = ph.map(p => p.price);
  const priceByT = new Map(ph.map(p => [p.t, p.price]));

  const buys = ph.map(p => null);
  const sells = ph.map(p => null);
  // Place trade markers on the nearest price-history point.
  for (const t of server.trades) {
    let idx = -1, best = Infinity;
    for (let i = 0; i < ph.length; i++) {
      const d = Math.abs(ph[i].t - t.t);
      if (d < best) { best = d; idx = i; }
    }
    if (idx >= 0) {
      if (t.side === 'BUY') buys[idx] = t.price;
      else sells[idx] = t.price;
    }
  }

  const pc = state.charts.price;
  pc.data.labels = labels;
  pc.data.datasets[0].data = prices;
  pc.data.datasets[1].data = buys;
  pc.data.datasets[2].data = sells;
  pc.update('none');

  const eh = server.portfolio.equityHistory || [];
  const ec = state.charts.equity;
  ec.data.labels = eh.map(p => fmtTime(p.t));
  ec.data.datasets[0].data = eh.map(p => p.equity);
  ec.update('none');
}

// ---- Main refresh ----------------------------------------------------------

async function refresh() {
  try {
    const s = await api('/api/state');
    state.server = s;
    renderStatus(s);
    renderKPIs(s);
    renderTrades(s);
    renderCharts(s);
  } catch (err) {
    console.error('refresh failed:', err);
  }
}

function scheduleRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refresh, 2500);
}

// ---- Event wiring ----------------------------------------------------------

function wireEvents() {
  $('btnStart').addEventListener('click', async () => {
    try { await api('/api/config', { method: 'POST', body: JSON.stringify(collectConfigPatch()) }); }
    catch (err) { showError(err.message); return; }
    try { await api('/api/start', { method: 'POST' }); showError(null); refresh(); }
    catch (err) { showError(err.message); }
  });
  $('btnStop').addEventListener('click', async () => {
    try { await api('/api/stop', { method: 'POST' }); showError(null); refresh(); }
    catch (err) { showError(err.message); }
  });
  $('btnSave').addEventListener('click', async () => {
    try { await api('/api/config', { method: 'POST', body: JSON.stringify(collectConfigPatch()) }); showError(null); refresh(); }
    catch (err) { showError(err.message); }
  });
  $('btnReset').addEventListener('click', async () => {
    if (!confirm('Reset the portfolio? This clears cash, position, trade log, and price history.')) return;
    try { await api('/api/reset', { method: 'POST' }); showError(null); refresh(); }
    catch (err) { showError(err.message); }
  });
  $('cfgStrategy').addEventListener('change', () => {
    const s = state.meta.strategies.find(x => x.id === $('cfgStrategy').value);
    renderStrategyParams(s.id, s.defaultParams);
  });
}

function showError(msg) {
  const box = $('errorBox');
  if (!msg) { box.classList.add('hidden'); box.textContent = ''; return; }
  box.classList.remove('hidden'); box.textContent = msg;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Bootstrap -------------------------------------------------------------

(async function main() {
  try {
    state.meta = await api('/api/meta');
    renderConfigOptions();
    const s = await api('/api/state');
    state.server = s;
    fillConfigFromServer(s);
    wireEvents();
    renderStatus(s);
    renderKPIs(s);
    renderTrades(s);
    renderCharts(s);
    scheduleRefresh();
  } catch (err) {
    console.error('init failed:', err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="p-4 m-4 rounded bg-rose-900/30 text-rose-200 border border-rose-800">Failed to initialise: ${escapeHtml(err.message)}</div>`);
  }
})();
