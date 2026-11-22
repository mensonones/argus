// Counterfactual check for the useCart (D1) adjudication of 2026-11-22.
// Runs the three consequences reported on Codex (stale render, batched add/remove,
// caller seed mutation) against the branch code and four partial fixes.
//   npm install   (once, in this folder)   then   node d1-counterfactuals.mjs
// The hook variants are inlined copies, not read from the lab repository.
import { JSDOM } from "jsdom";
import React, { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "http://localhost/" });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

const variants = {
  "V0 branch as is":                 (init) => { const [items,setItems]=useState(init); const addItem=useCallback((i)=>{items.push(i);setItems(items)},[items]); return {items,setItems,addItem}; },
  "V1 clone after push":             (init) => { const [items,setItems]=useState(init); const addItem=useCallback((i)=>{items.push(i);setItems([...items])},[items]); return {items,setItems,addItem}; },
  "V2 no push, [...items, item]":    (init) => { const [items,setItems]=useState(init); const addItem=useCallback((i)=>{setItems([...items,i])},[items]); return {items,setItems,addItem}; },
  "V3 copy seed only":               (init) => { const [items,setItems]=useState([...init]); const addItem=useCallback((i)=>{items.push(i);setItems(items)},[items]); return {items,setItems,addItem}; },
  "V4 functional updater (main)":    (init) => { const [items,setItems]=useState(init); const addItem=useCallback((i)=>{setItems((c)=>[...c,i])},[]); return {items,setItems,addItem}; },
};
const removeOf = (api) => (id) => api.setItems((c) => c.filter((x) => x.id !== id));

async function scenario(make, init, fn) {
  let api, bump;
  const C = () => { const [n, b] = useState(0); bump = () => b(n + 1); api = make(init); return h("p", null, api.items.map((x) => x.id).join(",")); };
  const el = document.createElement("div"); document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(h(C)));
  await fn(api, () => api, bump);
  return { el, api: () => api };
}

console.log("variant".padEnd(32), "A stale render", "| B batch add/remove", "| C seed mutated");
for (const [name, make] of Object.entries(variants)) {
  // A: isolated add must render the new item
  let a; { const s = await scenario(make, [], async (api) => { await act(async () => api.addItem({ id: "x", price: 1, quantity: 1 })); }); a = s.el.textContent === "x"; }
  // B: remove A then add B in one batch; after an independent re-render the cart must be only B
  let b, bTxt; { const s = await scenario(make, [{ id: "A", price: 1, quantity: 1 }], async (api, get, bump) => {
      await act(async () => { removeOf(api)("A"); api.addItem({ id: "B", price: 1, quantity: 1 }); });
      await act(async () => bump());
    }); bTxt = s.el.textContent; b = bTxt === "B"; }
  // C: caller's seed must not change
  let c; { const seed = []; await scenario(make, seed, async (api) => { await act(async () => api.addItem({ id: "x", price: 1, quantity: 1 })); }); c = seed.length === 0; }
  console.log(name.padEnd(32), (a ? "ok  " : "FAIL").padEnd(14), "|", ((b ? "ok" : "FAIL") + ` [${bTxt}]`).padEnd(19), "|", c ? "ok" : "FAIL");
}
