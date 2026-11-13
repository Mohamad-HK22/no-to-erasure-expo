/* Keep Babylon's drawing surface in step with the visible canvas. Resizing a
 * browser pane must update the camera aspect, rather than stretch old pixels.
 */
(function () {
  'use strict';
  const active = new WeakMap();
  window.setupDemoViewport = function (engine, scene) {
    if (active.has(engine)) return active.get(engine);
    const canvas = engine && engine.getRenderingCanvas();
    if (!canvas) return function () {};
    let disposed = false, frame = null, observer = null, disposeObserver = null;

    function sync() {
      frame = null;
      if (disposed || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;
      // Babylon handles hardware scaling and invalidates each camera's cached
      // projection. Leave its buffer untouched while the gallery is hidden.
      engine.resize();
    }
    function schedule() {
      if (!disposed && frame === null) frame = window.requestAnimationFrame(sync);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (disposeObserver) scene.onDisposeObservable.remove(disposeObserver);
      active.delete(engine);
    }

    active.set(engine, dispose);
    if (typeof window.ResizeObserver === 'function') {
      observer = new window.ResizeObserver(schedule);
      observer.observe(canvas);
    }
    // This also covers older browsers and device-pixel-ratio window changes.
    window.addEventListener('resize', schedule);
    if (scene && scene.onDisposeObservable) disposeObserver = scene.onDisposeObservable.add(dispose);
    sync();
    return dispose;
  };
})();
