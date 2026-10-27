#!/usr/bin/env python3
"""Rebuild the portfolio history, metrics, charts and README tables.

Inputs
  ledger.csv            every deposit, buy and sell, in dollars
  data/prices.csv       daily closing prices (split-adjusted, not dividend-adjusted)
  data/dividends.csv    ex-dividend dates and cash per share (for the dividend estimate only)

Outputs
  out/*.csv, out/summary.json   daily history, fills, positions, sells, headline metrics
  charts/*.svg                  charts embedded in README.md
  README.md                     only the blocks between <!-- AUTO:x --> markers are rewritten

Method (also written up in README.md)
  * Every trade fills at that day's close. Fractional shares, no fees, no tax.
  * Weekend/holiday dates roll forward to the next trading day.
  * A ledger row with date_end is split evenly across the trading days in [date, date_end].
  * Within a day: deposits, then sells, then buys.
  * Cost basis is average cost; realized P&L = proceeds - average cost of the shares sold.
  * Benchmarks get the same deposits on the same days and are simply held.

Stdlib only:  python3 portfolio/build.py
"""
import csv
import datetime as dt
import json
import math
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
BENCHMARKS = ["SPY", "QQQ"]
NAMES = {
    "TSLA": "Tesla", "NVDA": "Nvidia", "TSM": "TSMC", "GOOGL": "Alphabet", "GEV": "GE Vernova",
    "OSCR": "Oscar Health", "ASML": "ASML", "AMZN": "Amazon", "PANW": "Palo Alto Networks",
    "MU": "Micron", "SHOP": "Shopify", "SPCX": "SpaceX", "META": "Meta",
    "SPY": "S&P 500 (SPY)", "QQQ": "Nasdaq-100 (QQQ)",
}
ORDER = {"DEPOSIT": 0, "SELL": 1, "BUY": 2}


# ---------------------------------------------------------------- load

def read_csv(path):
    with open(os.path.join(ROOT, path), newline="") as f:
        return list(csv.DictReader(f))


def load_prices():
    rows = read_csv("data/prices.csv")
    cal = [r["date"] for r in rows]
    px = {}
    for r in rows:
        for t, v in r.items():
            if t != "date" and v:
                px.setdefault(t, {})[r["date"]] = float(v)
    return cal, px


# ---------------------------------------------------------------- simulate

def simulate(ledger, cal, px):
    def close(t, d):
        """Close on d, or the last close before d (never needed for a listed stock)."""
        series = px[t]
        if d in series:
            return series[d]
        prior = [x for x in series if x < d]
        if not prior:
            raise ValueError(f"no price for {t} on or before {d}")
        return series[max(prior)]

    # expand ledger rows into fills on trading days
    fills = []
    for i, r in enumerate(ledger):
        start, end = r["date"], r["date_end"] or None
        days = [d for d in cal if start <= d <= end] if end else [next(d for d in cal if d >= start)]
        for d in days:
            fills.append({"day": d, "row": i, "action": r["action"], "ticker": r["ticker"],
                          "amount": float(r["amount_usd"]) / len(days), "note": r["note"]})
    fills.sort(key=lambda f: (f["day"], ORDER[f["action"]], f["row"]))

    first = fills[0]["day"]
    days = [d for d in cal if d >= first]
    cash = contributed = 0.0
    pos = {}
    bench_sh = {b: 0.0 for b in BENCHMARKS}
    trades, history, holdings = [], [], []
    prev_total, idx = None, 100.0
    by_day = {}
    for f in fills:
        by_day.setdefault(f["day"], []).append(f)

    for d in days:
        deposit = 0.0
        for f in by_day.get(d, []):
            a, t, amt = f["action"], f["ticker"], f["amount"]
            if a == "DEPOSIT":
                cash += amt
                contributed += amt
                deposit += amt
                for b in BENCHMARKS:
                    bench_sh[b] += amt / close(b, d)
                trades.append({**f, "price": "", "shares": "", "realized": "", "cash_after": cash})
                continue
            p = close(t, d)
            sh = amt / p
            P = pos.setdefault(t, {"shares": 0.0, "cost": 0.0, "bought": 0.0, "sold": 0.0,
                                   "realized": 0.0, "first": d, "sold_shares": 0.0})
            realized = ""
            if a == "BUY":
                if amt > cash + 1e-6:
                    raise ValueError(f"{d}: buying ${amt:,.2f} of {t} with only ${cash:,.2f} cash")
                cash -= amt
                P["shares"] += sh
                P["cost"] += amt
                P["bought"] += amt
            else:
                if sh > P["shares"] + 1e-9:
                    raise ValueError(f"{d}: selling {sh:.4f} {t} but only {P['shares']:.4f} held")
                avg = P["cost"] / P["shares"]
                realized = amt - avg * sh
                P["realized"] += realized
                P["cost"] -= avg * sh
                P["shares"] -= sh
                P["sold"] += amt
                P["sold_shares"] += sh
                cash += amt
            trades.append({**f, "price": p, "shares": sh, "realized": realized, "cash_after": cash})

        hold = 0.0
        for t, P in pos.items():
            if P["shares"] > 1e-12:
                v = P["shares"] * close(t, d)
                hold += v
                holdings.append({"date": d, "ticker": t, "shares": P["shares"], "price": close(t, d), "value": v})
        total = cash + hold
        if prev_total:
            idx *= (total - deposit) / prev_total
        prev_total = total
        row = {"date": d, "contributed": contributed, "cash": cash, "holdings": hold, "total": total,
               "pnl": total - contributed, "twr_index": idx}
        for b in BENCHMARKS:
            row[f"{b.lower()}_same_deposits"] = bench_sh[b] * close(b, d)
            row[f"{b.lower()}_index"] = 100 * close(b, d) / close(b, first)
        history.append(row)

    return {"fills": fills, "trades": trades, "history": history, "holdings": holdings,
            "pos": pos, "bench_sh": bench_sh, "close": close, "days": days}


