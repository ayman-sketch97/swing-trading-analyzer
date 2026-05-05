# Swing Trading Analyzer

A web app for probabilistic swing trading technical analysis.

## Quick Start

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- Analyze: `GET /analyze?ticker=AAPL`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

## Features

- **Ticker Input** - Enter any stock/crypto ticker (AAPL, TSLA, BTC, etc.)
- **Technical Indicators** - 20/50/200 EMA, RSI(14), ATR, Volume trend
- **Trend Detection** - Bullish, Bearish, Sideways classification
- **Support/Resistance** - Zone-based detection from swing highs/lows
- **Signal Generation** - Entry zone, exit zone, stop loss, holding period
- **Risk Assessment** - Low/Medium/High based on volatility
- **Signal Strength** - 0-100 composite score
- **Watchlist** - Save tickers with localStorage persistence
- **Interactive Chart** - TradingView lightweight charts with EMA overlays and S/R lines

## API Response Format

```json
{
  "ticker": "AAPL",
  "trend": "bullish",
  "setup_type": "pullback",
  "signal_strength": 65,
  "support_zones": [{"high": 195, "low": 190, "mid": 192.5}],
  "resistance_zones": [{"high": 210, "low": 205, "mid": 207.5}],
  "entry_zone": "190 - 195",
  "exit_zone": "205 - 210",
  "stop_loss": "Below 188.10",
  "holding_period": "5-12 trading days",
  "risk_level": "medium"
}
```

## Disclaimer

This tool provides probabilistic technical analysis for informational purposes only. It is not financial advice. Always do your own research and consult a licensed financial advisor before making investment decisions.
