#!/usr/bin/env python3
"""Build the EQ7 equal-weight index page.

EQ7 holds NVDA, GOOGL, META, AMZN, ASML, TSLA and TSM at 1/7 each and is
compared against QQQ. This script downloads daily and intraday price
history from Yahoo Finance's public chart endpoint, writes a compact
snapshot, and injects it into the page template.

    python3 -I eq7/build.py fetch --raw /some/empty/dir
    python3 -I eq7/build.py snapshot --raw /some/empty/dir
    python3 -I eq7/build.py page [--fragment /path/fragment.html]
    python3 -I eq7/build.py all --raw /some/empty/dir

The index math itself lives in the page (eq7/app.html) so the viewer can
switch rebalance schedules and price/total return on the fly. `verify`
re-implements the default methodology in Python as an independent check.
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SNAPSHOT = os.path.join(HERE, "data", "snapshot.json")
TEMPLATE = os.path.join(HERE, "app.html")
SITE_PAGE = os.path.join(ROOT, "static", "eq7", "index.html")

CONSTITUENTS = ["NVDA", "GOOGL", "META", "AMZN", "ASML", "TSLA", "TSM"]
BENCHMARK = "QQQ"
SYMBOLS = CONSTITUENTS + [BENCHMARK]
ET = ZoneInfo("America/New_York")
UA = "Mozilla/5.0 (compatible; eq7-build/1.0)"
BASE = "https://query1.finance.yahoo.com/v8/finance/chart/"
TAIL_DAYS = 260  # trading days of OHLCV kept for the stats grid

# kind -> query parameters (period2 is added for the daily request)
REQUESTS = {
    "daily": {"interval": "1d", "period1": "0", "events": "div,split",
              "includeAdjustedClose": "true"},
    "1D": {"interval": "1m", "range": "1d"},
    "1W": {"interval": "15m", "range": "5d"},
    "1M": {"interval": "60m", "range": "1mo"},
}
INTERVAL_SECONDS = {"1D": 60, "1W": 900, "1M": 3600}


# --------------------------------------------------------------------- fetch

def fetch(raw):
    os.makedirs(raw, exist_ok=True)
    now = str(int(time.time()))
    for sym in SYMBOLS:
        for kind, params in REQUESTS.items():
            q = dict(params)
            if kind == "daily":
                q["period2"] = now
            url = BASE + urllib.parse.quote(sym) + "?" + urllib.parse.urlencode(q)
            body = get(url)
            json.loads(body)  # fail fast on a non-JSON reply
            path = os.path.join(raw, f"{sym}_{kind}.json")
            with open(path, "wb") as f:
                f.write(body)
            print(f"  {sym:5} {kind:5} {len(body):>9,} bytes")
            time.sleep(0.4)


def get(url, tries=5):
    delay = 2
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - report and back off
            if attempt == tries - 1:
                raise
            print(f"  retry in {delay}s: {e}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


# ------------------------------------------------------------------ snapshot

def load(raw, sym, kind):
    with open(os.path.join(raw, f"{sym}_{kind}.json")) as f:
        d = json.load(f)
    if d["chart"].get("error"):
        raise SystemExit(f"{sym} {kind}: {d['chart']['error']}")
    return d["chart"]["result"][0]


def et(ts):
    return datetime.fromtimestamp(ts, ET)


def sig(x, n=6):
    """Round to n significant figures (keeps old split-adjusted prices exact enough)."""
    if x is None:
        return None
    if x == 0:
        return 0
    digits = n - int(math.floor(math.log10(abs(x)))) - 1
    v = round(x, max(digits, 0))
    return int(v) if digits <= 0 else v


def daily_rows(res):
    q = res["indicators"]["quote"][0]
    rows = {}
    for i, ts in enumerate(res["timestamp"]):
        c = q["close"][i]
        if c is None:
            continue
        rows[et(ts).date().isoformat()] = (q["open"][i], q["high"][i], q["low"][i],
                                           c, q["volume"][i])
    return rows


def intraday_points(res, kind, day_rows, cal_index):
    """Regular-session bar closes stamped at bar END, plus the official open/close."""
    step = INTERVAL_SECONDS[kind]
    q = res["indicators"]["quote"][0]
    by_day = {}
    for i, ts in enumerate(res.get("timestamp") or []):
        c = q["close"][i]
        t = et(ts)
        mins = t.hour * 60 + t.minute
        if c is None or mins < 570 or mins >= 960:  # 9:30 <= start < 16:00
            continue
        day = t.date().isoformat()
        session_end = int(t.replace(hour=16, minute=0, second=0).timestamp())
        by_day.setdefault(day, {})[min(ts + step, session_end)] = c
    out = {}
    for day, pts in by_day.items():
        if day not in day_rows or day not in cal_index:
            continue
        o, _, _, close, _ = day_rows[day]
        t0 = datetime.fromisoformat(day).replace(hour=9, minute=30, tzinfo=ET)
        pts[int(t0.timestamp())] = o           # official open at 9:30
        last = max(pts)
        pts[last] = close                      # official close at the final bar end
        out[day] = pts
    return out


def snapshot(raw):
    daily = {s: load(raw, s, "daily") for s in SYMBOLS}
    rows = {s: daily_rows(daily[s]) for s in SYMBOLS}

    inception = max(min(rows[s]) for s in CONSTITUENTS)
    cal = sorted(d for d in rows[BENCHMARK] if d >= inception)
    for s in SYMBOLS:
        missing = [d for d in cal if d not in rows[s]]
        if missing:
            print(f"  warning: {s} missing {len(missing)} days, forward-filling: {missing[:5]}")
    cal_index = {d: i for i, d in enumerate(cal)}

    def series(s, col):
        out, last = [], None
        for d in cal:
            r = rows[s].get(d)
            v = r[col] if r and r[col] is not None else (last if col == 3 else None)
            if col == 3:
                last = v
            out.append(v)
        return out

    close = {s: [sig(v) for v in series(s, 3)] for s in SYMBOLS}
    tail = {}
    for s in SYMBOLS:
        tail[s] = {
            "open": [sig(v) for v in series(s, 0)[-TAIL_DAYS:]],
            "high": [sig(v) for v in series(s, 1)[-TAIL_DAYS:]],
            "low": [sig(v) for v in series(s, 2)[-TAIL_DAYS:]],
            "volume": series(s, 4)[-TAIL_DAYS:],
        }

    # Weekly closes before inception, for each symbol's own ALL view.
    pre = {}
    for s in SYMBOLS:
        weeks = {}
        for d in sorted(x for x in rows[s] if x < inception):
            y, w, _ = datetime.fromisoformat(d).isocalendar()
            weeks[(y, w)] = (d, rows[s][d][3])
        pts = sorted(weeks.values())
        pre[s] = {"dates": [p[0] for p in pts], "close": [sig(p[1]) for p in pts]}

    dividends, splits = {}, {}
    for s in SYMBOLS:
        ev = daily[s].get("events") or {}
        dividends[s] = sorted([et(int(k)).date().isoformat(), sig(v["amount"])]
                              for k, v in (ev.get("dividends") or {}).items())
        splits[s] = sorted([et(int(k)).date().isoformat(), v.get("splitRatio")]
                           for k, v in (ev.get("splits") or {}).items())

    # Intraday sets on one shared, forward-filled time axis per range.
    intraday = {}
    for kind in ("1D", "1W", "1M"):
        per = {s: intraday_points(load(raw, s, kind), kind, rows[s], cal_index) for s in SYMBOLS}
        days = sorted(set.intersection(*(set(per[s]) for s in SYMBOLS)))
        t_axis, k_axis = [], []
        px = {s: [] for s in SYMBOLS}
        for day in days:
            stamps = sorted(set().union(*(per[s][day].keys() for s in SYMBOLS)))
            last = {s: None for s in SYMBOLS}
            for ts in stamps:
                t_axis.append(ts)
                k_axis.append(cal_index[day])
                for s in SYMBOLS:
                    v = per[s][day].get(ts, last[s])
                    if v is None:  # symbol has no print yet: use its official open
                        v = rows[s][day][0]
                    last[s] = v
                    px[s].append(sig(v))
        intraday[kind] = {"t": t_axis, "k": k_axis, "px": px}

    meta = {}
    for s in SYMBOLS:
        m = daily[s]["meta"]
        meta[s] = {
            "name": m.get("longName") or m.get("shortName") or s,
            "exchange": m.get("fullExchangeName") or m.get("exchangeName"),
            "currency": m.get("currency"),
            "type": m.get("instrumentType"),
        }

    last_day = cal[-1]
    snap = {
        "asOf": last_day,
        "inception": inception,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Yahoo Finance chart API (split-adjusted closes, dividends, intraday bars)",
        "constituents": CONSTITUENTS,
        "benchmark": BENCHMARK,
        "meta": meta,
        "dates": cal,
        "close": close,
        "tail": tail,
        "pre": pre,
        "dividends": dividends,
        "splits": splits,
        "intraday": intraday,
    }
    os.makedirs(os.path.dirname(SNAPSHOT), exist_ok=True)
    with open(SNAPSHOT, "w") as f:
        json.dump(snap, f, separators=(",", ":"))
    print(f"  snapshot: {len(cal)} sessions {inception} .. {last_day}, "
          f"{os.path.getsize(SNAPSHOT):,} bytes -> {os.path.relpath(SNAPSHOT, ROOT)}")
    for kind, v in intraday.items():
        print(f"  intraday {kind}: {len(v['t'])} points over {len(set(v['k']))} sessions")


# ---------------------------------------------------------------------- page

SKELETON_HEAD = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{padding-top:env(safe-area-inset-top,0px);"
    "padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,-apple-system,sans-serif}"
    "img{max-width:100%}[hidden]{display:none!important}</style>"
)


def page(fragment_out=None):
    with open(TEMPLATE) as f:
        tpl = f.read()
    with open(SNAPSHOT) as f:
        data = f.read()
    marker = "/*__EQ7_DATA__*/null"
    if marker not in tpl:
        raise SystemExit("template is missing the data marker")
    # "</" must not appear inside an inline <script>.
    fragment = tpl.replace(marker, data.replace("</", "<\\/"))
    os.makedirs(os.path.dirname(SITE_PAGE), exist_ok=True)
    with open(SITE_PAGE, "w") as f:
        f.write(SKELETON_HEAD + "</head><body>" + fragment + "</body></html>\n")
    print(f"  page: {os.path.relpath(SITE_PAGE, ROOT)} ({os.path.getsize(SITE_PAGE):,} bytes)")
    if fragment_out:
        with open(fragment_out, "w") as f:
            f.write(fragment)
        print(f"  fragment: {fragment_out}")


# -------------------------------------------------------------------- verify

def third_friday(y, m):
    first = datetime(y, m, 1).weekday()  # Monday = 0
    return datetime(y, m, 1 + (4 - first) % 7 + 14).date().isoformat()


SPECIAL = 0.10  # a distribution above 10% of the prior close is a special (capital return)


def adjusted(s, sym, total):
    """Close times the cumulative reinvestment factor (all dividends, or specials only)."""
    dates, px = s["dates"], s["close"][sym]
    idx = {d: i for i, d in enumerate(dates)}
    divs = {}
    for d, amt in s["dividends"][sym]:
        k = idx.get(d)
        if k is None:  # ex-date not a session in the calendar: next session
            k = next((i for i, x in enumerate(dates) if x > d), None)
        if k:
            divs[k] = divs.get(k, 0) + amt
    out, a = [], 1.0
    for k, p in enumerate(px):
        amt = divs.get(k)
        if amt and (total or amt / px[k - 1] > SPECIAL):
            a *= 1 + amt / p
        out.append(p * a)
    return out


def verify(total=False):
    """Independent Python implementation of the default methodology."""
    with open(SNAPSHOT) as f:
        s = json.load(f)
    dates, cons = s["dates"], s["constituents"]
    close = {c: adjusted(s, c, total) for c in cons + [s["benchmark"]]}
    n = len(cons)
    level = 100.0
    units = {c: level / n / close[c][0] for c in cons}
    levels = [level]
    rebalances = []
    for k in range(1, len(dates)):
        level = sum(units[c] * close[c][k] for c in cons)
        levels.append(level)
        d = dates[k]
        y, m = int(d[:4]), int(d[5:7])
        nxt = dates[k + 1] if k + 1 < len(dates) else None
        tf = third_friday(y, m)
        if m in (3, 6, 9, 12) and d <= tf and (nxt is None and d == tf or nxt is not None and nxt > tf):
            units = {c: level / n / close[c][k] for c in cons}
            rebalances.append(d)
    q = close[s["benchmark"]]
    w = {c: units[c] * close[c][-1] / levels[-1] for c in cons}
    print(f"  quarterly {'total return' if total else 'price'} index: {levels[-1]:.4f} on {dates[-1]} "
          f"(prev {levels[-2]:.4f}, {100 * (levels[-1] / levels[-2] - 1):+.3f}%)")
    print(f"  QQQ since inception: {100 * (q[-1] / q[0] - 1):+.2f}%, "
          f"EQ7: {levels[-1] - 100:+.2f}%")
    print(f"  {len(rebalances)} rebalances, last {rebalances[-1]}; weights now: "
          + ", ".join(f"{c} {100 * w[c]:.2f}%" for c in cons))


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["fetch", "snapshot", "page", "verify", "all"])
    ap.add_argument("--raw", help="directory for raw downloads (fetch/snapshot)")
    ap.add_argument("--fragment", help="also write the page body without a document skeleton")
    a = ap.parse_args()
    if a.step in ("fetch", "snapshot", "all") and not a.raw:
        ap.error("--raw is required for this step")
    if a.step in ("fetch", "all"):
        print("fetch"); fetch(a.raw)
    if a.step in ("snapshot", "all"):
        print("snapshot"); snapshot(a.raw)
    if a.step in ("verify", "all"):
        print("verify"); verify(); verify(total=True)
    if a.step in ("page", "all"):
        print("page"); page(a.fragment)


if __name__ == "__main__":
    main()
