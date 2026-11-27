import { randomUUID } from 'node:crypto';
const exactlyOne = (...values) => values.filter(value => value !== undefined).length === 1;
export class Broker {
  tabs = []; lastSync = 0; pending = new Map(); queue = []; waiters = new Set();
  connectionId = null; sequence = -1; retiredConnections = new Set(); seen = new Map();
  // A tab leaves the list while its next document loads after navigation.
  // Calls for a recently listed tab wait this long for it to return.
  constructor({tabWait = 12000, recentTab = 60000} = {}) { this.tabWait = tabWait; this.recentTab = recentTab; }
  sync(tabs, results = [], metadata) {
    if (metadata) {
      const {connectionId,sequence}=metadata;
      if (this.retiredConnections.has(connectionId)) return [];
      if (connectionId !== this.connectionId) {
        if (this.connectionId) this.retiredConnections.add(this.connectionId);
        this.connectionId=connectionId;this.sequence=-1;
      }
      if (sequence <= this.sequence) return [];
      this.sequence=sequence;
    }
    this.lastSync = Date.now();
    for (const ready of this.waiters) ready();
    this.waiters.clear();
    this.tabs = tabs.filter(t => t && Number.isInteger(t.id) && typeof t.grantId === 'string' && t.grantId.length > 0 && /^https?:\/\//.test(t.url)).map(({id,url,title,grantId}) => ({id,url,title,grantId}));
    for (const t of this.tabs) this.seen.set(t.id,this.lastSync);
    for (const [id,time] of this.seen) if (this.lastSync - time > this.recentTab) this.seen.delete(id);
    for (const r of results) {
      const job = this.pending.get(r.id);
      if (job) { clearTimeout(job.timer); this.pending.delete(r.id); job.resolve(r.error ? {error:String(r.error)} : r.result); }
    }
    for (const [id, job] of this.pending) {
      if (!this.tabs.some(t => t.id === job.tabId && t.grantId === job.grantId)) {
        clearTimeout(job.timer); this.pending.delete(id); job.reject(new Error('Tab access revoked or document replaced'));
      }
    }
    const queued = this.queue; this.queue = [];
    return queued.filter(c => this.pending.has(c.id));
  }
  call(name, args = {}, timeout = 10000) {
    try {
      if (Date.now() - this.lastSync > 5000) this.tabs = [];
      if (name === 'list_tabs') return Promise.resolve(this.tabs.map(({id,url,title}) => ({id,url,title})));
      if (!['read_page','click','type','navigate'].includes(name)) throw new Error('Unknown tool');
      if (name === 'navigate' && !/^https?:\/\//.test(args.url || '')) throw new Error('Only HTTP(S) navigation allowed');
      if (name === 'click' && !(exactlyOne(args.handle,args.selector,args.text) && [args.handle,args.selector,args.text].every(v => v === undefined || typeof v === 'string'))) throw new Error('Element handle, selector or text required (exactly one)');
      if (name === 'type' && !(exactlyOne(args.handle,args.selector) && [args.handle,args.selector].every(v => v === undefined || typeof v === 'string'))) throw new Error('Element handle or selector required (exactly one)');
      if (name === 'type' && (typeof args.text !== 'string' || args.text.length > 10000)) throw new Error('Text must be at most 10000 characters');
      // Queue synchronously when the tab is listed, so the command binds to the
      // grant current at call time; otherwise wait for a recently listed tab.
      if (this.tabs.some(t => t.id === args.tabId)) return this.enqueue(name,args,timeout);
      return this.waitForTab(args.tabId).then(() => this.enqueue(name,args,timeout));
    } catch (error) { return Promise.reject(error); }
  }
  enqueue(name, args, timeout) {
    const tab = this.tabs.find(t => t.id === args.tabId);
    if (!tab) return Promise.reject(new Error('Tab is unavailable: check Safari website permission and Stop status'));
    if (this.pending.size >= 16) return Promise.reject(new Error('Queue full'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); this.queue = this.queue.filter(c => c.id !== id); reject(new Error('Extension did not respond; outcome unknown, inspect before retrying')); }, timeout);
      this.pending.set(id, {resolve, reject, timer, tabId: args.tabId, grantId: tab.grantId}); this.queue.push({id, name, args, grantId: tab.grantId});
    });
  }
  async waitForTab(tabId) {
    const present = () => this.tabs.some(t => t.id === tabId);
    if (present()) return true;
    const seen = this.seen.get(tabId);
    if (seen === undefined || Date.now() - seen > this.recentTab) return false;
    if (this.tabWait <= 0) return false;
    const deadline = Date.now() + this.tabWait;
    while (!present() && !this.closed && Date.now() < deadline) {
      await new Promise(resolve => {
        const ready=()=>{clearTimeout(timer);this.waiters.delete(ready);resolve();};
        const timer=setTimeout(ready,Math.max(0,deadline-Date.now()));this.waiters.add(ready);
      });
      if (Date.now() - this.lastSync > 5000) this.tabs = [];
    }
    return present();
  }
  async waitForSync(timeout = 3500) {
    if (Date.now()-this.lastSync < 3000) return;
    await new Promise(resolve => {
      const ready=()=>{clearTimeout(timer);this.waiters.delete(ready);resolve();};
      const timer=setTimeout(ready,timeout);this.waiters.add(ready);
    });
  }
  close() { this.closed = true; for (const ready of this.waiters) ready(); this.waiters.clear(); for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error('Bridge stopped')); } this.pending.clear(); this.queue = []; }
}