# ---------------------------------------------------------------- metrics

def xirr(flows):
    """Annualised money-weighted return. flows: [(date_str, amount)], money in is negative."""
    d0 = dt.date.fromisoformat(flows[0][0])
    pts = [((dt.date.fromisoformat(d) - d0).days / 365.0, a) for d, a in flows]
    npv = lambda r: sum(a / (1 + r) ** y for y, a in pts)
    lo, hi = -0.99, 10.0
    for _ in range(300):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def max_drawdown(history, key):
    peak, peak_d, worst = -1, None, (0.0, None, None)
    for r in history:
        if r[key] > peak:
            peak, peak_d = r[key], r["date"]
        dd = r[key] / peak - 1
        if dd < worst[0]:
            worst = (dd, peak_d, r["date"])
    return worst


def risk_stats(history):
    """Annualised volatility of daily time-weighted returns, and beta/correlation to SPY."""
    def rets(key):
        return [history[i][key] / history[i - 1][key] - 1 for i in range(1, len(history))]
    p, m = rets("twr_index"), rets("spy_index")
    n = len(p)
    mp, mm = sum(p) / n, sum(m) / n
    cov = sum((a - mp) * (b - mm) for a, b in zip(p, m)) / (n - 1)
    vp = sum((a - mp) ** 2 for a in p) / (n - 1)
    vm = sum((b - mm) ** 2 for b in m) / (n - 1)
    best, worst = max(range(n), key=lambda i: p[i]), min(range(n), key=lambda i: p[i])
    return {"volatility": math.sqrt(vp * 252), "spy_volatility": math.sqrt(vm * 252),
            "beta_to_spy": cov / vm, "correlation_to_spy": cov / math.sqrt(vp * vm),
            "best_day": history[best + 1]["date"], "best_day_return": p[best],
            "worst_day": history[worst + 1]["date"], "worst_day_return": p[worst]}


def dividends_estimate(sim):
    """Gross cash dividends the holdings would have earned (shares held the day before ex-date)."""
    shares_on = {}
    for h in sim["holdings"]:
        shares_on.setdefault(h["ticker"], {})[h["date"]] = h["shares"]
    out = {}
    for r in read_csv("data/dividends.csv"):
        t, ex = r["ticker"], r["ex_date"]
        prior = [d for d in sim["days"] if d < ex]
        if t not in shares_on or not prior:
            continue
        sh = shares_on[t].get(prior[-1], 0.0)
        if sh > 0:
            out[t] = out.get(t, 0.0) + sh * float(r["amount_per_share"])
    return out


