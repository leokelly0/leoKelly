#!/usr/bin/env python3
"""Refresh data/prices.csv, data/price_sources.csv and data/dividends.csv.

Source order for each ticker in ledger.csv (plus the SPY and QQQ benchmarks):
  1. FMP  - used when FMP_API_KEY is set and the plan covers the symbol
  2. Yahoo Finance chart API - fills every ticker/day FMP did not return, and supplies dividends

Both are split-adjusted daily closes (not dividend-adjusted). When this was first built,
the two agreed to the cent on 2,355 overlapping ticker-days, apart from 4 TSM days (each off by 0.06% or less).

Usage:  FMP_API_KEY=... python3 portfolio/fetch_prices.py [--out DIR]
Then:   python3 portfolio/build.py
"""
import argparse
import csv
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
BENCHMARKS = ["SPY", "QQQ"]


def get_json(url, tries=5):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (portfolio fetch_prices.py)"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            # Yahoo rate-limits bursts with 429; back off and retry
            if e.code not in (429, 500, 502, 503) or attempt == tries - 1:
                raise
            time.sleep(2 ** (attempt + 1))


def fmp_closes(ticker, start, end, key):
    url = (f"https://financialmodelingprep.com/stable/historical-price-eod/light"
           f"?symbol={ticker}&from={start}&to={end}&apikey={key}")
    try:
        data = get_json(url)
    except urllib.error.HTTPError as e:
        print(f"  FMP {ticker}: HTTP {e.code}, falling back to Yahoo")
        return {}
    if not isinstance(data, list):
        print(f"  FMP {ticker}: {str(data)[:120]}, falling back to Yahoo")
        return {}
    return {r["date"]: float(r["price"]) for r in data if r.get("price") is not None}


def yahoo(ticker, start, end):
    p1 = int(dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc).timestamp()) - 86400
    p2 = int(dt.datetime.fromisoformat(end).replace(tzinfo=dt.timezone.utc).timestamp()) + 2 * 86400
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
           f"?period1={p1}&period2={p2}&interval=1d&events=div%2Csplits")
    res = get_json(url)["chart"]["result"][0]
    off = res["meta"]["gmtoffset"]
    day = lambda ts: dt.datetime.fromtimestamp(int(ts) + off, dt.timezone.utc).strftime("%Y-%m-%d")
    q = res["indicators"]["quote"][0]["close"]
    closes = {day(ts): round(c, 4) for ts, c in zip(res.get("timestamp", []), q) if c is not None}
    divs = {day(k): v["amount"] for k, v in res.get("events", {}).get("dividends", {}).items()}
    return closes, divs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()
    with open(os.path.join(ROOT, "ledger.csv"), newline="") as f:
        ledger = list(csv.DictReader(f))
    start = min(r["date"] for r in ledger)
    end = dt.date.today().isoformat()
    tickers = sorted({r["ticker"] for r in ledger if r["ticker"]}) + BENCHMARKS
    key = os.environ.get("FMP_API_KEY")
    if not key:
        print("FMP_API_KEY not set: using Yahoo for everything")

    table, sources, dividends = {}, [], []
    for t in tickers:
        fmp = fmp_closes(t, start, end, key) if key else {}
        yc, yd = yahoo(t, start, end)
        spans = {}
        for d in sorted(set(fmp) | set(yc)):
            if d < start:
                continue
            src, v = ("FMP", fmp[d]) if d in fmp else ("Yahoo", yc[d])
            table.setdefault(d, {})[t] = v
            s = spans.setdefault(src, [d, d, 0])
            s[1], s[2] = d, s[2] + 1
        sources += [[t, src, a, b, n] for src, (a, b, n) in spans.items()]
        dividends += [[t, d, a, "Yahoo"] for d, a in sorted(yd.items()) if d >= start]
        print(f"  {t}: " + ", ".join(f"{src} {n} days" for src, (_, _, n) in spans.items()))

    # keep only days the market traded (SPY has a close)
    days = sorted(d for d in table if "SPY" in table[d])
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "prices.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date"] + tickers)
        for d in days:
            w.writerow([d] + [("%g" % table[d][t]) if t in table[d] else "" for t in tickers])
    with open(os.path.join(args.out, "price_sources.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "source", "first_date", "last_date", "days"])
        w.writerows(sorted(sources))
    with open(os.path.join(args.out, "dividends.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "ex_date", "amount_per_share", "source"])
        w.writerows(dividends)
    print(f"wrote {len(days)} trading days, {days[0]} to {days[-1]}, to {args.out}")


if __name__ == "__main__":
    main()
