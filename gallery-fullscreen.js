/* Keep the gallery controls and sibling exhibit dialogs in the same fullscreen
 * document. Unsupported browsers expand the gallery within the browser window.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const button = document.getElementById('fullscreen-toggle');
  const label = document.getElementById('fullscreen-label');
  const frame = document.getElementById('gallery-frame');
  const exhibit = document.getElementById('exhibit-dialog');
  const announcement = document.getElementById('announcement');
  let expanded = false;
  let nativeSession = false;
  let workClosedDuringNativeExit = false;
  let savedScroll = { x: 0, y: 0 };

  function updateLayout(value) {
    if (value === expanded) return;
    if (value) savedScroll = { x: window.scrollX, y: window.scrollY };
    expanded = value;
    root.classList.toggle('gallery-fullscreen', value);
    button.setAttribute('aria-pressed', String(value));
    label.textContent = value ? 'Exit full screen' : 'Full screen';
    button.title = value ? 'Exit full screen (Escape)' : 'Explore the gallery in full screen';
    announcement.textContent = value ? 'Gallery expanded. Use Exit full screen or Escape to return.' : 'Returned to the exhibition page.';
    requestAnimationFrame(function () {
      frame.contentWindow.postMessage({ type: 'gallery-command', command: 'resize' }, location.origin);
      if (!exhibit.open) {
        (expanded ? frame : button).focus({ preventScroll: true });
      }
      if (!expanded) window.scrollTo(savedScroll.x, savedScroll.y);
    });
  }

  async function enter() {
    updateLayout(true);
    // Invoke within the button's user activation, without awaiting other work.
    if (root.requestFullscreen && document.fullscreenEnabled !== false) {
      try {
        await root.requestFullscreen();
        if (document.fullscreenElement === root) nativeSession = true;
      } catch (_) {
        // Embedded browsers may refuse native fullscreen. The expanded layout
        // remains usable, with the same visible exit and keyboard shortcut.
        if (expanded) announcement.textContent = 'Gallery expanded to fill this browser window. Use Exit full screen or Escape to return.';
      }
    }
  }

  async function exit() {
    if (nativeSession && document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch (_) { return; }
    }
    nativeSession = false;
    updateLayout(false);
  }

  button.addEventListener('click', async function () {
    button.disabled = true;
    try { await (expanded ? exit() : enter()); }
    finally { button.disabled = false; }
  });

  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement === root) {
      nativeSession = true;
      updateLayout(true);
    } else if (!document.fullscreenElement && nativeSession) {
      nativeSession = false;
      // A browser can consume Escape and exit native fullscreen itself.
      // When a work is open, close it and keep the gallery expanded in-page.
      if (exhibit.open) exhibit.close();
      else if (!workClosedDuringNativeExit) updateLayout(false);
      workClosedDuringNativeExit = false;
    }
    // A nested YouTube fullscreen player should keep the gallery expanded.
  });

  function stopNavigation() {
    frame.contentWindow.postMessage({ type: 'gallery-command', command: 'stop-tour' }, location.origin);
  }
  function closeWork() {
    // If the browser already left native fullscreen, its change event
    // may still be queued when the work's close request reaches us.
    workClosedDuringNativeExit = nativeSession && !document.fullscreenElement;
    exhibit.close();
  }
  function handleEscape(event) {
    if (document.fullscreenElement && document.fullscreenElement !== root) return;
    event?.preventDefault();
    if (event?.repeat) return;
    if (exhibit.open) {
      closeWork();
      return;
    }
    stopNavigation();
    if (expanded) exit();
  }
  exhibit.addEventListener('cancel', function (event) {
    event.preventDefault();
    if (exhibit.open) closeWork();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') handleEscape(event);
  }, true);
  window.addEventListener('message', function (event) {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (event.data?.type === 'gallery-escape') handleEscape();
  });
})();
