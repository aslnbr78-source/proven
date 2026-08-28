// Trading strategies. Each strategy takes a sequence of prices (chronological,
// oldest → newest) plus its params and returns a signal:
//   { action: 'BUY' | 'SELL' | 'HOLD', reason: string, indicators: {...} }

function sma(values, window) {
  if (values.length < window) return null;
  let sum = 0;
  for (let i = values.length - window; i < values.length; i++) sum += values[i];
  return sum / window;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ---- Strategy implementations ----------------------------------------------

// Simple Moving Average crossover. Bullish when short SMA > long SMA.
function smaCrossover(prices, params, hasPosition) {
  const shortW = clampInt(params.shortWindow, 2, 200, 5);
  const longW  = clampInt(params.longWindow, shortW + 1, 500, 20);
  const sShort = sma(prices, shortW);
  const sLong  = sma(prices, longW);
  if (sShort == null || sLong == null) {
    return { action: 'HOLD', reason: `warming up (${prices.length}/${longW})`, indicators: { sShort, sLong } };
  }
  if (sShort > sLong && !hasPosition) {
    return { action: 'BUY', reason: `SMA${shortW} ${sShort.toFixed(2)} > SMA${longW} ${sLong.toFixed(2)}`, indicators: { sShort, sLong } };
  }
  if (sShort < sLong && hasPosition) {
    return { action: 'SELL', reason: `SMA${shortW} ${sShort.toFixed(2)} < SMA${longW} ${sLong.toFixed(2)}`, indicators: { sShort, sLong } };
  }
  return { action: 'HOLD', reason: `SMA${shortW}=${sShort.toFixed(2)} SMA${longW}=${sLong.toFixed(2)}`, indicators: { sShort, sLong } };
}

// RSI mean-reversion. Buy oversold, sell overbought.
function rsiReversion(prices, params, hasPosition) {
  const period = clampInt(params.period, 2, 100, 14);
  const oversold   = clampNum(params.oversold, 1, 49, 30);
  const overbought = clampNum(params.overbought, 51, 99, 70);
  const r = rsi(prices, period);
  if (r == null) {
    return { action: 'HOLD', reason: `warming up (${prices.length}/${period + 1})`, indicators: { rsi: r } };
  }
  if (r < oversold && !hasPosition) {
    return { action: 'BUY', reason: `RSI ${r.toFixed(1)} < ${oversold}`, indicators: { rsi: r } };
  }
  if (r > overbought && hasPosition) {
    return { action: 'SELL', reason: `RSI ${r.toFixed(1)} > ${overbought}`, indicators: { rsi: r } };
  }
  return { action: 'HOLD', reason: `RSI ${r.toFixed(1)}`, indicators: { rsi: r } };
}

// Momentum. Buy on strong upward return over lookback, sell on strong downward.
function momentum(prices, params, hasPosition) {
  const lookback = clampInt(params.lookback, 2, 500, 10);
  const threshold = clampNum(params.threshold, 0.001, 1.0, 0.02);
  if (prices.length < lookback + 1) {
    return { action: 'HOLD', reason: `warming up (${prices.length}/${lookback + 1})`, indicators: {} };
  }
  const past = prices[prices.length - 1 - lookback];
  const now  = prices[prices.length - 1];
  const ret  = (now - past) / past;
  if (ret > threshold && !hasPosition) {
    return { action: 'BUY', reason: `${(ret * 100).toFixed(2)}% over ${lookback} > +${(threshold * 100).toFixed(2)}%`, indicators: { return: ret } };
  }
  if (ret < -threshold && hasPosition) {
    return { action: 'SELL', reason: `${(ret * 100).toFixed(2)}% over ${lookback} < -${(threshold * 100).toFixed(2)}%`, indicators: { return: ret } };
  }
  return { action: 'HOLD', reason: `${(ret * 100).toFixed(2)}% over ${lookback}`, indicators: { return: ret } };
}

// Buy-and-hold baseline.
function buyAndHold(prices, params, hasPosition) {
  if (!hasPosition) return { action: 'BUY', reason: 'initial buy-and-hold entry', indicators: {} };
  return { action: 'HOLD', reason: 'holding', indicators: {} };
}

// ----------------------------------------------------------------------------

export const STRATEGIES = {
  sma_crossover: {
    id: 'sma_crossover',
    label: 'SMA Crossover',
    description: 'Buy when the short SMA rises above the long SMA; sell on the opposite cross.',
    defaultParams: { shortWindow: 5, longWindow: 20 },
    paramSchema: [
      { key: 'shortWindow', label: 'Short SMA window', type: 'int',   min: 2, max: 200, step: 1 },
      { key: 'longWindow',  label: 'Long SMA window',  type: 'int',   min: 3, max: 500, step: 1 },
    ],
    run: smaCrossover,
  },
  rsi_reversion: {
    id: 'rsi_reversion',
    label: 'RSI Mean Reversion',
    description: 'Buy when RSI drops below the oversold threshold; sell when it climbs above overbought.',
    defaultParams: { period: 14, oversold: 30, overbought: 70 },
    paramSchema: [
      { key: 'period',     label: 'RSI period',       type: 'int',   min: 2, max: 100, step: 1 },
      { key: 'oversold',   label: 'Oversold level',   type: 'float', min: 1, max: 49,  step: 1 },
      { key: 'overbought', label: 'Overbought level', type: 'float', min: 51, max: 99, step: 1 },
    ],
    run: rsiReversion,
  },
  momentum: {
    id: 'momentum',
    label: 'Momentum Breakout',
    description: 'Buy on a strong positive return over the lookback window; sell on a strong negative return.',
    defaultParams: { lookback: 10, threshold: 0.02 },
    paramSchema: [
      { key: 'lookback',  label: 'Lookback (ticks)',       type: 'int',   min: 2, max: 500, step: 1 },
      { key: 'threshold', label: 'Return threshold (0-1)', type: 'float', min: 0.001, max: 1, step: 0.005 },
    ],
    run: momentum,
  },
  buy_and_hold: {
    id: 'buy_and_hold',
    label: 'Buy & Hold',
    description: 'Baseline: buy once on the first tick and hold forever.',
    defaultParams: {},
    paramSchema: [],
    run: buyAndHold,
  },
};

export function evaluate(strategyId, prices, params, hasPosition) {
  const s = STRATEGIES[strategyId];
  if (!s) throw new Error(`Unknown strategy: ${strategyId}`);
  return s.run(prices, params || {}, hasPosition);
}

export function defaultParams(strategyId) {
  const s = STRATEGIES[strategyId];
  if (!s) return {};
  return { ...s.defaultParams };
}

// ----------------------------------------------------------------------------

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