def summarise(ledger, sim):
    H, close = sim["history"], sim["close"]
    last = H[-1]
    asof = last["date"]
    deposits = [(t["day"], -t["amount"]) for t in sim["trades"] if t["action"] == "DEPOSIT"]
    dd = max_drawdown(H, "twr_index")
    peak = max(H, key=lambda r: r["total"])

    positions = []
    for t, P in sim["pos"].items():
        p = close(t, asof)
        value = P["shares"] * p
        unreal = value - P["cost"]
        total_pnl = P["realized"] + unreal
        positions.append({
            "ticker": t, "name": NAMES.get(t, t), "first_buy": P["first"],
            "status": "Open" if P["sold"] == 0 else "Trimmed",
            "invested": P["bought"], "sold": P["sold"], "shares": P["shares"],
            "avg_cost": P["cost"] / P["shares"] if P["shares"] > 1e-12 else 0.0,
            "price": p, "value": value, "cost_basis": P["cost"], "unrealized": unreal,
            "realized": P["realized"], "total_pnl": total_pnl,
            "return_on_invested": total_pnl / P["bought"], "weight": value / last["total"],
        })
    positions.sort(key=lambda r: -r["total_pnl"])

    sells = []
    for i, r in enumerate(ledger):
        if r["action"] != "SELL":
            continue
        fs = [t for t in sim["trades"] if t["row"] == i]
        sh = sum(t["shares"] for t in fs)
        proceeds = sum(t["amount"] for t in fs)
        held_now = sh * close(r["ticker"], asof)
        sells.append({
            "ticker": r["ticker"], "name": NAMES.get(r["ticker"], r["ticker"]),
            "dates": fs[0]["day"] if len(fs) == 1 else f"{fs[0]['day']} to {fs[-1]['day']}",
            "shares": sh, "avg_price": proceeds / sh, "proceeds": proceeds,
            "realized": sum(t["realized"] for t in fs), "price_now": close(r["ticker"], asof),
            "value_if_held": held_now, "selling_vs_holding": proceeds - held_now,
        })

    divs = dividends_estimate(sim)
    risk = risk_stats(H)
    s = {
        "as_of": asof,
        "contributed": last["contributed"], "value": last["total"], "cash": last["cash"],
        "holdings": last["holdings"], "pnl": last["pnl"],
        "simple_return": last["pnl"] / last["contributed"],
        "realized_pnl": sum(p["realized"] for p in positions),
        "unrealized_pnl": sum(p["unrealized"] for p in positions),
        "xirr": xirr(deposits + [(asof, last["total"])]),
        "twr": last["twr_index"] / 100 - 1,
        "max_drawdown": dd[0], "max_drawdown_peak": dd[1], "max_drawdown_trough": dd[2],
        "peak_value": peak["total"], "peak_value_date": peak["date"],
        "dividends_gross_estimate": sum(divs.values()), "dividends_by_ticker": divs,
        **risk, "benchmarks": {},
    }
    for b in BENCHMARKS:
        v = last[f"{b.lower()}_same_deposits"]
        s["benchmarks"][b] = {
            "name": NAMES[b], "value": v, "pnl": v - last["contributed"],
            "simple_return": v / last["contributed"] - 1,
            "xirr": xirr(deposits + [(asof, v)]),
            "twr": last[f"{b.lower()}_index"] / 100 - 1,
        }
    return s, positions, sells


# ---------------------------------------------------------------- formatting

def usd(x, cents=False, sign=False):
    s = f"{abs(x):,.2f}" if cents else f"{abs(x):,.0f}"
    if x < 0 and s.strip("0.,") == "":
        x = 0.0
    return ("-" if x < 0 else ("+" if sign and x > 0 else "")) + "$" + s


def pct(x, sign=True):
    return ("+" if sign and x > 0 else "") + f"{x * 100:.1f}%"


def nice_date(d):
    return dt.date.fromisoformat(d).strftime("%-d %b %Y")


def compact_usd(x):
    if abs(x) >= 1000:
        v = x / 1000
        return f"${v:.0f}K" if v == int(v) else f"${v:.1f}K"
    return f"${x:.0f}"


# ---------------------------------------------------------------- svg

LIGHT = {"bg": "#fcfcfb", "grid": "#e1e0d9", "axis": "#c3c2b7", "ink": "#0b0b0b", "ink2": "#52514e",
         "muted": "#898781", "s1": "#2a78d6", "s2": "#eb6834", "s3": "#1baf7a", "neg": "#e34948"}
DARK = {"bg": "#1a1a19", "grid": "#2c2c2a", "axis": "#383835", "ink": "#f0efec", "ink2": "#c3c2b7",
        "muted": "#898781", "s1": "#3987e5", "s2": "#d95926", "s3": "#199e70", "neg": "#e66767"}


def svg_style():
    def rules(c):
        return (f".bg{{fill:{c['bg']}}}.grid{{stroke:{c['grid']}}}.axis{{stroke:{c['axis']}}}"
                f".t{{fill:{c['ink2']}}}.tp{{fill:{c['ink']}}}.tm{{fill:{c['muted']}}}"
                f".lm{{stroke:{c['muted']}}}.ring{{stroke:{c['bg']}}}"
                + "".join(f".l{k}{{stroke:{c[k]}}}.f{k}{{fill:{c[k]}}}" for k in ("s1", "s2", "s3", "neg", "muted")))
    return ("<style>text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:12px}"
            ".b{font-weight:600}.num{font-variant-numeric:tabular-nums}"
            "line,path{fill:none}.line{stroke-width:2;stroke-linejoin:round;stroke-linecap:round}"
            + rules(LIGHT) + "@media (prefers-color-scheme:dark){" + rules(DARK) + "}</style>")


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text_w(s, size=12):
    return len(str(s)) * size * 0.56


