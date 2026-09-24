// ─── src/components/SharesByLot.jsx ──────────────────────────────────────────
// "Shares by lot" — tax lots grouped by symbol with effective cost, unrealized
// P&L, a free-lot signal (Ready / Thin / Hold), delivery hints, and wash-sale
// flags. Ported from the prototype's lot loop (Portfolio.dc.html). Dark-themed.

import { useMemo, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import {
  effectiveLotCost, freeLotSignal, deliveryOrder, washSale, strikeStep,
} from "../lib/coveredCallMath";

const DOT = { g: "#2F9E55", y: "#E3A91B", r: "#E0552A", ready: "#2F9E55", thin: "#E3A91B", hold: "#E0552A" };
const usd = (n, signed) => {
  const a = Math.abs(n || 0);
  const s = "$" + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (signed) return a < 0.005 ? "$0.00" : (n > 0 ? "+" : "−") + s;
  return (n < -0.005 ? "−" : "") + s;
};
const fmtD = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "—";
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Per-symbol quote for the signal math: prefer an open position's live values.
function quoteFor(sym, positions, lots) {
  const p = positions.find((x) => x.sym === sym);
  if (p) return { S: p.liveStock, iv: (p.iv || 25) / 100 };
  const l = lots.find((x) => x.sym === sym);
  return { S: l ? (l.lastPrice || l.cost) : 0, iv: 0.25 };
}

// A, B, C labels per symbol by purchase date.
function lotLabels(lots) {
  const map = {}, bySym = {};
  lots.slice()
    .sort((a, b) => String(a.bought).localeCompare(String(b.bought)) || String(a.id).localeCompare(String(b.id)))
    .forEach((l) => { bySym[l.sym] = (bySym[l.sym] || 0) + 1; map[l.id] = String.fromCharCode(64 + bySym[l.sym]); });
  return map;
}

export default function SharesByLot({ positions, lots, targetYield = 1, onSaveLot, onDeleteLot }) {
  const { T } = useTheme();
  const [showAdd, setShowAdd] = useState(false);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const groups = useMemo(() => {
    const labels = lotLabels(lots);
    const posByLot = {}; positions.forEach((p) => { if (p.lotId) posByLot[p.lotId] = p; });
    const syms = [...new Set(lots.map((l) => l.sym))];

    return syms.map((sym) => {
      const { S, iv } = quoteFor(sym, positions, lots);
      const step = strikeStep(S);
      const symLots = lots.filter((l) => l.sym === sym).sort((a, b) => labels[a.id].localeCompare(labels[b.id]));

      // First lot to deliver per open strike on this symbol.
      const deliverMap = {};
      [...new Set(positions.filter((p) => p.sym === sym).map((p) => p.strike))].forEach((K) => {
        const first = deliveryOrder(sym, K, symLots)[0];
        if (first && deliverMap[first.id] === undefined) deliverMap[first.id] = K;
      });

      const rows = symLots.map((l) => {
        const cover = posByLot[l.id] || null;
        const eff = effectiveLotCost(l, cover);
        const unreal = (S - l.cost) * l.shares;
        let signal, sub, key;
        if (cover) {
          key = "covered"; signal = "Covered by a call"; sub = "Manage it in the call row above.";
        } else {
          const fl = freeLotSignal({ S, eff, iv, target: targetYield, step });
          key = fl.signal;
          if (fl.signal === "ready") { signal = "Ready to sell a call"; sub = `A ~30-day ${usd(fl.strike)} call pays about ${usd(fl.premium)} (${fl.monthlyYieldPct.toFixed(1)}%/mo), at/above cost.`; }
          else if (fl.signal === "thin") { signal = "Thin premium"; sub = `Best call at/above cost: ${usd(fl.strike)} for ~${usd(fl.premium)} (${fl.monthlyYieldPct.toFixed(1)}%/mo). Worth waiting.`; }
          else { signal = "Hold · no call yet"; sub = fl.readyPrice ? `Watch for ${sym} around ${usd(fl.readyPrice)}.` : `Needs ${sym} back near ${usd(eff)}.`; }
        }
        const w = washSale(l, lots, today, S);
        return {
          id: l.id, label: labels[l.id], shares: l.shares, cost: l.cost, eff, unreal,
          bought: fmtD(l.bought), signal, sub, key,
          deliver: deliverMap[l.id] !== undefined ? usd(deliverMap[l.id]) : null,
          wash: w.wash, washText: w.wash ? `Selling at a loss now is a wash sale. Clears ${fmtD(w.clearDate.toISOString().slice(0, 10))}.` : "",
        };
      });
      return { sym, rows };
    });
  }, [positions, lots, targetYield, today]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: "18px 20px", marginBottom: 16 };

  return (
    <div style={{ marginTop: 8 }} role="region" aria-label="Shares by lot">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Shares by lot</h3>
        <button onClick={() => setShowAdd((v) => !v)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: T.fontMono, fontSize: 12, cursor: "pointer" }}>
          {showAdd ? "Close" : "+ Add lot"}
        </button>
      </div>

      {showAdd && <AddLot T={T} onSave={onSaveLot} onDone={() => setShowAdd(false)} />}

      {groups.length === 0 ? (
        <div style={{ ...card, color: T.textDim, fontSize: 13 }}>No share lots yet. Add one, or a new covered call creates its lot automatically.</div>
      ) : groups.map((g) => (
        <div key={g.sym} style={card}>
          <div style={{ color: T.text, fontWeight: 700, fontFamily: T.fontMono, marginBottom: 10 }}>{g.sym}</div>
          {g.rows.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: DOT[r.key] || T.textDim, marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>
                  Lot {r.label} · {r.shares.toLocaleString()} sh · cost {usd(r.cost)} · eff {usd(r.eff)}
                </div>
                <div style={{ color: T.textDim, fontSize: 12, marginTop: 2 }}>{r.signal} — {r.sub}</div>
                {r.deliver && <div style={{ color: T.accent, fontSize: 11, marginTop: 3 }}>Deliver first if called at {r.deliver}</div>}
                {r.wash && <div style={{ color: T.danger, fontSize: 11, marginTop: 3 }}>{r.washText}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: r.unreal >= 0 ? T.success : T.danger, fontFamily: T.fontMono, fontSize: 13, fontWeight: 700 }}>{usd(r.unreal, true)}</div>
                <div style={{ color: T.textDim, fontSize: 10 }}>{r.bought}</div>
                {onDeleteLot && <button onClick={() => onDeleteLot(r.id)} style={{ marginTop: 4, background: "none", border: "none", color: T.textDim, fontSize: 11, cursor: "pointer" }}>remove</button>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AddLot({ T, onSave, onDone }) {
  const [f, setF] = useState({ sym: "", shares: "", cost: "", bought: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = { width: "100%", minHeight: 40, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.inputBg || T.card, color: T.text, fontFamily: T.fontMono, fontSize: 13, marginTop: 4 };
  const submit = async () => {
    const res = await onSave(f);
    if (res?.ok) { setF({ sym: "", shares: "", cost: "", bought: "" }); setErr(""); onDone(); }
    else setErr("Add a symbol, share count and price paid.");
  };
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r || 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
        {[["sym", "Symbol", "PFE"], ["shares", "Shares", "100"], ["cost", "Price paid", "27.80"], ["bought", "Bought (YYYY-MM-DD)", ""]].map(([k, label, ph]) => (
          <label key={k} style={{ fontSize: 11, color: T.textDim }}>{label}
            <input value={f[k]} onChange={set(k)} placeholder={ph} style={inp} /></label>
        ))}
      </div>
      {err && <div style={{ color: T.danger, fontSize: 12, marginTop: 8 }}>{err}</div>}
      <button onClick={submit} style={{ marginTop: 12, padding: "9px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#0A0A0A", fontFamily: T.fontMono, fontWeight: 700, cursor: "pointer" }}>Save lot</button>
    </div>
  );
}
