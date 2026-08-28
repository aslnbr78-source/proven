import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TradingEngine } from './engine.js';
import { STRATEGIES } from './strategies.js';
import { SUPPORTED_SYMBOLS } from './marketData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const engine = new TradingEngine();
const app = express();
app.use(express.json({ limit: '64kb' }));

// ---- API -------------------------------------------------------------------

app.get('/api/state', (req, res) => {
  res.json(publicState(engine.getState()));
});

app.get('/api/meta', (req, res) => {
  res.json({
    symbols: SUPPORTED_SYMBOLS,
    strategies: Object.values(STRATEGIES).map(s => ({
      id: s.id,
      label: s.label,
      description: s.description,
      defaultParams: s.defaultParams,
      paramSchema: s.paramSchema,
    })),
  });
});

app.post('/api/config', async (req, res, next) => {
  try {
    const s = await engine.updateConfig(req.body || {});
    res.json(publicState(s));
  } catch (err) { next(err); }
});

app.post('/api/start',  async (req, res, next) => { try { res.json(publicState(await engine.start()));           } catch (e) { next(e); } });
app.post('/api/stop',   async (req, res, next) => { try { res.json(publicState(await engine.stop()));            } catch (e) { next(e); } });
app.post('/api/reset',  async (req, res, next) => { try { res.json(publicState(await engine.resetPortfolio())); } catch (e) { next(e); } });

app.use((err, req, res, next) => {
  console.error('[api] error:', err.message);
  res.status(400).json({ error: err.message || 'Bad request' });
});

// ---- Static frontend -------------------------------------------------------

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// ---- Bootstrap -------------------------------------------------------------

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`web-auto-trading-agent listening on http://${HOST}:${PORT}`);
});

// ----------------------------------------------------------------------------

function publicState(s) {
  const price = s.lastPrice;
  const p = s.portfolio;
  const posValue = p.position.qty * (price || p.position.avgPrice);
  const equity = p.cash + posValue;
  const unrealized = p.position.qty > 0 && price
    ? (price - p.position.avgPrice) * p.position.qty : 0;
  const totalPnl = equity - p.startingCash;
  const pnlPct = p.startingCash > 0 ? (totalPnl / p.startingCash) * 100 : 0;
  return {
    ...s,
    derived: {
      price,
      positionValue: posValue,
      equity,
      unrealizedPnl: unrealized,
      totalPnl,
      pnlPct,
    },
  };
}
