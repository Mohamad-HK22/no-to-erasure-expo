/* V1: an open-plan white gallery with freestanding, two-sided display walls.
 * The four collection categories are sections within one connected space.
 */
(function () {
  'use strict';
  const bounds={minX:-16,maxX:16,minZ:-12,maxZ:12};
  const rect=(minX,maxX,minZ,maxZ)=>[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];
  const slot=(x,z,normalX,normalZ,maxWidth,wall,entry)=>({x,z,height:1.8,normalX,normalZ,maxWidth,maxHeight:2.1,wall,...(entry?{entry}: {})});
  const rooms=[
    {id:'homes',title:'Homes, Villages & Infrastructure',shortTitle:'Homes',number:'01',x:-8,z:-5.5,labelX:-9,labelZ:-5.5,width:16,depth:13,polygon:rect(-16,0,-12,1),entry:{x:-9,z:-4.5,yaw:-.36,pitch:0},artworkSlots:[
      slot(-11,.84,0,-1,3.3,'left_blade_south'),
      slot(-3.84,-2,1,0,3.6,'center_blade_east',{x:-.85,z:-2,yaw:-Math.PI/2,pitch:0})
    ]},
    {id:'health',title:'Education & Health',shortTitle:'Health',number:'02',x:-8,z:6.5,labelX:-9,labelZ:7,width:16,depth:11,polygon:rect(-16,0,1,12),entry:{x:-9,z:6.4,yaw:0,pitch:0},artworkSlots:[
      slot(-12,11.84,0,-1,2.5,'north'),slot(-7,11.84,0,-1,2.5,'north'),slot(-2,11.84,0,-1,2.5,'north'),
      slot(-15.84,6,1,0,2.5,'west'),slot(-4.16,3.1,-1,0,2.4,'center_blade_west'),slot(-11,1.16,0,1,2.5,'left_blade_north')
    ]},
    {id:'nature',title:'Agriculture, Nature & the Environment',shortTitle:'Nature',number:'03',x:8,z:-6,labelX:9,labelZ:-6,width:16,depth:12,polygon:rect(0,16,-12,0),entry:{x:.8,z:-4,yaw:1.45,pitch:0},artworkSlots:[
      slot(4.84,-3.5,-1,0,2.4,'right_blade_west'),slot(5.16,-1.5,1,0,2.4,'right_blade_east')
    ]},
    {id:'heritage',title:'People, Culture & Heritage',shortTitle:'Heritage',number:'04',x:8,z:6,labelX:9,labelZ:7,width:16,depth:12,polygon:rect(0,16,0,12),entry:{x:1,z:5.6,yaw:1,pitch:.02},artworkSlots:[
      slot(4.95,11.84,0,-1,2.5,'north'),slot(8.45,11.84,0,-1,2.5,'north'),slot(11.95,11.84,0,-1,2.5,'north')
    ]}
  ];
  const walls=[];
  function wall(id,x1,z1,x2,z2,kind='partition',roomId=null){walls.push({id,x1,z1,x2,z2,kind,roomId});}
  wall('outer_north',-16,12,16,12,'outer');wall('outer_south',-16,-12,16,-12,'outer');
  wall('outer_west',-16,-12,-16,12,'outer');wall('outer_east',16,-12,16,12,'outer');
  wall('center_blade',-4,-5.5,-4,5.5);wall('left_blade',-14,1,-8,1);wall('right_blade',5,-6,5,0);
  const atrium={id:'atrium',title:'Entrance',x:0,z:-9.5,width:4,depth:5,radius:0,glassRadius:0,polygon:rect(-2,2,-12,-7),entry:{x:.3,z:-10.5,yaw:.06,pitch:0}};
  const benches=[];
  const mapStands=[];
  for(const z of [3.5,7.3])for(const x of [3.2,6.7,10.2,13.7]){
    const yaw=Math.PI,tilt=Math.PI/6;
    mapStands.push({id:'nte-pch-map-'+String(mapStands.length+1).padStart(2,'0'),roomId:'heritage',x,z,height:1.08,yaw,tilt,width:1.9,imageHeight:1.9*1448/2048,maxWidth:1.9,maxHeight:1.9*1448/2048,footprintWidth:2.1,footprintDepth:1.65,normalX:-Math.sin(yaw)*Math.sin(tilt),normalY:Math.cos(tilt),normalZ:-Math.cos(yaw)*Math.sin(tilt),entry:{x,z:z+2.1,yaw,pitch:Math.atan2(1.75-1.08,2.1)}});
  }
  window.demoRoomLayout={rooms,walls,atrium,benches,mapStands,shape:'open-plan',bounds,corners:rect(-16,16,-12,12)};

  window.buildDemoRooms=function(scene){
    const C=hex=>BABYLON.Color3.FromHexString(hex),V=(x,y,z)=>new BABYLON.Vector3(x,y,z);
    function material(name,hex,emissive=false){
      const m=new BABYLON.StandardMaterial('minimal_'+name,scene);m.diffuseColor=C(hex);m.specularColor=C('#080808');
      if(emissive){m.emissiveColor=C(hex);m.disableLighting=true;}
      return m;
    }
    const white=material('white_walls','#f7f7f7'),partition=material('partitions','#f7f7f7');
    const floor=material('oak_floor','#ffffff'),ceiling=material('ceiling','#ffffff',true);
    const oak = new BABYLON.Texture('materials/wood_floor/WoodFloor051_1K_Color.jpg', scene);
    oak.wrapU = oak.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    oak.anisotropicFilteringLevel = 8;
    floor.diffuseTexture = oak;
    floor.specularColor.set(0, 0, 0);
    const frame=material('white_frames','#fafafa'),charcoal=material('charcoal','#444444');
    BJS_materials[frame_material]=frame;BJS_materials.BJS_black_metal=charcoal;
    function finish(mesh,mat,collisions=false){
      mesh.material=mat;mesh.isPickable=false;mesh.checkCollisions=collisions;
      mesh.metadata=Object.assign({},mesh.metadata,{demoArchitecture:true,demoCollisions:collisions});
      return mesh;
    }
    function box(name,x,y,z,w,h,d,mat,collisions=false,yaw=0){
      const m=BABYLON.MeshBuilder.CreateBox('architecture_'+name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.rotation.y=yaw;
      return finish(m,mat,collisions);
    }
    function horizontal(name,y,mat,up){
      const m=BABYLON.MeshBuilder.CreateGround('architecture_'+name,{width:32,height:24,subdivisions:1},scene);m.position.y=y;
      if(!up){const idx=m.getIndices();for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];m.setIndices(idx);m.createNormals(true);}
      return finish(m,mat,up);
    }
    const floorMesh = horizontal('polygon_floor', 0, floor, true);
    const floorPositions = floorMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const floorUVs = [];
    // The grain runs along the gallery's depth. Each tile covers 7.2 × 4.8 m.
    for (let vertex = 0; vertex < floorPositions.length; vertex += 3) {
      floorUVs.push(floorPositions[vertex + 2] / 7.2, floorPositions[vertex] / 4.8);
    }
    floorMesh.setVerticesData(BABYLON.VertexBuffer.UVKind, floorUVs);
    horizontal('polygon_ceiling', 6.2, ceiling, false);
    // Only three independent interior blades interrupt this single open floor.
    // Their ends and the broad spaces around them remain completely traversable.
    for(const w of walls){
      const dx=w.x2-w.x1,dz=w.z2-w.z1,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
      const h=w.kind==='outer'?4.8:4.2,thickness=w.kind==='outer'?.24:.22;
      const mesh=box(w.id,(w.x1+w.x2)/2,h/2,(w.z1+w.z2)/2,thickness,h,length,w.kind==='outer'?white:partition,true,yaw);
      mesh.metadata.wallId=w.id;mesh.metadata.wallKind=w.kind;
    }
    function sign(name,text,x,y,z,nx,nz,w,h){
      const lines=Array.isArray(text)?text:[text],height=lines.length>1?192:96,width=Math.round(height*w/h);
      const texture=new BABYLON.DynamicTexture('minimal_sign_'+name,{width,height},scene,true),c=texture.getContext();c.clearRect(0,0,width,height);
      c.fillStyle='#545454';c.font='500 '+height*.65/lines.length+'px Arial, sans-serif';c.textAlign='center';c.textBaseline='middle';
      const measure=Math.max(...lines.map(t=>c.measureText(t).width));if(measure>width*.94)c.font='500 '+height*.65/lines.length*width*.94/measure+'px Arial, sans-serif';
      lines.forEach((t,i)=>c.fillText(t,width/2,height/2+(i-(lines.length-1)/2)*height/lines.length));texture.update();texture.hasAlpha=true;
      const mat=new BABYLON.StandardMaterial('minimal_sign_material_'+name,scene);mat.diffuseTexture=texture;mat.emissiveTexture=texture;mat.disableLighting=true;mat.useAlphaFromDiffuseTexture=true;mat.backFaceCulling=false;
      const plane=BABYLON.MeshBuilder.CreatePlane('architecture_sign_'+name,{width:w,height:h,sourcePlane:BABYLON.Plane.FromPositionAndNormal(BABYLON.Vector3.Zero(),V(nx,0,nz))},scene);
      plane.position.set(x,y,z);finish(plane,mat);plane.metadata={demoArchitecture:true,demoCollisions:false,signWidth:w,signHeight:h,signLines:lines};
    }
    // Quiet section labels replace large room headers and ornamental wayfinding.
    sign('homes_title','01 / HOMES, VILLAGES & INFRASTRUCTURE',-11,3.35,.835,0,-1,5.3,.22);
    sign('health_title','02 / EDUCATION & HEALTH',-7,3.35,11.83,0,-1,5.3,.22);
    sign('nature_title','03 / NATURE & THE ENVIRONMENT',4.835,3.35,-3.5,-1,0,4.3,.22);
    sign('heritage_title','04 / PEOPLE, CULTURE & HERITAGE',8.45,3.35,11.83,0,-1,6,.22);
    scene.lights.forEach(l=>{
      if(l.name==='hemiLight_up'){l.intensity=.92;l.diffuse=C('#ffffff');l.groundColor=C('#d5d5d5');}
      if(l.name==='hemiLight_down'){l.intensity=.12;l.diffuse=C('#f5f5f5');}
    });
    const daylight=new BABYLON.DirectionalLight('minimal_daylight',V(-.35,-1,.2),scene);daylight.intensity=.28;daylight.diffuse=C('#ffffff');
    const camera=scene.activeCamera;camera.fov=.96;camera.applyGravity=false;camera.checkCollisions=true;camera.ellipsoid=V(.35,.8,.35);camera.minZ=.08;
    if(window.setupDemoControls)window.setupDemoControls(camera,scene);
    scene.onBeforeRenderObservable.add(function(){camera.position.y=1.75;camera.rotation.x=Math.max(-.8,Math.min(.8,camera.rotation.x));});
    scene.clearColor=new BABYLON.Color4(.98,.98,.98,1);
    for(const phase of ['template','materials']){document.getElementById('percentLoaded_'+phase).textContent='100%';document.getElementById('loadingBar_'+phase).style.width='100%';}
  };
})();