def nice_step(span, n):
    raw = span / n
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 2, 2.5, 5, 10):
        if raw <= m * mag:
            return m * mag
    return 10 * mag


def to_ordinal(d):
    return dt.date.fromisoformat(d).toordinal()


def month_ticks(d0, d1):
    a, b = dt.date.fromisoformat(d0), dt.date.fromisoformat(d1)
    y, m = a.year, a.month
    out = []
    while (y, m) <= (b.year, b.month):
        day = dt.date(y, m, 1)
        if day >= a and m in (1, 4, 7, 10):
            out.append(day)
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def spread_labels(items, gap=15, lo=None, hi=None):
    """items: [{y, ...}] -> sets 'ly' so labels sit at least `gap` apart, nearest to their y."""
    items.sort(key=lambda it: it["y"])
    for i, it in enumerate(items):
        it["ly"] = it["y"] if i == 0 else max(it["y"], items[i - 1]["ly"] + gap)
    if hi is not None and items and items[-1]["ly"] > hi:
        items[-1]["ly"] = hi
        for i in range(len(items) - 2, -1, -1):
            items[i]["ly"] = min(items[i]["ly"], items[i + 1]["ly"] - gap)
    return items


def line_chart(path, title, desc, history, series, y_fmt, events=(), baseline=None, step_keys=()):
    """series: [(key, label, css_key, end_fmt)] drawn over history rows; step_keys drawn as steps."""
    W, H = 860, 400
    top, bottom, left = 52, 34, 0
    dates = [r["date"] for r in history]
    vals = [r[k] for r in history for k, *_ in series]
    lo, hi = min(vals + ([baseline] if baseline else [])), max(vals)
    if baseline is None:
        lo = 0
    step = nice_step(hi - lo, 5)
    ylo, yhi = math.floor(lo / step) * step, math.ceil(hi * 1.02 / step) * step
    ticks = [ylo + i * step for i in range(int(round((yhi - ylo) / step)) + 1)]
    left = max(text_w(y_fmt(t)) for t in ticks) + 14
    end_labels = [f"{lab}  {fmt(history[-1][k])}" for k, lab, _, fmt in series]
    right = max(text_w(s) for s in end_labels) + 22
    x0, x1 = to_ordinal(dates[0]), to_ordinal(dates[-1])
    X = lambda d: left + (to_ordinal(d) - x0) / (x1 - x0) * (W - left - right)
    Y = lambda v: top + (yhi - v) / (yhi - ylo) * (H - top - bottom)

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',
         f'<title id="t">{esc(title)}</title><desc id="d">{esc(desc)}</desc>', svg_style(),
         f'<rect class="bg" width="{W}" height="{H}" rx="8"/>']
    for t in ticks:
        o.append(f'<line class="{"axis" if t == ylo else "grid"}" x1="{left}" x2="{W - right + 8}" y1="{Y(t):.1f}" y2="{Y(t):.1f}" stroke-width="1"/>')
        o.append(f'<text class="tm num" x="{left - 8}" y="{Y(t) + 4:.1f}" text-anchor="end">{esc(y_fmt(t))}</text>')
    if baseline is not None:
        o.append(f'<line class="axis" x1="{left}" x2="{W - right + 8}" y1="{Y(baseline):.1f}" y2="{Y(baseline):.1f}" stroke-width="1"/>')
    for m in month_ticks(dates[0], dates[-1]):
        x = X(m.isoformat())
        lab = m.strftime("%b %Y") if m.month == 1 or m == month_ticks(dates[0], dates[-1])[0] else m.strftime("%b")
        o.append(f'<line class="axis" x1="{x:.1f}" x2="{x:.1f}" y1="{H - bottom}" y2="{H - bottom + 4}" stroke-width="1"/>')
        o.append(f'<text class="tm" x="{x:.1f}" y="{H - bottom + 18}" text-anchor="middle">{esc(lab)}</text>')
    for n, (d, label) in enumerate(events, 1):
        x = X(d)
        o.append(f'<line class="grid" x1="{x:.1f}" x2="{x:.1f}" y1="{top - 6}" y2="{H - bottom}" stroke-width="1"/>')
        o.append(f'<circle class="fmuted ring" cx="{x:.1f}" cy="{top - 14}" r="8" stroke-width="2"/>')
        o.append(f'<text x="{x:.1f}" y="{top - 10}" text-anchor="middle" class="b" style="fill:#fff;font-size:10px">{n}</text>')
    for k, lab, css, fmt in series:
        pts = []
        for i, r in enumerate(history):
            if k in step_keys and i:
                pts.append(f"{X(r['date']):.1f},{Y(history[i - 1][k]):.1f}")
            pts.append(f"{X(r['date']):.1f},{Y(r[k]):.1f}")
        o.append(f'<path class="line l{css}" d="M{" L".join(pts)}"/>')
    ends = spread_labels([{"y": Y(history[-1][k]), "text": f"{lab}  {fmt(history[-1][k])}", "css": css}
                          for k, lab, css, fmt in series], gap=16, hi=H - bottom - 4)
    xe = X(dates[-1])
    for e in ends:
        o.append(f'<circle class="f{e["css"]} ring" cx="{xe:.1f}" cy="{e["y"]:.1f}" r="4" stroke-width="2"/>')
        if abs(e["ly"] - e["y"]) > 1:
            o.append(f'<path class="lm" stroke-width="1" d="M{xe + 6:.1f},{e["y"]:.1f} L{xe + 12:.1f},{e["ly"]:.1f}"/>')
        o.append(f'<text class="tp num" x="{xe + 14:.1f}" y="{e["ly"] + 4:.1f}">{esc(e["text"])}</text>')
    lx = left
    for k, lab, css, _ in series:
        o.append(f'<line class="line l{css}" x1="{lx}" x2="{lx + 18}" y1="16" y2="16"/>')
        o.append(f'<text class="t" x="{lx + 24}" y="20">{esc(lab)}</text>')
        lx += 24 + text_w(lab) + 22
    o.append("</svg>")
    with open(os.path.join(ROOT, path), "w") as f:
        f.write("\n".join(o) + "\n")


