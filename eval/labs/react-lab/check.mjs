// Behaviour checks for the React lab hooks. Run through verify.mjs, not directly:
// it copies the hooks of one git ref into a directory below this folder so that
// `react` resolves from this folder's node_modules.
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const hooksDir = path.resolve(process.argv[2]);
const load = (name) => import(pathToFileURL(path.join(hooksDir, `${name}.js`)).href);
const results = [];
const check = (id, name, ok, note) => results.push({ id, name, ok, note });

async function mount(Component) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(h(Component)));
  return { el, root };
}

// D1 (state): useCart.addItem must re-render with the new item.
{
  const { useCart } = await load("useCart");
  let api;
  const C = () => { api = useCart([]); return h("p", null, String(api.items.length)); };
  const { el } = await mount(C);
  await act(async () => api.addItem({ id: 1, price: 2, quantity: 1 }));
  check("D1", "useCart re-renders after addItem", el.textContent === "1", `rendered=${el.textContent}`);
}

// D2 (cleanup): useWindowWidth must remove its resize listener on unmount.
{
  const { useWindowWidth } = await load("useWindowWidth");
  let added = 0;
  let removed = 0;
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, ...rest) => { if (type === "resize") added++; return add(type, ...rest); };
  window.removeEventListener = (type, ...rest) => { if (type === "resize") removed++; return remove(type, ...rest); };
  const C = () => h("p", null, String(useWindowWidth()));
  const { root } = await mount(C);
  await act(async () => root.unmount());
  window.addEventListener = add;
  window.removeEventListener = remove;
  check("D2", "useWindowWidth cleans up its listener", added > 0 && added === removed, `added=${added} removed=${removed}`);
}

// D3 (stale response): an older response must not overwrite the newest query.
{
  const { useUserSearch } = await load("useUserSearch");
  const pending = {};
  globalThis.fetch = (url) => new Promise((resolve) => {
    pending[decodeURIComponent(url.split("q=")[1])] = () => resolve({ json: async () => [url] });
  });
  let setQuery;
  const C = () => {
    const [q, set] = React.useState("a");
    setQuery = set;
    return h("p", null, useUserSearch(q).results.join(","));
  };
  const { el } = await mount(C);
  await act(async () => setQuery("ab"));
  await act(async () => { pending["ab"](); });
  await act(async () => { pending["a"](); });
  check("D3", "useUserSearch ignores a stale response", el.textContent.includes("q=ab"), `rendered=${el.textContent}`);
}

// C1 (control): useToggle flips once per call.
{
  const { useToggle } = await load("useToggle");
  let toggle;
  const C = () => { const [v, t] = useToggle(false); toggle = t; return h("p", null, String(v)); };
  const { el } = await mount(C);
  await act(async () => { toggle(); toggle(); toggle(); });
  check("C1", "useToggle flips once per call", el.textContent === "true", `rendered=${el.textContent}`);
}

// C2 (control): useDocumentTitle sets and restores the title.
{
  const { useDocumentTitle } = await load("useDocumentTitle");
  document.title = "orig";
  const C = () => { useDocumentTitle("hello"); return null; };
  const { root } = await mount(C);
  const during = document.title;
  await act(async () => root.unmount());
  check("C2", "useDocumentTitle sets and restores", during.startsWith("hello") && document.title === "orig", `during=${during} after=${document.title}`);
}

// C3 (control): useUser ignores a response for a previous id.
{
  const { useUser } = await load("useUser");
  const pending = {};
  globalThis.fetch = (url) => new Promise((resolve) => {
    const id = url.split("/").pop();
    pending[id] = () => resolve({ ok: true, json: async () => ({ id }) });
  });
  let setId;
  const C = () => {
    const [id, set] = React.useState("1");
    setId = set;
    const { user } = useUser(id);
    return h("p", null, user ? user.id : "none");
  };
  const { el } = await mount(C);
  await act(async () => setId("2"));
  await act(async () => { pending["2"](); });
  await act(async () => { pending["1"](); });
  check("C3", "useUser ignores a stale user", el.textContent === "2", `rendered=${el.textContent}`);
}

console.log(JSON.stringify(results));
process.exit(0);
