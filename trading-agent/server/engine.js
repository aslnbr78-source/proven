// The trading engine: owns portfolio state, runs the tick loop, and executes
// paper trades based on the active strategy.

import { STRATEGIES, evaluate, defaultParams } from './strategies.js';
import { SUPPORTED_SYMBOLS, getPrice, bootstrapHistory } from './marketData.js';
import { loadState, saveStateAsync } from './storage.js';

const MAX_HISTORY = 500;
const MIN_TICK_MS = 5_000;
const MAX_TICK_MS = 60 * 60_000;

const DEFAULT_STATE = {
  config: {
    running: false,
    symbol: 'bitcoin',
    strategy: 'sma_crossover',
    strategyParams: defaultParams('sma_crossover'),
    tickIntervalMs: 15_000,
    tradeFraction: 1.0, // fraction of cash to deploy on a BUY signal
    priceSource: 'coingecko', // 'coingecko' | 'synthetic'
    startingCash: 10_000,
  },
  portfolio: {
    startingCash: 10_000,
    cash: 10_000,
    position: { qty: 0, avgPrice: 0 },
    equityHistory: [],
    realizedPnl: 0,
  },
  trades: [],
  priceHistory: [],
  lastTickAt: null,
  lastPrice: null,
  lastError: null,
  status: 'stopped',
  createdAt: Date.now(),
};

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

export class TradingEngine {
  constructor() {
    const loaded = loadState();
    this.state = loaded ? mergeDefaults(loaded) : deepClone(DEFAULT_STATE);
    this.timer = null;
    this._ticking = false;
    if (this.state.config.running) {
      // Resume the loop on restart.
      this._scheduleNext(500);
    }
  }

  getState() { return this.state; }

  // ---- Public control API ---------------------------------------------------

  async updateConfig(patch) {
    const cfg = this.state.config;
    if (patch.symbol !== undefined) {
      if (!SUPPORTED_SYMBOLS.find(s => s.id === patch.symbol)) {
        throw new Error(`Unsupported symbol: ${patch.symbol}`);
      }
      if (patch.symbol !== cfg.symbol) {
        cfg.symbol = patch.symbol;
        // Symbol changed -> reset price history and any open position must be closed first.
        this.state.priceHistory = [];
        if (this.state.portfolio.position.qty > 0 && this.state.lastPrice) {
          this._closePosition(this.state.lastPrice, 'symbol change: liquidate');
        }
      }
    }
    if (patch.strategy !== undefined) {
      if (!STRATEGIES[patch.strategy]) throw new Error(`Unknown strategy: ${patch.strategy}`);
      if (patch.strategy !== cfg.strategy) {
        cfg.strategy = patch.strategy;
        cfg.strategyParams = defaultParams(patch.strategy);
      }
    }
    if (patch.strategyParams && typeof patch.strategyParams === 'object') {
      cfg.strategyParams = { ...cfg.strategyParams, ...patch.strategyParams };
    }
    if (patch.tickIntervalMs !== undefined) {
      const n = Number(patch.tickIntervalMs);
      if (!Number.isFinite(n)) throw new Error('Invalid tickIntervalMs');
      cfg.tickIntervalMs = Math.min(MAX_TICK_MS, Math.max(MIN_TICK_MS, Math.floor(n)));
    }
    if (patch.tradeFraction !== undefined) {
      const n = Number(patch.tradeFraction);
      if (!Number.isFinite(n) || n <= 0 || n > 1) throw new Error('tradeFraction must be in (0, 1]');
      cfg.tradeFraction = n;
    }
    if (patch.priceSource !== undefined) {
      if (!['coingecko', 'synthetic'].includes(patch.priceSource)) {
        throw new Error('priceSource must be "coingecko" or "synthetic"');
      }
      if (patch.priceSource !== cfg.priceSource) {
        cfg.priceSource = patch.priceSource;
        this.state.priceHistory = [];
      }
    }
    if (patch.startingCash !== undefined && !cfg.running) {
      const n = Number(patch.startingCash);
      if (!Number.isFinite(n) || n <= 0) throw new Error('startingCash must be positive');
      cfg.startingCash = n;
      // Only takes effect at next reset.
    }
    this._persist();
    return this.state;
  }