def bar_chart(path, title, desc, rows, value_key, label_fn, value_fmt, diverging=True):
    """Horizontal bars from one zero line; rows already sorted."""
    W, row_h, top, bottom = 860, 30, 16, 16
    H = top + bottom + row_h * len(rows)
    vals = [r[value_key] for r in rows]
    lo, hi = min(0, min(vals)), max(0, max(vals))
    labels = [label_fn(r) for r in rows]
    left = max(text_w(s) for s in labels) + 20
    vlab = [value_fmt(v) for v in vals]
    pad_r = max(text_w(s) for s in vlab) + 16
    pad_l = (max(text_w(value_fmt(v)) for v in vals if v < 0) + 16) if lo < 0 else 0
    plot_l, plot_r = left + pad_l, W - pad_r
    X = lambda v: plot_l + (v - lo) / (hi - lo) * (plot_r - plot_l)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',
         f'<title id="t">{esc(title)}</title><desc id="d">{esc(desc)}</desc>', svg_style(),
         f'<rect class="bg" width="{W}" height="{H}" rx="8"/>']
    zx = X(0)
    for i, r in enumerate(rows):
        v = r[value_key]
        cy = top + i * row_h + row_h / 2
        bh, rad = 18, 4
        x_end = X(v)
        css = r.get("css") or ("neg" if (diverging and v < 0) else "s1")
        if abs(x_end - zx) >= 1:
            if v >= 0:
                w = x_end - zx
                rr = min(rad, w)
                d = (f"M{zx:.1f},{cy - bh / 2:.1f} H{x_end - rr:.1f} Q{x_end:.1f},{cy - bh / 2:.1f} {x_end:.1f},{cy - bh / 2 + rr:.1f}"
                     f" V{cy + bh / 2 - rr:.1f} Q{x_end:.1f},{cy + bh / 2:.1f} {x_end - rr:.1f},{cy + bh / 2:.1f} H{zx:.1f} Z")
            else:
                w = zx - x_end
                rr = min(rad, w)
                d = (f"M{zx:.1f},{cy - bh / 2:.1f} H{x_end + rr:.1f} Q{x_end:.1f},{cy - bh / 2:.1f} {x_end:.1f},{cy - bh / 2 + rr:.1f}"
                     f" V{cy + bh / 2 - rr:.1f} Q{x_end:.1f},{cy + bh / 2:.1f} {x_end + rr:.1f},{cy + bh / 2:.1f} H{zx:.1f} Z")
            o.append(f'<path class="f{css}" style="stroke:none" d="{d}"/>')
        o.append(f'<text class="tp" x="{left - 12}" y="{cy + 4:.1f}" text-anchor="end">{esc(labels[i])}</text>')
        if v >= 0:
            o.append(f'<text class="tp num" x="{x_end + 6:.1f}" y="{cy + 4:.1f}">{esc(vlab[i])}</text>')
        else:
            o.append(f'<text class="tp num" x="{x_end - 6:.1f}" y="{cy + 4:.1f}" text-anchor="end">{esc(vlab[i])}</text>')
    o.append(f'<line class="axis" x1="{zx:.1f}" x2="{zx:.1f}" y1="{top - 4}" y2="{H - bottom + 4}" stroke-width="1"/>')
    o.append("</svg>")
    with open(os.path.join(ROOT, path), "w") as f:
        f.write("\n".join(o) + "\n")


