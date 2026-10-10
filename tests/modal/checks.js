/* Shared browser checks. A native keyboard still needs an iPad device test. */
(async () => {
  const report = (message) => window.webkit?.messageHandlers.results.postMessage(message) ?? console.log(message);
  const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const panel = () => [...document.querySelectorAll('.app-modal-panel')].at(-1);
  const focus = async (field) => { assert(field, 'field exists'); field.focus(); await wait(700); };
  const viewport = async (bounds, event = 'resize') => {
    Object.assign(window.visualViewport, bounds);
    window.visualViewport.dispatchEvent(new Event(event));
    await wait();
  };
  const visible = (field) => {
    const rect = field.getBoundingClientRect();
    const area = panel().getBoundingClientRect();
    const vv = window.visualViewport;
    assert(document.activeElement === field, 'focus retained');
    assert(rect.top >= Math.max(area.top, vv.offsetTop) - 1 && rect.bottom <= Math.min(area.bottom, vv.offsetTop + vv.height) + 1,
      `field clipped: ${JSON.stringify({ field: rect.toJSON(), panel: area.toJSON(), vv: {height:vv.height,offsetTop:vv.offsetTop} })}`);
    if (field.matches('input,textarea')) assert(parseFloat(getComputedStyle(field).fontSize) >= 16, 'input avoids iOS auto zoom');
  };
  try {
    await wait();
    window.openModal('save'); await wait();
    assert(document.activeElement === panel(), 'opening focuses dialog, not input/keyboard');
    const initialPanel = panel().getBoundingClientRect();
    assert(Math.abs(initialPanel.top - (window.visualViewport.height - initialPanel.height) / 2) <= 2,
      'Add to page opens vertically centered');
    assert(document.querySelector('.app-viewport').closest('[inert]'), 'background is inert');
    assert(document.documentElement.style.overflow === 'hidden', 'document scroll locked');
    const touch = (type) => {
      const event = new Event(type, {bubbles:true, cancelable:true});
      Object.defineProperty(event, 'touches', {value:[{clientX:4, clientY:4}]});
      document.querySelector('.app-modal-frame').dispatchEvent(event);
      return event;
    };
    touch('touchstart');
    assert(touch('touchmove').defaultPrevented, 'iOS backdrop touch cannot pan the document');
    const name = document.querySelector('input[placeholder="Untitled page"]');
    await focus(name);
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const height of [650, 500, 350, 250, 400, 768]) {
        await viewport({height}); visible(name);
        const expectedTop = height < window.innerHeight - 48
          ? initialPanel.top - 48
          : initialPanel.top;
        const actualTop = panel().getBoundingClientRect().top;
        assert(Math.abs(actualTop - expectedTop) < 1,
          `modal uses one fixed keyboard lift instead of resizing jumps: ${JSON.stringify({height, actualTop, expectedTop, initialTop:initialPanel.top, innerHeight:window.innerHeight})}`);
      }
    }
    report('PASS: repeated keyboard resize, stable top, input visibility and background isolation');
    await viewport({height:350,offsetTop:75},'scroll'); visible(name);
    await viewport({offsetTop:0},'scroll'); visible(name);
    [...panel().querySelectorAll('button')].find(b => b.textContent.includes('Existing Page')).click();
    await wait(); const search = panel().querySelector('input[type="search"]'); await focus(search); visible(search);
    [...panel().querySelectorAll('button')].find(b => b.textContent.includes('New Page')).click();
    await wait(); await focus(panel().querySelector('input')); visible(panel().querySelector('input'));
    report('PASS: viewport panning and switching new/existing pages');
    window.openNested(true); await wait(); await focus(panel().querySelector('input')); visible(panel().querySelector('input'));
    window.openNested(false); await wait();
    assert(document.documentElement.classList.contains('app-modal-open'), 'nested close retains app lock');
    assert(document.querySelector('.app-viewport').closest('[inert]'), 'nested close retains background isolation');
    window.openModal(null); await wait();
    assert(!document.documentElement.classList.contains('app-modal-open'), 'final close releases app lock');
    assert(!document.querySelector('.app-viewport').closest('[inert]'), 'final close releases background');
    assert(document.documentElement.style.overflow === '', 'final close restores document overflow');
    report('PASS: nested modal ownership and cleanup under React StrictMode');
    window.openModal('share'); await wait();
    const shareTop = panel().getBoundingClientRect().top;
    const fields = [...panel().querySelectorAll('input:not([type="file"]),textarea')];
    assert(fields.length >= 5, 'actual share form fields loaded');
    for (const field of [fields.at(-1), fields[0], fields.at(-2), fields[1]]) {
      await focus(field); visible(field);
      assert(Math.abs(panel().getBoundingClientRect().top - shareTop) < 1, 'share panel never translates to reveal fields');
    }
    for (const height of [220, 180, 300, 768]) {
      await viewport({height, width:height === 180 ? 1000 : 768});
      await focus(fields.at(-1)); visible(fields.at(-1));
    }
    report('PASS: actual Share resource bottom/top inputs and short landscape viewport');
    panel().scrollTop = 0;
    await wait();
    assert(panel().scrollTop === 0, 'manual form scrolling is not snapped back to the focused input');
    const save = [...panel().querySelectorAll('button')].find(button => button.textContent.includes('Publish'));
    await focus(save); visible(save);
    window.openModal(null); await wait();
    window.openModal('save'); await wait();
    await focus(panel().querySelector('input')); visible(panel().querySelector('input'));
    window.openModal(null); await wait();
    assert(!document.documentElement.classList.contains('app-modal-open'), 'repeated open/close cleans up');
    report('PASS: actions reachable, reopen with keyboard visible, final cleanup');
    report('DONE');
  } catch (error) { report('FAIL: ' + error.message + '\n' + error.stack); }
})();
