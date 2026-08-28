# Web Auto Trading Agent

A self-contained web app that runs an automated **paper-trading** agent against
real-time crypto prices, and streams everything to a live dashboard. This is a
sandbox for experimenting with strategies — **no real orders are ever placed.**

## Features

- **Live prices** via the public CoinGecko API (no key required) with a fully
  offline synthetic price generator as a fallback.
- **Pluggable strategies:**
  - SMA Crossover
  - RSI Mean Reversion
  - Momentum Breakout
  - Buy & Hold (baseline)
- **Automated engine** that ticks on a configurable interval, evaluates the
  strategy against the current price history, and executes paper trades.
- **Persistent state** on disk (`data/state.json`) so the agent survives
  restarts and picks up right where it left off.
- **Modern dark dashboard** with live KPIs, price chart with buy/sell markers,
  equity curve, and a full trade log.

## Requirements

- Node.js 20+ (uses built-in `fetch` and ES modules).

## Quick start

```bash
cd trading-agent
npm install
npm start
# open http://localhost:3000
```

Environment variables:

- `PORT` — server port (default `3000`)
- `HOST` — bind host (default `0.0.0.0`)

## How it works

The engine tick loop (`server/engine.js`):

1. Fetches the current price for the configured symbol from the selected source.
2. Appends it to a rolling in-memory price history (capped at 500 points).
3. Evaluates the active strategy (`server/strategies.js`) against the history
   and current position to produce a `BUY` / `SELL` / `HOLD` signal.
4. Executes paper trades: on `BUY` it deploys `tradeFraction` of available cash;
   on `SELL` it fully liquidates the current position.
5. Marks the portfolio to market and appends a point to the equity curve.
6. Persists state to disk and schedules the next tick.

## Strategies

| Strategy | Idea | Key params |
|---|---|---|
| SMA Crossover | Buy when the short SMA rises above the long SMA, sell on the opposite cross. | `shortWindow`, `longWindow` |
| RSI Mean Reversion | Buy when RSI < oversold; sell when RSI > overbought. | `period`, `oversold`, `overbought` |
| Momentum Breakout | Buy on a strong positive return over the lookback window; sell on a strong negative return. | `lookback`, `threshold` |
| Buy & Hold | Buy once, hold forever. Baseline for comparison. | — |

Adding a new strategy is a small edit to `server/strategies.js`: add an entry to
the `STRATEGIES` map with a `run(prices, params, hasPosition)` function that
returns `{ action, reason, indicators }`.

## REST API

- `GET  /api/state` — full engine state including config, portfolio, trades,
  price history, and derived metrics.
- `GET  /api/meta`  — list of supported symbols and strategies (with param
  schemas — this is what the frontend uses to auto-render the config panel).
- `POST /api/config` — patch config: `{ symbol, strategy, strategyParams,
  tickIntervalMs, tradeFraction, priceSource, startingCash }`.
- `POST /api/start`  — start the tick loop.
- `POST /api/stop`   — stop the tick loop (position is preserved).
- `POST /api/reset`  — reset cash, position, trades, and history.

## Project layout

```
trading-agent/
├── server/
│   ├── index.js         Express server + REST API + static hosting
│   ├── engine.js        Tick loop, portfolio, paper-trade execution
│   ├── strategies.js    SMA / RSI / Momentum / Buy-and-Hold implementations
│   ├── marketData.js    CoinGecko + synthetic price providers
│   └── storage.js       JSON-file persistence
├── public/
│   ├── index.html       Dashboard shell (Tailwind CDN)
│   ├── app.js           Frontend logic + Chart.js rendering
│   └── styles.css       Small custom-CSS layer
├── data/                Runtime state (gitignored)
└── package.json
```

## Disclaimer

This project is for **education and experimentation only**. It performs paper
trading against a public price feed. It is not investment advice, does not
place real orders, and makes no claim of being a profitable strategy.