# ---------------------------------------------------------------- outputs

def write_csv(path, rows, cols, fmt=None):
    with open(os.path.join(ROOT, path), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            w.writerow([(round(r[c], 6) if isinstance(r[c], float) else r[c]) for c in cols])


def rounds(ledger, sim):
    """Group fills into the trading rounds shown on the charts and timeline."""
    groups = []
    for i, r in enumerate(ledger):
        key = (r["date"], r["date_end"])
        if not groups or groups[-1]["key"] != key:
            groups.append({"key": key, "rows": []})
        groups[-1]["rows"].append(i)
    out = []
    for g in groups:
        fs = [t for t in sim["trades"] if t["row"] in g["rows"]]
        out.append({"start": fs[0]["day"], "end": fs[-1]["day"], "fills": fs,
                    "rows": [ledger[i] for i in g["rows"]]})
    return out


def replace_block(text, name, body):
    pat = re.compile(rf"(<!-- AUTO:{name} -->\n).*?(<!-- /AUTO:{name} -->)", re.S)
    if not pat.search(text):
        raise ValueError(f"README.md is missing the AUTO:{name} block")
    return pat.sub(lambda m: m.group(1) + body.strip() + "\n" + m.group(2), text)


def main():
    ledger = read_csv("ledger.csv")
    cal, px = load_prices()
    sim = simulate(ledger, cal, px)
    s, positions, sells = summarise(ledger, sim)
    rnds = rounds(ledger, sim)
    H = sim["history"]
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "charts"), exist_ok=True)

    write_csv("out/history.csv", H, ["date", "contributed", "cash", "holdings", "total", "pnl", "twr_index",
                                     "spy_same_deposits", "qqq_same_deposits", "spy_index", "qqq_index"])
    write_csv("out/holdings_daily.csv", sim["holdings"], ["date", "ticker", "shares", "price", "value"])
    trade_rows = [{"date": t["day"], "action": t["action"], "ticker": t["ticker"], "amount_usd": t["amount"],
                   "price": t["price"], "shares": t["shares"], "realized_pnl": t["realized"],
                   "cash_after": t["cash_after"], "note": t["note"]} for t in sim["trades"]]
    write_csv("out/trades.csv", trade_rows, list(trade_rows[0]))
    write_csv("out/positions.csv", positions, list(positions[0]))
    write_csv("out/sells.csv", sells, list(sells[0]))
    rounds_rows = []
    for n, rd in enumerate(rnds, 1):
        dep = sum(f["amount"] for f in rd["fills"] if f["action"] == "DEPOSIT")
        bought = sum(f["amount"] for f in rd["fills"] if f["action"] == "BUY")
        sold = sum(f["amount"] for f in rd["fills"] if f["action"] == "SELL")
        rounds_rows.append({"round": n, "start": rd["start"], "end": rd["end"], "deposit": dep, "sold": sold,
                            "bought": bought, "cash_after": rd["fills"][-1]["cash_after"],
                            "summary": "; ".join(f'{r["action"].title()} {r["ticker"]} {usd(float(r["amount_usd"]))}'
                                                 for r in rd["rows"] if r["action"] != "DEPOSIT")})
    write_csv("out/rounds.csv", rounds_rows, list(rounds_rows[0]))
    with open(os.path.join(ROOT, "out/summary.json"), "w") as f:
        json.dump(s, f, indent=2)
    b = s["benchmarks"]
    metrics = [
        ("as_of", s["as_of"], "Last close in the price data"),
        ("contributed", s["contributed"], "New money deposited"),
        ("value", s["value"], "Holdings plus cash at the last close"),
        ("pnl", s["pnl"], "Value minus money put in"),
        ("simple_return", s["simple_return"], "Profit divided by money put in"),
        ("xirr", s["xirr"], "Money-weighted return (IRR), annualised"),
        ("twr", s["twr"], "Time-weighted return since the first trade"),
        ("cash", s["cash"], "Uninvested cash"),
        ("realized_pnl", s["realized_pnl"], "Profit locked in by sales (average cost)"),
        ("unrealized_pnl", s["unrealized_pnl"], "Paper profit on shares still held"),
        ("peak_value", s["peak_value"], "Highest daily closing value"),
        ("peak_value_date", s["peak_value_date"], "Date of the highest closing value"),
        ("max_drawdown", s["max_drawdown"], "Worst fall from a peak, time-weighted"),
        ("volatility", s["volatility"], "Annualised volatility of daily returns"),
        ("spy_volatility", s["spy_volatility"], "SPY annualised volatility, same days"),
        ("beta_to_spy", s["beta_to_spy"], "Beta of daily returns to SPY"),
        ("dividends_gross_estimate", s["dividends_gross_estimate"], "Gross dividends the shares would have earned (not in returns)"),
        ("excess_vs_spy", s["value"] - b["SPY"]["value"], "Portfolio value minus the same deposits in SPY"),
        ("positions", len(positions), "Holdings still open"),
        ("positions_in_profit", sum(p["total_pnl"] > 0 for p in positions), "Holdings with a total profit above zero"),
    ]
    for k in BENCHMARKS:
        for m in ("value", "pnl", "simple_return", "xirr", "twr"):
            metrics.append((f"{k.lower()}_{m}", b[k][m], f"{b[k]['name']}, same deposits: {m.replace('_', ' ')}"))
    write_csv("out/metrics.csv", [dict(zip(("metric", "value", "description"), m)) for m in metrics],
              ["metric", "value", "description"])

    # charts
    events = [(rd["start"], "") for rd in rnds]
    line_chart("charts/value.svg", "Portfolio value vs the same deposits in the S&P 500",
               "Daily total value (holdings plus cash) against cumulative deposits and against putting each deposit into SPY on the same day.",
               H, [("total", "Portfolio", "s1", usd), ("spy_same_deposits", "Same deposits in SPY", "s2", usd),
                   ("contributed", "Money put in", "muted", usd)], compact_usd, events=events, step_keys=("contributed",))
    line_chart("charts/growth.svg", "Growth of $100, time-weighted",
               "Time-weighted return index: strips out the timing and size of deposits so the stock picks can be compared with SPY and QQQ.",
               H, [("twr_index", "Portfolio", "s1", lambda v: f"{v:.0f}"), ("spy_index", "SPY", "s2", lambda v: f"{v:.0f}"),
                   ("qqq_index", "QQQ", "s3", lambda v: f"{v:.0f}")], lambda v: f"{v:.0f}", events=events, baseline=100)
    bar_chart("charts/pnl_by_position.svg", "Profit and loss by position (realized + unrealized)",
              "Each holding's total dollar gain or loss since it was first bought, including trims already sold.",
              positions, "total_pnl", lambda r: f'{r["name"]} ({r["ticker"]})', lambda v: usd(v, sign=True))
    alloc = sorted(positions, key=lambda r: -r["value"]) + [{"name": "Cash", "ticker": "", "value": s["cash"], "css": "muted"}]
    for a in alloc:
        a["share"] = a["value"] / s["value"]
    bar_chart("charts/allocation.svg", "Where the money sits today",
              "Current market value of each holding plus uninvested cash.",
              alloc, "value", lambda r: f'{r["name"]} ({r["ticker"]})' if r["ticker"] else r["name"],
              lambda v: f"{usd(v)} · {v / s['value'] * 100:.0f}%", diverging=False)

    # README blocks
    b = s["benchmarks"]
    summary = f"""
| | Portfolio | Same deposits in SPY | Same deposits in QQQ |
|---|---:|---:|---:|
| Money put in | {usd(s['contributed'])} | {usd(s['contributed'])} | {usd(s['contributed'])} |
| Value on {nice_date(s['as_of'])} | **{usd(s['value'])}** | {usd(b['SPY']['value'])} | {usd(b['QQQ']['value'])} |
| Profit | **{usd(s['pnl'], sign=True)}** | {usd(b['SPY']['pnl'], sign=True)} | {usd(b['QQQ']['pnl'], sign=True)} |
| Profit ÷ money put in | {pct(s['simple_return'])} | {pct(b['SPY']['simple_return'])} | {pct(b['QQQ']['simple_return'])} |
| Money-weighted return (IRR, annualised) | {pct(s['xirr'])} | {pct(b['SPY']['xirr'])} | {pct(b['QQQ']['xirr'])} |
| Time-weighted return (since 1 Apr 2025) | {pct(s['twr'])} | {pct(b['SPY']['twr'])} | {pct(b['QQQ']['twr'])} |

- **Cash on hand:** {usd(s['cash'], cents=True)} · **Realized profit from trims:** {usd(s['realized_pnl'], sign=True)} · **Unrealized:** {usd(s['unrealized_pnl'], sign=True)}
- **Peak value:** {usd(s['peak_value'])} on {nice_date(s['peak_value_date'])} · **Worst drawdown (time-weighted):** {pct(s['max_drawdown'])} from {nice_date(s['max_drawdown_peak'])} to {nice_date(s['max_drawdown_trough'])}
- **Risk:** annualised volatility {pct(s['volatility'], sign=False)} vs {pct(s['spy_volatility'], sign=False)} for SPY · beta to SPY {s['beta_to_spy']:.2f} · best day {pct(s['best_day_return'])} ({nice_date(s['best_day'])}) · worst day {pct(s['worst_day_return'])} ({nice_date(s['worst_day'])})
- **Dividends:** not in the numbers above (all price-only, SPY and QQQ too). Holding these shares would have earned roughly {usd(s['dividends_gross_estimate'])} gross.
"""
    tl = ["| # | Trade date(s) | Money in | Sold | Bought | Cash after | What happened |", "|---|---|---:|---:|---:|---:|---|"]
    for r in rounds_rows:
        when = nice_date(r["start"]) if r["start"] == r["end"] else f'{nice_date(r["start"])} → {nice_date(r["end"])}'
        tl.append(f'| {r["round"]} | {when} | {usd(r["deposit"]) if r["deposit"] else "–"} | {usd(r["sold"]) if r["sold"] else "–"} '
                  f'| {usd(r["bought"])} | {usd(r["cash_after"])} | {r["summary"]} |')
    fills = ["| Date | Action | Ticker | Amount | Close used | Shares | Realized P&L |", "|---|---|---|---:|---:|---:|---:|"]
    for t in trade_rows:
        if t["action"] == "DEPOSIT":
            continue
        fills.append(f'| {t["date"]} | {t["action"].title()} | {t["ticker"]} | {usd(t["amount_usd"], cents=True)} | '
                     f'{usd(t["price"], cents=True)} | {t["shares"]:.4f} | '
                     f'{usd(t["realized_pnl"], sign=True) if t["realized_pnl"] != "" else ""} |')
    timeline = "\n".join(tl) + "\n\n<details><summary>Every fill, with the closing price used</summary>\n\n" + "\n".join(fills) + "\n\n</details>"
    pt = ["| Holding | First bought | Put in | Taken out | Shares | Avg cost | Price | Value | Profit | Return on money put in | Weight |",
          "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for p in positions:
        pt.append(f'| {p["name"]} ({p["ticker"]}) | {p["first_buy"]} | {usd(p["invested"])} | {usd(p["sold"]) if p["sold"] else "–"} | '
                  f'{p["shares"]:.4f} | {usd(p["avg_cost"], cents=True)} | {usd(p["price"], cents=True)} | {usd(p["value"])} | '
                  f'{usd(p["total_pnl"], sign=True)} | {pct(p["return_on_invested"])} | {p["weight"] * 100:.1f}% |')
    pt.append(f'| Cash | | | | | | | {usd(s["cash"])} | | | {s["cash"] / s["value"] * 100:.1f}% |')
    pt.append(f'| **Total** | | **{usd(sum(p["invested"] for p in positions))}** | **{usd(sum(p["sold"] for p in positions))}** | | | | '
              f'**{usd(s["value"])}** | **{usd(s["pnl"], sign=True)}** | | 100% |')
    st = ["| Sold | When | Shares | Avg price | Proceeds | Realized profit | Price now | Those shares today | Selling vs holding |",
          "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for x in sells:
        st.append(f'| {x["name"]} ({x["ticker"]}) | {x["dates"]} | {x["shares"]:.4f} | {usd(x["avg_price"], cents=True)} | '
                  f'{usd(x["proceeds"])} | {usd(x["realized"], sign=True)} | {usd(x["price_now"], cents=True)} | '
                  f'{usd(x["value_if_held"])} | {usd(x["selling_vs_holding"], sign=True)} |')
    tot = sum(x["selling_vs_holding"] for x in sells)
    st.append(f'| **All trims** | | | | **{usd(sum(x["proceeds"] for x in sells))}** | **{usd(sum(x["realized"] for x in sells), sign=True)}** | | '
              f'**{usd(sum(x["value_if_held"] for x in sells))}** | **{usd(tot, sign=True)}** |')
    src = ["| Ticker | Source | From | To | Trading days |", "|---|---|---|---|---:|"]
    for r in read_csv("data/price_sources.csv"):
        src.append(f'| {r["ticker"]} | {r["source"]} | {r["first_date"]} | {r["last_date"]} | {r["days"]} |')

    readme_path = os.path.join(ROOT, "README.md")
    text = open(readme_path).read()
    for name, body in [("asof", f"_Numbers as of the close on **{nice_date(s['as_of'])}**. Rebuild with `python3 portfolio/build.py`._"),
                       ("summary", summary), ("timeline", timeline), ("positions", "\n".join(pt)),
                       ("sells", "\n".join(st)), ("sources", "\n".join(src))]:
        text = replace_block(text, name, body)
    with open(readme_path, "w") as f:
        f.write(text)

    print(f"as of {s['as_of']}: value {usd(s['value'])} on {usd(s['contributed'])} put in "
          f"({pct(s['simple_return'])}); SPY same deposits {usd(b['SPY']['value'])}")


if __name__ == "__main__":
    main()
