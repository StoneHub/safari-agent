import { randomUUID } from 'node:crypto';
export class Broker {
  tabs = []; lastSync = 0; pending = new Map(); queue = []; waiters = new Set();
  connectionId = null; sequence = -1; retiredConnections = new Set();
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
    if (Date.now() - this.lastSync > 5000) this.tabs = [];
    if (name === 'list_tabs') return Promise.resolve(this.tabs.map(({id,url,title}) => ({id,url,title})));
    if (!this.tabs.some(t => t.id === args.tabId)) return Promise.reject(new Error('Tab is unavailable: check Safari website permission and Stop status'));
    if (!['read_page','click','type','navigate'].includes(name)) return Promise.reject(new Error('Unknown tool'));
    if (name === 'navigate' && !/^https?:\/\//.test(args.url || '')) return Promise.reject(new Error('Only HTTP(S) navigation allowed'));
    if (['click','type'].includes(name) && typeof args.handle !== 'string') return Promise.reject(new Error('Element handle required'));
    if (name === 'type' && (typeof args.text !== 'string' || args.text.length > 10000)) return Promise.reject(new Error('Text must be at most 10000 characters'));
    if (this.pending.size >= 16) return Promise.reject(new Error('Queue full'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); this.queue = this.queue.filter(c => c.id !== id); reject(new Error('Extension did not respond; outcome unknown, inspect before retrying')); }, timeout);
      const grantId = this.tabs.find(t => t.id === args.tabId).grantId;
      this.pending.set(id, {resolve, reject, timer, tabId: args.tabId, grantId}); this.queue.push({id, name, args, grantId});
    });
  }
  async waitForSync(timeout = 3500) {
    if (Date.now()-this.lastSync < 3000) return;
    await new Promise(resolve => {
      const ready=()=>{clearTimeout(timer);this.waiters.delete(ready);resolve();};
      const timer=setTimeout(ready,timeout);this.waiters.add(ready);
    });
  }
  close() { for (const ready of this.waiters) ready(); this.waiters.clear(); for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error('Bridge stopped')); } this.pending.clear(); this.queue = []; }
}
