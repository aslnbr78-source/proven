// Market data providers.
// - CoinGecko: free public API, no auth required.
// - Synthetic: geometric Brownian motion, deterministic-per-seed. Useful offline
//   and for demoing strategies without hitting any external network.

const CG_BASE = 'https://api.coingecko.com/api/v3';

export const SUPPORTED_SYMBOLS = [
  { id: 'bitcoin',  label: 'Bitcoin (BTC)' },
  { id: 'ethereum', label: 'Ethereum (ETH)' },
  { id: 'solana',   label: 'Solana (SOL)' },
  { id: 'dogecoin', label: 'Dogecoin (DOGE)' },
  { id: 'cardano',  label: 'Cardano (ADA)' },
];

// -----------------------------------------------------------------------------
// CoinGecko

async function cgFetch(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'accept': 'application/json', 'user-agent': 'web-auto-trading-agent/1.0' },
    });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${await res.text().catch(() => '')}`.trim());
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

export async function fetchLivePrice(symbol) {
  const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(symbol)}&vs_currencies=usd`;
  const data = await cgFetch(url);
  const price = data?.[symbol]?.usd;
  if (typeof price !== 'number') throw new Error(`No price returned for ${symbol}`);
  return price;
}

// Bootstrap price history so strategies have enough context to fire on tick #1.
// days: 1 = ~5-minute granularity, 7 = hourly, 30 = hourly, 90+ = daily.
export async function fetchHistoricalPrices(symbol, days = 1) {
  const url = `${CG_BASE}/coins/${encodeURIComponent(symbol)}/market_chart?vs_currency=usd&days=${days}`;
  const data = await cgFetch(url, { timeoutMs: 12000 });
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  return prices.map(([t, price]) => ({ t, price }));
}

// -----------------------------------------------------------------------------
// Synthetic price generator (geometric Brownian motion)

const syntheticState = new Map(); // symbol -> { price, driftAnnual, volAnnual }

const SYNTH_SEEDS = {
  bitcoin:  { start: 65000, drift: 0.35, vol: 0.60 },
  ethereum: { start:  3200, drift: 0.40, vol: 0.75 },
  solana:   { start:   150, drift: 0.50, vol: 1.10 },
  dogecoin: { start:   0.15, drift: 0.10, vol: 1.30 },
  cardano:  { start:   0.45, drift: 0.15, vol: 0.95 },
};

function seedSymbol(symbol) {
  const s = SYNTH_SEEDS[symbol] || { start: 100, drift: 0.10, vol: 0.50 };
  syntheticState.set(symbol, { price: s.start, driftAnnual: s.drift, volAnnual: s.vol });
}

// dtSeconds: how much simulated time has passed since the last tick.
export function syntheticTick(symbol, dtSeconds = 60) {
  if (!syntheticState.has(symbol)) seedSymbol(symbol);
  const st = syntheticState.get(symbol);
  const dt = Math.max(1, dtSeconds) / (365 * 24 * 3600);
  // Standard normal via Box–Muller.
  const u1 = Math.max(1e-12, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const mu = st.driftAnnual, sigma = st.volAnnual;
  const step = (mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z;
  st.price = Math.max(1e-6, st.price * Math.exp(step));
  return st.price;
}

// Seed a synthetic history so strategies work immediately.
export function syntheticHistory(symbol, points = 200, intervalSec = 60) {
  seedSymbol(symbol);
  const now = Date.now();
  const out = [];
  for (let i = points - 1; i >= 0; i--) {
    const price = syntheticTick(symbol, intervalSec);
    out.push({ t: now - i * intervalSec * 1000, price });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Unified interface

export async function getPrice(symbol, source) {
  if (source === 'synthetic') return syntheticTick(symbol);
  return await fetchLivePrice(symbol);
}

export async function bootstrapHistory(symbol, source) {
  if (source === 'synthetic') return syntheticHistory(symbol, 200, 60);
  try {
    const pts = await fetchHistoricalPrices(symbol, 1);
    // Keep the last ~200 points at most.
    return pts.slice(-200);
  } catch (err) {
    console.warn(`History bootstrap failed for ${symbol}, using synthetic:`, err.message);
    return syntheticHistory(symbol, 200, 60);
  }
}
