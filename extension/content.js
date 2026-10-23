(() => {
  if (globalThis.__safariAgentInstalled) return;
  globalThis.__safariAgentInstalled = true;
  const documentId = crypto.randomUUID(), handles = new Map();
  const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  browser.runtime.onMessage.addListener(message => {
    if (message.kind === 'identify') return Promise.resolve(documentId);
    if (message.kind !== 'agent-command') return;
    return Promise.resolve().then(() => {
      if (message.document !== documentId) throw new Error('Document changed; grant again');
      const {name,args} = message.command;
      if (name === 'read_page') {
        // Handles stay bound to their actual DOM node, never a reused CSS selector.
        const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(visible).slice(0,150).map(el => {
          let handle = [...handles].find(([,node]) => node === el)?.[0];
          if (!handle) { handle = crypto.randomUUID(); handles.set(handle,el); }
          return {handle,tag:el.tagName.toLowerCase(),label:(el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.getAttribute('placeholder') || '').slice(0,200),type:el.type || ''};
        });
        for (const [key,node] of handles) if (!node.isConnected) handles.delete(key);
        return {url:location.href,title:document.title,text:(document.body?.innerText || '').slice(0,30000),elements};
      }
      const el = handles.get(args.handle);
      if (!el?.isConnected || !visible(el) || el.disabled) throw new Error('Stale or unavailable element; read page again');
      if (name === 'click') { el.click(); return {clicked:true}; }
      if (name === 'type') {
        if (!['INPUT','TEXTAREA'].includes(el.tagName) || el.readOnly || ['password','file','hidden'].includes(el.type)) throw new Error('Field cannot be edited by agent');
        if (typeof args.text !== 'string' || args.text.length > 10000) throw new Error('Invalid text');
        const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(el,args.text);
        el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
        return {typed:true};
      }
      throw new Error('Unsupported command');
    });
  });
})();
