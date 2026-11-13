/* Responsive movement for the local exhibition. No remote dependencies. */
(function () {
  'use strict';
  const defaults = Object.freeze({
    speed: 0.56,
    inertia: 0.45,
    mouseSensitivity: 1280,
    touchSensitivity: 7500,
    touchMoveSensitivity: 600,
    boost: 1.65
  });
  window.demoControlDefaults = defaults;
  window.setupDemoControls = function (camera, scene) {
    if (camera.metadata && camera.metadata.demoControls) return;
    camera.metadata = Object.assign({}, camera.metadata, {demoControls: true});
    camera.speed = defaults.speed;
    camera.inertia = defaults.inertia;
    camera.angularSensibility = defaults.mouseSensitivity;
    camera.touchAngularSensibility = defaults.touchSensitivity;
    camera.touchMoveSensibility = defaults.touchMoveSensitivity;
    const inputs = camera.inputs && camera.inputs.attached;
    if (inputs && inputs.mouse) inputs.mouse.angularSensibility = defaults.mouseSensitivity;
    if (inputs && inputs.touch) {
      inputs.touch.touchAngularSensibility = defaults.touchSensitivity;
      inputs.touch.touchMoveSensibility = defaults.touchMoveSensitivity;
    }
    let boosting = false;
    function reset() {
      boosting = false;
      camera.speed = defaults.speed;
    }
    function keydown(event) {
      if (event.key !== 'Shift' || event.repeat || window.demoGalleryPaused || document.hidden) return;
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      boosting = true;
      camera.speed = defaults.speed * defaults.boost;
    }
    function keyup(event) { if (event.key === 'Shift') reset(); }
    function visibility() { if (document.hidden) reset(); }
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    window.resetDemoControls = reset;
    // A pause can happen between a held key and its corresponding keyup.
    scene.onBeforeRenderObservable.add(function () {
      if (boosting && window.demoGalleryPaused) reset();
    });
    scene.onDisposeObservable.add(function () {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      if (window.resetDemoControls === reset) delete window.resetDemoControls;
    });
  };
})();
