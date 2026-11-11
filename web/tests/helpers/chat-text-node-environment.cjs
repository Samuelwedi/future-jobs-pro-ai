// Explicit test-only fallback, not a browser emulator or persistence proof.
// VM contexts simulate page/module restarts and tabs; fake-indexeddb supplies
// transactional IDB scheduling. No network/server, disk storage, React renderer
// or real browser lifecycle runs in this mode.
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
function createNodeBrowser(fake, scripts) {
  class Context {
    constructor() { this.factory = new fake.IDBFactory(); this.values = new Map(); this.pages = []; }
    async newPage() { const page = new Page(this); this.pages.push(page); return page; }
    async close() { for (const page of this.pages) page.cleanup(); }
  }
  class Page {
    constructor(context) { this.owner = context; this.timers = new Set(); }
    context() { return this.owner; }
    cleanup() { for (const timer of this.timers) { clearTimeout(timer); clearInterval(timer); } this.timers.clear(); }
    async goto(url) {
      this.cleanup();
      const target = new EventTarget(), document = new EventTarget(), owner = this.owner;
      const storage = { getItem: key => owner.values.get(key) ?? null,
        setItem: (key, value) => { const oldValue = owner.values.get(key) ?? null; owner.values.set(key, String(value)); notify(key, oldValue, String(value)); },
        removeItem: key => { const oldValue = owner.values.get(key) ?? null; owner.values.delete(key); notify(key, oldValue, null); },
      };
      function notify(key, oldValue, newValue) {
        for (const page of owner.pages) if (page !== self && page.sandbox) {
          const event = new Event('storage'); Object.assign(event, { storageArea: page.sandbox.localStorage, key, oldValue, newValue });
          queueMicrotask(() => page.sandbox.dispatchEvent(event));
        }
      }
      const self = this, location = { origin: new URL(url).origin, pathname: new URL(url).pathname };
      const sandbox = this.sandbox = { console, structuredClone, crypto: webcrypto, indexedDB: owner.factory,
        IDBObjectStore: fake.IDBObjectStore, DOMException, AbortController, Response, URL, URLSearchParams, Event, CustomEvent,
        localStorage: storage, document, navigator: {}, location,
        history: { pushState: (_state, _unused, path) => { location.pathname = new URL(path, location.origin).pathname; } },
        addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target),
        setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); self.timers.add(timer); return timer; },
        clearTimeout: timer => { clearTimeout(timer); self.timers.delete(timer); },
        setInterval: (fn, delay) => { const timer = setInterval(fn, delay); self.timers.add(timer); return timer; },
        clearInterval: timer => { clearInterval(timer); self.timers.delete(timer); },
      };
      sandbox.window = sandbox;
      this.vm = vm.createContext(sandbox);
      vm.runInContext(`const factories={},modules={};${scripts}\nwindow.mod=name=>{name=name.replace('./','');if(!modules[name]){const exports={};modules[name]=exports;factories[name](exports,window.mod);}return modules[name];};`, this.vm);
    }
    async reload() { await this.goto(this.sandbox.location.origin + this.sandbox.location.pathname); }
    async evaluate(fn, argument) {
      this.sandbox.__argument = structuredClone(argument);
      return structuredClone(await vm.runInContext(`(${fn.toString()})(__argument)`, this.vm));
    }
  }
  const contexts = [];
  return { async newContext() { const context = new Context(); contexts.push(context); return context; }, async close() { for (const context of contexts) await context.close(); } };
}
module.exports = { createNodeBrowser };
