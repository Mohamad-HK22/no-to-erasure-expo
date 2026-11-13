/* Local parent bridge for the OpenVGAL exhibition. Only same-origin messages
 * from the containing page are accepted. The connected rooms share one scene.
 */
(function () {
  'use strict';
  let ready = false;
  let pendingCommand = null;
  let paused = false;
  let pausedPose = null;
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
    clearMotion();
    const camera=scene.activeCamera, entry=room.entry;
    camera.position.set(entry.x,1.75,entry.z);
    camera.rotation.set(entry.pitch||0,entry.yaw||0,0);
    manual_navigation_idx=null;
    if (typeof hideInfoBox==='function') hideInfoBox();
    publishPosition();
    emit({type:'room-entered',id:room.id,title:room.title});
  }
  function focus(index) {
    const target=record(index);
    if (!target || !scene || !scene.activeCamera) return;
    if (paused) setPaused(false);
    clearMotion();
    manual_navigation_idx=target.index;
    manual_move();
    // Keep the visitor at natural eye height while retaining OpenVGAL's pose.
    const pose=getArtworkPose(target.index);
    scene.activeCamera.position.y=1.75;
    if(pose) scene.activeCamera.setTarget(pose.target);
    if(typeof hideInfoBox==='function') hideInfoBox();
    publishPosition();
    emit({type:'exhibit-focused',id:target.item.exhibit_id,index:target.index});
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
    if(!ready) {pendingCommand=data;return;}
    if(data.command==='reset') return reset();
    if(data.command==='room') return goToRoom(data.id);
    if(data.command==='help') return typeof toggleHelp==='function' && toggleHelp();
    if(data.command==='focus') {
      const index=artworkItems().findIndex(item=>item.exhibit_id===data.id);
      if(index>=0) focus(index);
    } else if(data.command==='next') {
      focus(manual_navigation_idx===null?0:manual_navigation_idx+1);
    } else if(data.command==='previous') {
      focus(manual_navigation_idx===null?artworkItems().length-1:manual_navigation_idx-1);
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
    if(parent===window) {focus(target.index);return;}
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
    if(event.key==='Escape') emit({type:'gallery-escape'});
  });
  window.addEventListener('message',function(event){
    if(event.source!==parent || event.origin!==origin) return;
    const data=event.data;
    if(data && data.type==='gallery-command') command(data);
  });
  window.addEventListener('error',function(event){emit({type:'gallery-error',message:event.message||'The 3D viewer could not load.'});});
  window.addEventListener('unhandledrejection',function(event){emit({type:'gallery-error',message:String(event.reason && event.reason.message || event.reason)});});
})();
