/* Soft neutral daylight and subtle contact shadows for the open gallery.
 * All surfaces are local. Static shadow rendering keeps ordinary walking light.
 */
(function () {
  'use strict';
  window.setupDemoSoftLight = function (scene) {
    scene.metadata = scene.metadata || {};
    if (scene.metadata.demoSoftLight) return;
    scene.metadata.demoSoftLight = true;
    const C = hex => BABYLON.Color3.FromHexString(hex);
    for (const light of scene.lights) {
      if (light.name === 'hemiLight_up') {
        light.intensity = .78;
        light.diffuse = C('#ffffff');
        light.groundColor = C('#e3e3e3');
      }
      if (light.name === 'hemiLight_down') {
        light.intensity = .13;
        light.diffuse = C('#ffffff');
      }
    }
    const sun = scene.getLightByName('minimal_daylight');
    if (sun) {
      sun.position.set(10,18,-8);
      sun.direction.set(-.30,-1,.22);
      sun.intensity = .32;
      sun.diffuse = C('#ffffff');
    }
    // A narrow, feathered contact patch grounds the freestanding walls even
    // on browsers that cannot render a filtered real-time shadow map.
    const texture = new BABYLON.DynamicTexture('open_gallery_contact',{width:512,height:128},scene,false);
    const context = texture.getContext(), pixels = context.createImageData(512,128);
    for (let y=0;y<128;y++) for (let x=0;x<512;x++) {
      const across=(y/127-.5)/.22;
      const ends=Math.min(1,Math.min(x/511,1-x/511)/.045);
      const i=(y*512+x)*4;
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=75;
      pixels.data[i+3]=Math.round(255*.13*Math.exp(-across*across)*ends);
    }
    context.putImageData(pixels,0,0);texture.hasAlpha=true;texture.update();
    const material=new BABYLON.StandardMaterial('open_gallery_contact_material',scene);
    material.diffuseTexture=texture;material.emissiveTexture=texture;
    material.disableLighting=true;material.useAlphaFromDiffuseTexture=true;
    material.backFaceCulling=false;material.specularColor=C('#000000');
    for (const wall of window.demoRoomLayout.walls.filter(w=>w.kind==='partition')) {
      const dx=wall.x2-wall.x1,dz=wall.z2-wall.z1;
      const mesh=BABYLON.MeshBuilder.CreateGround('architecture_contact_'+wall.id,
        {width:Math.hypot(dx,dz)+.7,height:1.5},scene);
      mesh.position.set((wall.x1+wall.x2)/2,.006,(wall.z1+wall.z2)/2);
      mesh.rotation.y=Math.atan2(-dz,dx);mesh.material=material;
      mesh.isPickable=false;mesh.checkCollisions=false;
      mesh.metadata={demoArchitecture:true,demoCollisions:false,demoContactShadow:true};
      mesh.freezeWorldMatrix();
    }
    const floor=scene.getMeshByName('architecture_polygon_floor');
    if (floor) floor.receiveShadows=true;
    if (!sun || scene.getEngine() instanceof BABYLON.NullEngine) return;
    const shadows=new BABYLON.ShadowGenerator(1024,sun);
    shadows.useBlurExponentialShadowMap=true;
    shadows.blurKernel=32;shadows.blurScale=2;shadows.bias=.002;shadows.normalBias=.025;
    // The architecture and exhibits are static. Populate once after the
    // OpenVGAL artwork and map furniture have been created in this same scene.
    scene.onBeforeRenderObservable.addOnce(function () {
      for (const mesh of scene.meshes) {
        if (!mesh.isVisible || !mesh.material) continue;
        const data=mesh.metadata || {};
        if (data.wallId || data.demoMapStandFurniture || mesh.name==='frames') shadows.addShadowCaster(mesh);
      }
      const map=shadows.getShadowMap();
      if (map) map.refreshRate=BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    });
  };
})();
