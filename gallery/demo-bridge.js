/* Local parent bridge for the OpenVGAL exhibition. Only same-origin messages
 * from the containing page are accepted. The connected rooms share one scene.
 */
(function () {
  'use strict';
  let ready = false;
  let pendingCommand = null;
  let paused = false;
  let pausedPose = null;
  let stopWalking = null;
  let tour = null;
  const walkSpeed = 3.8;
  const tourDwell = 4000;
  let lastSelected = { index: -1, at: 0 };
  const origin = location.origin;
  function emit(message) {
    if (parent !== window) parent.postMessage(message, origin);
  }
  function artworkItems() {
    if (typeof config_file_content === 'undefined' || !config_file_content || !current_gallery) return [];
    return Object.values(config_file_content[current_gallery]).filter(item => item && item.resource_type === 'image');
  }
  function record(index) {
    const items = artworkItems();
    if (!items.length) return null;
    index = ((index % items.length) + items.length) % items.length;
    return { item: items[index], index };
  }
  function clearMotion() {
    if (!scene || !scene.activeCamera) return;
    if (typeof window.resetDemoControls === 'function') window.resetDemoControls();
    const camera = scene.activeCamera;
    if (camera.cameraDirection) camera.cameraDirection.setAll(0);
    if (camera.cameraRotation) camera.cameraRotation.setAll(0);
    const keyboard = camera.inputs && camera.inputs.attached.keyboard;
    if (keyboard && Array.isArray(keyboard._keys)) keyboard._keys.length = 0;
    scene.stopAnimation(camera);
    if (typeof stopCinematicVisit === 'function') stopCinematicVisit();
  }
  function cancelNavigation() {
    if (tour) clearTimeout(tour.timer);
    if (!tour && !stopWalking) return;
    tour = null;
    stopWalking?.();
    emit({type:'walk-status', phase:'stopped'});
  }
  function publishLayout() {
    const layout = window.demoRoomLayout;
    if (!layout) return;
    const works = artworkItems().map(item => {
      const p = JSON.parse(item.location), n = JSON.parse(item.vector);
      return { id:item.exhibit_id, roomId:item.room_id, x:p[0], z:p[1], normalX:n[0], normalZ:n[1] };
    });
    emit({ type:'gallery-layout', rooms:layout.rooms, atrium:layout.atrium, bounds:layout.bounds, walls:layout.walls, works });
  }
  function publishPosition() {
    if (!ready || !scene || !scene.activeCamera || !window.demoRoomLayout) return;
    const camera=scene.activeCamera, p=camera.position;
    const forward=camera.getDirection(BABYLON.Axis.Z);
    const {rooms,atrium}=window.demoRoomLayout;
    function contains(r) {
      if (!r.polygon) return p.x >= r.x-r.width/2 && p.x <= r.x+r.width/2 && p.z >= r.z-r.depth/2 && p.z <= r.z+r.depth/2;
      let inside=false;
      for(let i=0,j=r.polygon.length-1;i<r.polygon.length;j=i++) {
        const a=r.polygon[i],b=r.polygon[j];
        if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) inside=!inside;
      }
      return inside;
    }
    const room=atrium && contains(atrium)?atrium:rooms.find(contains);
    emit({ type:'visitor-position', x:p.x, z:p.z, yaw:Math.atan2(forward.x,forward.z), roomId:room ? room.id : null });
  }
  function setPaused(value) {
    if (value === paused && (!value || pausedPose)) return;
    const wasPaused=paused;
    paused=value;window.demoGalleryPaused=value;
    if (!scene || !scene.activeCamera) return;
    const camera=scene.activeCamera;
    if (value) cancelNavigation();
    clearMotion();
    if (value) {
      if (!wasPaused || !pausedPose) pausedPose={position:camera.position.clone(),rotation:camera.rotation.clone()};
      camera.detachControl();
      sceneToRender=null;
    } else {
      if (pausedPose) {
        camera.position.copyFrom(pausedPose.position);
        camera.rotation.copyFrom(pausedPose.rotation);
      }
      pausedPose=null;
      clearMotion();
      camera.attachControl(canvas,true);
      sceneToRender=scene;
    }
    publishPosition();
  }
  function goToRoom(id) {
    const layout=window.demoRoomLayout;
    const room=layout && (id==='atrium'?layout.atrium:layout.rooms.find(r=>r.id===id));
    if (!room || !scene || !scene.activeCamera) return;
    if (paused) setPaused(false);
    cancelNavigation();
    clearMotion();
    const camera=scene.activeCamera, entry=room.entry;
    camera.position.set(entry.x,1.75,entry.z);
    camera.rotation.set(entry.pitch||0,entry.yaw||0,0);
    manual_navigation_idx=null;
    if (typeof hideInfoBox==='function') hideInfoBox();
    publishPosition();
    emit({type:'room-entered',id:room.id,title:room.title});
  }
  function walkToWork(index) {
    const work = record(index);
    if (!work || paused) return false;
    const pose = getArtworkPose(work.index);
    if (!pose) return false;
    const camera = scene.activeCamera;
    const route = window.planDemoWalk(window.demoRoomLayout, camera.position, pose.position);
    const details = {
      id: work.item.exhibit_id,
      title: work.item.metadata?.split('\n')[0] || '',
      tour: !!tour,
      stop: tour ? tour.index + 1 : 0,
      total: tour?.stops.length || 0
    };
    const report = phase => emit({type:'walk-status', phase, ...details});
    if (!route) {
      report('unavailable');
      return false;
    }
    clearMotion();
    manual_navigation_idx = work.index;
    if (typeof hideInfoBox === 'function') hideInfoBox();
    report('walking');
    function arrive() {
      camera.setTarget(pose.target);
      publishPosition();
      report('arrived');
      if (tour) tour.timer = setTimeout(advanceTour, tourDwell);
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.set(pose.position.x, 1.75, pose.position.z);
      arrive();
      return true;
    }
    // Keep walking at eye height and turn in place at corners. Position is
    // driven by the collision-checked route instead of by directional input.
    const radians = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
    const steps = [];
    const turn = (fromYaw, fromPitch, yaw, pitch) => {
      const offset = radians(yaw - fromYaw);
      const duration = Math.max(Math.abs(offset), Math.abs(pitch - fromPitch)) / 2.8;
      if (duration < .01) return;
      steps.push({duration, update(t) {
        const fraction = t * t * (3 - 2 * t);
        camera.rotation.set(fromPitch + (pitch - fromPitch) * fraction, fromYaw + offset * fraction, 0);
      }});
    };
    let start = camera.position;
    let yaw = camera.rotation.y, pitch = camera.rotation.x;
    for (const end of route) {
      const dx = end.x - start.x, dz = end.z - start.z;
      const distance = Math.hypot(dx, dz);
      if (distance < .001) continue;
      const heading = Math.atan2(dx, dz);
      turn(yaw, pitch, heading, 0);
      const x = start.x, z = start.z;
      steps.push({duration: distance / walkSpeed, update(t) {
        camera.position.set(x + dx * t, 1.75, z + dz * t);
      }});
      start = end;
      yaw = heading;
      pitch = 0;
    }
    const dx = pose.target.x - pose.position.x, dz = pose.target.z - pose.position.z;
    turn(yaw, pitch, Math.atan2(dx, dz), Math.atan2(1.75 - pose.target.y, Math.hypot(dx, dz)));
    if (!steps.length) {
      arrive();
      return true;
    }
    camera.detachControl();
    let elapsed = 0, stepIndex = 0;
    const observable = scene.onBeforeRenderObservable;
    const observer = observable.add(() => {
      elapsed += Math.min(scene.getEngine().getDeltaTime() / 1000, .05);
      while (stepIndex < steps.length && elapsed >= steps[stepIndex].duration) {
        const step = steps[stepIndex++];
        step.update(1);
        elapsed -= step.duration;
      }
      if (stepIndex < steps.length) {
        const step = steps[stepIndex];
        step.update(elapsed / step.duration);
      } else {
        stopWalking();
        arrive();
      }
    });
    stopWalking = () => {
      observable.remove(observer);
      stopWalking = null;
      if (!paused) camera.attachControl(canvas, true);
    };
    return true;
  }
  function advanceTour() {
    tour.index += 1;
    if (tour.index === tour.stops.length) {
      tour = null;
      emit({type:'walk-status', phase:'finished'});
    } else if (!walkToWork(tour.stops[tour.index])) {
      tour = null;
    }
  }
  function startTour() {
    cancelNavigation();
    if (paused) return;
    const works = artworkItems();
    const stops = [
      ['homes', 'nte-hvi-002'],
      ['nature', 'south'],
      ['heritage', 'nte-pch-map-01'],
      ['heritage', 'nte-pch-art-002'],
      ['health', 'healthocide-medical-neutrality']
    ].map(([roomId, id]) => {
      const preferred = works.findIndex(item => item.exhibit_id === id);
      return preferred >= 0 ? preferred : works.findIndex(item => item.room_id === roomId);
    }).filter(index => index >= 0);
    if (!stops.length) return;
    tour = {stops: [...new Set(stops)], index: -1, timer: null};
    advanceTour();
  }
  function reset() {
    goToRoom('atrium');
    emit({type:'gallery-reset'});
  }
  function command(data) {
    if(data.command==='request-layout') {publishLayout();publishPosition();return;}
    if(data.command==='position') return publishPosition();
    if(data.command==='resize') {if(window.engine) window.engine.resize();publishPosition();return;}
    if(data.command==='pause') return setPaused(true);
    if(data.command==='resume') return setPaused(false);
    if(data.command==='stop-tour') return cancelNavigation();
    if(!ready) {pendingCommand=data;return;}
    if(data.command==='reset') return reset();
    if(data.command==='room') return goToRoom(data.id);
    if(data.command==='help') return typeof toggleHelp==='function' && toggleHelp();
    if(data.command==='start-tour') return startTour();
    if(data.command==='focus') {
      const index=artworkItems().findIndex(item=>item.exhibit_id===data.id);
      if (index >= 0) {
        if (paused) setPaused(false);
        cancelNavigation();
        walkToWork(index);
      }
    } else if (data.command==='next' || data.command==='previous') {
      cancelNavigation();
      const index = data.command==='next' ? (manual_navigation_idx ?? -1) + 1 : (manual_navigation_idx ?? 0) - 1;
      walkToWork(index);
    }
  }
  window.demoExhibitSelected=function(index) {
    const target=record(index);
    if(!target || paused) return;
    const now=performance.now();
    if(lastSelected.index===target.index && now-lastSelected.at<150) return;
    lastSelected={index:target.index,at:now};
    manual_navigation_idx=target.index;
    // Freeze at the exact clicked pose before the parent opens its inspector.
    // Standalone viewer keeps its original inspection navigation.
    if(parent===window) {clearMotion();manual_move();return;}
    setPaused(true);
    emit({type:'exhibit-selected',id:target.item.exhibit_id,index:target.index});
  };
  window.demoGalleryReady=function() {
    if(ready) return;
    requestAnimationFrame(function(){
      if(!scene || !scene.activeCamera || ready) return;
      ready=true;
      if(window.setupDemoViewport) window.setupDemoViewport(scene.getEngine(),scene);
      scene.onPointerObservable.add(function(event){
        if(event.type!==BABYLON.PointerEventTypes.POINTERPICK || paused) return;
        const mesh=event.pickInfo && event.pickInfo.pickedMesh;
        const index=mesh && mesh.metadata && mesh.metadata.ovgal_artwork_idx;
        if(typeof index==='number') window.demoExhibitSelected(index);
      });
      const shouldPause=paused;
      paused=false;pausedPose=null;
      reset();
      publishLayout();
      emit({type:'gallery-ready',count:artworkItems().length,rooms:window.demoRoomLayout.rooms.length});
      if(pendingCommand) {const next=pendingCommand;pendingCommand=null;command(next);}
      if(shouldPause) setPaused(true);
    });
  };
  const readinessPoll=setInterval(function(){
    if(ready) {clearInterval(readinessPoll);return;}
    const finished=document.getElementById('loaded');
    const phasesDone=typeof _loadPhase!=='undefined' && _loadPhase.artworks && _loadPhase.lights;
    if(finished || phasesDone) window.demoGalleryReady();
  },200);
  // The marker follows actual camera movement, including ordinary walking.
  setInterval(publishPosition,125);
  // Keyboard events in this iframe do not bubble to the page's fallback view.
  window.addEventListener('keydown',function(event){
    if (/^(Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|[wasd])$/i.test(event.key)) cancelNavigation();
    if(event.key==='Escape') emit({type:'gallery-escape'});
  },true);
  document.getElementById('renderCanvas').addEventListener('pointerdown',cancelNavigation,true);
  window.addEventListener('message',function(event){
    if(event.source!==parent || event.origin!==origin) return;
    const data=event.data;
    if(data && data.type==='gallery-command') command(data);
  });
  window.addEventListener('error',function(event){emit({type:'gallery-error',message:event.message||'The 3D viewer could not load.'});});
  window.addEventListener('unhandledrejection',function(event){emit({type:'gallery-error',message:String(event.reason && event.reason.message || event.reason)});});
})();
