(() => {
  if (globalThis.__safariAgentInstalled) return;
  globalThis.__safariAgentInstalled = true;
  const documentId = crypto.randomUUID(), handles = new Map();
  const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const clean = value => String(value || '').replace(/\s+/g,' ').trim();
  // Widget roles come first when the element cap is reached, so page tabs,
  // dropdown options and menu entries are not crowded out by long link lists.
  const widgetRoles = ['tab','option','menuitem','menuitemcheckbox','menuitemradio','combobox','listbox','treeitem'];
  const controlRoles = ['button','checkbox','radio','switch','link'];
  const interactive = ['a','button','input:not([type="hidden"])','textarea','select','summary','mat-select','mat-option',
    ...[...widgetRoles,...controlRoles].map(role => `[role="${role}"]`),'[tabindex]:not([tabindex="-1"])','[onclick]'].join(',');
  const roleOf = el => el.getAttribute('role') || '';
  const priority = el => {
    const role = roleOf(el), tag = el.tagName.toLowerCase();
    if (widgetRoles.includes(role) || tag === 'mat-select' || tag === 'mat-option') return 0;
    if (['button','input','textarea','select','summary'].includes(tag) || controlRoles.includes(role)) return 1;
    if (tag === 'a') return 2;
    return 3;
  };
  const labelOf = el => {
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById?.(id)?.innerText || '').join(' ');
    // A wrapping <label> also contains the control's own text (e.g. select options).
    const label = el.labels?.[0] ? clean(el.labels[0].innerText).replace(clean(el.innerText),'') : '';
    return clean(el.getAttribute('aria-label') || labelledBy || label || el.innerText ||
      el.getAttribute('placeholder') || el.getAttribute('title') || (['button','submit','reset'].includes(el.type) ? el.value : '')).slice(0,200);
  };
  const handleFor = el => {
    let handle = [...handles].find(([,node]) => node === el)?.[0];
    if (!handle) { handle = crypto.randomUUID(); handles.set(handle,el); }
    return handle;
  };
  const describe = el => {
    const entry = {handle:handleFor(el),tag:el.tagName.toLowerCase(),label:labelOf(el),type:el.type || ''};
    const role = roleOf(el); if (role) entry.role = role;
    for (const state of ['selected','expanded','checked','pressed']) {
      const value = el.getAttribute(`aria-${state}`);
      if (value === 'true' || value === 'false') entry[state] = value === 'true';
    }
    if (typeof el.checked === 'boolean' && ['checkbox','radio'].includes(el.type)) entry.checked = el.checked;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') entry.disabled = true;
    if (el.tagName === 'SELECT') entry.options = [...el.options].slice(0,50).map(option => clean(option.text).slice(0,100));
    return entry;
  };
  // Visible interactive elements in document order, minus nested focus wrappers
  // that only repeat an already-listed control (e.g. a tabindex div inside a tab).
  const candidates = () => {
    const found = [...document.querySelectorAll(interactive)].slice(0,3000).filter(visible);
    const kept = new Set(found);
    return found.filter(el => {
      if (priority(el) < 3) return true;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) if (kept.has(parent) && priority(parent) < 3) { kept.delete(el); return false; }
      return true;
    });
  };
  const usable = el => {
    if (!el?.isConnected || !visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error('Stale or unavailable element; read page again');
    return el;
  };
  const single = (matches, what) => {
    if (!matches.length) throw new Error(`No visible element matches that ${what}; read page again`);
    if (matches.length > 1) throw new Error(`${matches.length} visible elements match that ${what}; use a handle or a more specific selector`);
    return matches[0];
  };
  const byText = text => {
    const wanted = clean(text).toLowerCase();
    if (!wanted) throw new Error('Text required');
    const listed = candidates();
    const exact = listed.filter(el => labelOf(el).toLowerCase() === wanted);
    if (exact.length) return single(exact,'text');
    // Framework click handlers leave no trace in the DOM, so fall back to the
    // innermost visible element whose own text matches exactly.
    // The click lands on that text element and bubbles to the handler.
    const all = [...(document.body?.querySelectorAll('*') || [])].slice(0,5000);
    const textual = all.filter(el => (el.textContent || '').length < wanted.length*4+200 && clean(el.textContent).toLowerCase() === wanted && visible(el));
    return single(textual.filter(el => !textual.some(other => other !== el && el.contains(other))),'text');
  };
  const target = args => {
    if (typeof args.handle === 'string') return usable(handles.get(args.handle));
    if (typeof args.selector === 'string') {
      if (!args.selector || args.selector.length > 1000) throw new Error('Invalid selector');
      let matches; try { matches = [...document.querySelectorAll(args.selector)]; } catch { throw new Error('Invalid selector'); }
      return usable(single(matches.filter(visible),'selector'));
    }
    if (typeof args.text === 'string' && args.text.length <= 500) return usable(byText(args.text));
    throw new Error('Element handle, selector or text required');
  };
  // Many component libraries (Angular Material, Radix, MUI) listen on an inner
  // trigger or on pointer/mouse down, so a bare el.click() on the host does
  // nothing. Send the sequence a real click produces to the element on top.
  const contains = (box, x, y) => box.width && box.height && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  // Background tabs and covered elements can defeat elementFromPoint, so fall
  // back to the innermost descendant whose box holds the point.
  const innermostAt = (el, x, y) => {
    for (let node = el, next; ; node = next) {
      next = [...node.children].reverse().find(child => contains(child.getBoundingClientRect(),x,y) && visible(child));
      if (!next) return node;
    }
  };
  const activate = el => {
    el.scrollIntoView?.({block:'center',inline:'center'});
    const box = el.getBoundingClientRect?.();
    let hit = el;
    if (box?.width && box?.height) {
      const clientX = box.left + box.width/2, clientY = box.top + box.height/2;
      const top = document.elementFromPoint?.(clientX,clientY);
      hit = top && el.contains(top) ? top : innermostAt(el,clientX,clientY);
      // SVG icons have no click(); and never hand the click to a different
      // control nested inside the target (e.g. a button inside a card link).
      while (hit !== el && typeof hit.click !== 'function') hit = hit.parentElement || el;
      const control = hit === el ? el : hit.closest?.(interactive);
      if (control && control !== el && el.contains(control)) hit = el;
      const init = {bubbles:true,cancelable:true,composed:true,clientX,clientY,button:0};
      const pointer = typeof PointerEvent === 'function', mouse = typeof MouseEvent === 'function';
      if (pointer) hit.dispatchEvent(new PointerEvent('pointerdown',{...init,buttons:1,pointerType:'mouse',isPrimary:true}));
      if (mouse) hit.dispatchEvent(new MouseEvent('mousedown',{...init,buttons:1}));
      if (pointer) hit.dispatchEvent(new PointerEvent('pointerup',{...init,buttons:0,pointerType:'mouse',isPrimary:true}));
      if (mouse) hit.dispatchEvent(new MouseEvent('mouseup',{...init,buttons:0}));
    }
    hit.click();
  };
  browser.runtime.onMessage.addListener(message => {
    if (message.kind === 'identify') return Promise.resolve(documentId);
    if (message.kind === 'state') return Promise.resolve({url:location.href,ready:document.readyState});
    if (message.kind !== 'agent-command') return;
    return Promise.resolve().then(() => {
      if (message.document !== documentId) throw new Error('Document changed; grant again');
      const {name} = message.command, args = message.command.args || {};
      if (name === 'read_page') {
        // Handles stay bound to their actual DOM node, never a reused CSS selector.
        const listed = candidates();
        const chosen = listed.length <= 150 ? listed :
          new Set(listed.map((el,index) => ({el,index,rank:priority(el)})).sort((a,b) => a.rank-b.rank || a.index-b.index).slice(0,150).map(item => item.el));
        const elements = listed.filter(el => listed.length <= 150 || chosen.has(el)).map(describe);
        for (const [key,node] of handles) if (!node.isConnected) handles.delete(key);
        return {url:location.href,title:document.title,text:(document.body?.innerText || '').slice(0,30000),elements,
          ...(listed.length > 150 ? {elementsOmitted:listed.length-150} : {})};
      }
      if (name === 'click') {
        const el = target(args);
        activate(el);
        return {clicked:true,tag:el.tagName.toLowerCase(),label:labelOf(el),...(roleOf(el) ? {role:roleOf(el)} : {})};
      }
      if (name === 'type') {
        const el = target({handle:args.handle,selector:args.selector});
        if (typeof args.text !== 'string' || args.text.length > 10000) throw new Error('Invalid text');
        if (el.tagName === 'SELECT') {
          const wanted = clean(args.text);
          const option = [...el.options].find(o => clean(o.text) === wanted) || [...el.options].find(o => o.value === args.text);
          if (!option || option.disabled) throw new Error('No matching enabled option; read page for option labels');
          el.selectedIndex = option.index;
        } else {
          if (!['INPUT','TEXTAREA'].includes(el.tagName) || el.readOnly || ['password','file','hidden'].includes(el.type)) throw new Error('Field cannot be edited by agent');
          const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value').set.call(el,args.text);
        }
        el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
        return {typed:true};
      }
      throw new Error('Unsupported command');
    });
  });
})();