  async start() {
    if (this.state.config.running) return this.state;
    this.state.config.running = true;
    this.state.status = 'starting';
    this.state.lastError = null;
    // If history is empty, bootstrap it immediately for the current symbol.
    if (this.state.priceHistory.length < 30) {
      try {
        const history = await bootstrapHistory(this.state.config.symbol, this.state.config.priceSource);
        this.state.priceHistory = history.slice(-MAX_HISTORY);
        this.state.lastPrice = history.at(-1)?.price ?? null;
      } catch (err) {
        this.state.lastError = `bootstrap: ${err.message}`;
      }
    }
    this.state.status = 'running';
    this._persist();
    this._scheduleNext(100);
    return this.state;
  }

  async stop() {
    this.state.config.running = false;
    this.state.status = 'stopped';
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this._persist();
    return this.state;
  }

  async resetPortfolio() {
    const wasRunning = this.state.config.running;
    await this.stop();
    const cash = this.state.config.startingCash;
    this.state.portfolio = {
      startingCash: cash,
      cash,
      position: { qty: 0, avgPrice: 0 },
      equityHistory: [],
      realizedPnl: 0,
    };
    this.state.trades = [];
    this.state.priceHistory = [];
    this.state.lastPrice = null;
    this.state.lastError = null;
    this.state.lastTickAt = null;
    this._persist();
    if (wasRunning) await this.start();
    return this.state;
  }

  // ---- Tick loop ------------------------------------------------------------

  _scheduleNext(delayMs) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.state.config.running) return;
    this.timer = setTimeout(() => this._tick(), delayMs);
  }

  async _tick() {
    if (this._ticking) { this._scheduleNext(1000); return; }
    this._ticking = true;
    try {
      const price = await getPrice(this.state.config.symbol, this.state.config.priceSource);
      const now = Date.now();
      this.state.lastPrice = price;
      this.state.lastTickAt = now;
      this.state.lastError = null;

      // Append price history.
      this.state.priceHistory.push({ t: now, price });
      if (this.state.priceHistory.length > MAX_HISTORY) {
        this.state.priceHistory.splice(0, this.state.priceHistory.length - MAX_HISTORY);
      }

      // Evaluate strategy.
      const closes = this.state.priceHistory.map(p => p.price);
      const hasPos = this.state.portfolio.position.qty > 0;
      const signal = evaluate(this.state.config.strategy, closes, this.state.config.strategyParams, hasPos);

      if (signal.action === 'BUY' && !hasPos) {
        this._openPosition(price, signal.reason);
      } else if (signal.action === 'SELL' && hasPos) {
        this._closePosition(price, signal.reason);
      }

      // Equity mark-to-market.
      const equity = this.state.portfolio.cash + this.state.portfolio.position.qty * price;
      this.state.portfolio.equityHistory.push({ t: now, equity, price });
      if (this.state.portfolio.equityHistory.length > MAX_HISTORY) {
        this.state.portfolio.equityHistory.splice(0, this.state.portfolio.equityHistory.length - MAX_HISTORY);
      }
    } catch (err) {
      this.state.lastError = err.message || String(err);
      console.error('[tick] error:', err.message);
    } finally {
      this._ticking = false;
      this._persist();
      this._scheduleNext(this.state.config.tickIntervalMs);
    }
  }

  // ---- Trade execution (paper) ---------------------------------------------

  _openPosition(price, reason) {
    const cfg = this.state.config;
    const p = this.state.portfolio;
    const spend = Math.min(p.cash, p.cash * cfg.tradeFraction);
    if (spend <= 0.01) return;
    const qty = spend / price;
    p.cash -= spend;
    p.position = { qty, avgPrice: price };
    this.state.trades.push({
      t: Date.now(), side: 'BUY', qty, price, value: spend, reason,
    });
  }

  _closePosition(price, reason) {
    const p = this.state.portfolio;
    const qty = p.position.qty;
    if (qty <= 0) return;
    const proceeds = qty * price;
    const cost = qty * p.position.avgPrice;
    const pnl = proceeds - cost;
    p.cash += proceeds;
    p.realizedPnl += pnl;
    p.position = { qty: 0, avgPrice: 0 };
    this.state.trades.push({
      t: Date.now(), side: 'SELL', qty, price, value: proceeds, pnl, reason,
    });
  }

  _persist() { saveStateAsync(this.state); }
}

function mergeDefaults(loaded) {
  const base = deepClone(DEFAULT_STATE);
  return {
    ...base,
    ...loaded,
    config: { ...base.config, ...(loaded.config || {}) },
    portfolio: { ...base.portfolio, ...(loaded.portfolio || {}) },
    trades: Array.isArray(loaded.trades) ? loaded.trades : [],
    priceHistory: Array.isArray(loaded.priceHistory) ? loaded.priceHistory : [],
  };
}
