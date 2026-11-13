/* Tilted museum map kiosks. Original maps remain separate, tagged OpenVGAL
 * artwork planes; the furniture is decorative and cannot intercept a click.
 */
(function () {
  'use strict';
  const V = (x,y,z) => new BABYLON.Vector3(x,y,z);
  function sharedMaterials(scene) {
    scene.metadata = scene.metadata || {};
    if (scene.metadata.demoMapStandMaterials) return scene.metadata.demoMapStandMaterials;
    const result = {};
    for (const [key,hex] of Object.entries({ivory:'#f5f5f2',recess:'#45494b',orange:'#b8bcbc',base:'#d6d9d8'})) {
      const mat = new BABYLON.StandardMaterial('map_stand_'+key,scene);
      mat.diffuseColor = BABYLON.Color3.FromHexString(hex);
      mat.specularColor = new BABYLON.Color3(.06,.06,.06);
      result[key] = mat;
    }
    scene.metadata.demoMapStandMaterials = result;
    return result;
  }
  function mergeFurniture(scene,groups,materials) {
    for (const [key,parts] of Object.entries(groups)) {
      if (!parts.length) continue;
      const name = 'map_stand_batch_'+key;
      const existing = scene.getMeshByName(name);
      if (existing) parts.unshift(existing);
      const merged = BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);
      if (!merged) continue;
      merged.name = name; merged.material = materials[key];
      merged.isPickable = false; merged.checkCollisions = false;
      merged.metadata = {demoArchitecture:true,demoMapStandFurniture:true};
      merged.freezeWorldMatrix();
    }
  }
  window.buildDemoMapStand = function (options) {
    const {name,definition,item_position,item_size,material,scene} = options;
    const layout = window.demoRoomLayout;
    const standId = definition.standId || definition.exhibit_id;
    const stand = layout && (layout.mapStands || []).find(s=>s.id===standId);
    if (!stand) throw new Error('Map kiosk has no layout position: '+standId);
    const yaw = stand.yaw || 0, tilt = stand.tilt ?? Math.PI/6;
    const width = item_size.width, height = item_size.height;
    // Match the lighter V1 furniture to the displayed map, not the old kiosk size.
    const size = width / 2.45;
    const centre = V(item_position.x,item_position.y,item_position.z);
    const right = V(Math.cos(yaw),0,-Math.sin(yaw));
    const outward = V(Math.sin(yaw),0,Math.cos(yaw));
    const up = outward.scale(Math.cos(tilt)).add(V(0,Math.sin(tilt),0));
    const normal = outward.scale(-Math.sin(tilt)).add(V(0,Math.cos(tilt),0));
    const materials = sharedMaterials(scene);
    const groups = {ivory:[],recess:[],orange:[],base:[]};
    function floorPoint(lateral,y,radial) {
      return V(centre.x,0,centre.z).add(right.scale(lateral)).add(outward.scale(radial)).add(V(0,y,0));
    }
    function box(part,w,h,d,position,key,tilted) {
      const mesh = BABYLON.MeshBuilder.CreateBox('map_stand_'+standId+'_'+part,{width:w,height:h,depth:d},scene);
      mesh.position.copyFrom(position);
      mesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yaw,tilted ? Math.PI/2-tilt : 0,0);
      mesh.isPickable=false; mesh.checkCollisions=false;
      mesh.material=materials[key]; groups[key].push(mesh);
      return mesh;
    }
    // Low, broad foot and a tapered pedestal that leans into the tilted head.
    box('foot',2.02*size,.075*size,1.24*size,floorPoint(0,.0375*size,-.06*size),'base',false);
    box('foot_top',1.91*size,.045*size,1.14*size,floorPoint(0,.095*size,-.06*size),'ivory',false);
    const pedestal = BABYLON.MeshBuilder.CreateBox('map_stand_'+standId+'_pedestal',{size:1},scene);
    const positions = pedestal.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for(let i=0;i<positions.length;i+=3) {
      const top=positions[i+1]>.0;
      const lateral=positions[i]*(top?1.70:1.44)*size;
      const radial=(positions[i+2]*(top?.64:.66)+(top?.12:-.17))*size;
      const y=top?centre.y+radial*Math.tan(tilt)-.11*size/Math.cos(tilt):.115*size;
      const p=floorPoint(lateral,y,radial);
      positions[i]=p.x;positions[i+1]=p.y;positions[i+2]=p.z;
    }
    pedestal.setVerticesData(BABYLON.VertexBuffer.PositionKind,positions);
    const pedestalNormals=[];
    BABYLON.VertexData.ComputeNormals(positions,pedestal.getIndices(),pedestalNormals);
    pedestal.setVerticesData(BABYLON.VertexBuffer.NormalKind,pedestalNormals);
    pedestal.material=materials.ivory;pedestal.isPickable=false;groups.ivory.push(pedestal);

    // A thin framed display head preserves the map's full landscape ratio.
    box('head',width+.16*size,height+.32*size,.10*size,centre.subtract(normal.scale(.06*size)),'ivory',true);
    box('recess',width+.025*size,height+.025*size,.012*size,centre.subtract(normal.scale(.008*size)),'recess',true);
    box('detail_edge',width+.12*size,.012*size,.012*size,centre.subtract(up.scale(height/2+.139*size)),'orange',true);

    // Explicit axes and standard plane UVs prevent sideways/mirrored maps.
    const corners=[
      centre.subtract(right.scale(width/2)).subtract(up.scale(height/2)),
      centre.add(right.scale(width/2)).subtract(up.scale(height/2)),
      centre.add(right.scale(width/2)).add(up.scale(height/2)),
      centre.subtract(right.scale(width/2)).add(up.scale(height/2))
    ];
    const image = new BABYLON.Mesh(name,scene);
    const data = new BABYLON.VertexData();
    data.positions=corners.flatMap(p=>[p.x,p.y,p.z]);
    data.indices=[0,1,2,0,2,3];
    data.normals=corners.flatMap(()=>[normal.x,normal.y,normal.z]);
    data.uvs=[0,0,1,0,1,1,0,1]; data.applyToMesh(image);
    image.material=material; image.isPickable=true; image.checkCollisions=false;
    image.metadata={demoMapStand:true,standId,imageRight:[right.x,right.y,right.z],imageUp:[up.x,up.y,up.z],imageNormal:[normal.x,normal.y,normal.z]};

    const letter=String.fromCharCode(64+Number(standId.match(/(\d+)$/)?.[1] || 1));
    const caption = new BABYLON.DynamicTexture('map_stand_caption_'+standId,{width:1024,height:64},scene,false);
    const ctx=caption.getContext();ctx.clearRect(0,0,1024,64);
    ctx.fillStyle='#3f4548';ctx.font='600 27px Arial, sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText('NABATIEH — MAP '+letter,24,32);
    ctx.fillStyle='#5b6265';ctx.font='22px Arial, sans-serif';ctx.textAlign='right';
    ctx.fillText('CLICK TO INSPECT',1000,32);caption.update();caption.hasAlpha=true;
    const captionMat=new BABYLON.StandardMaterial('map_stand_caption_material_'+standId,scene);
    captionMat.diffuseTexture=caption;captionMat.emissiveTexture=caption;captionMat.disableLighting=true;
    captionMat.useAlphaFromDiffuseTexture=true;captionMat.backFaceCulling=false;
    const captionPlane=BABYLON.MeshBuilder.CreatePlane('map_stand_caption_'+standId,{width,height:.145*size},scene);
    captionPlane.position.copyFrom(centre.subtract(up.scale(height/2+.083*size)).add(normal.scale(.002*size)));
    captionPlane.rotationQuaternion=BABYLON.Quaternion.RotationYawPitchRoll(yaw,Math.PI/2-tilt,0);
    captionPlane.material=captionMat;captionPlane.isPickable=false;captionPlane.checkCollisions=false;
    captionPlane.metadata={demoMapStandFurniture:true,standId};captionPlane.freezeWorldMatrix();

    // One simple, hidden hull is more predictable to walk around than the
    // tapered body. It never participates in picking the displayed map.
    const collider=BABYLON.MeshBuilder.CreateBox('map_stand_collision_'+standId,{
      width:stand.footprintWidth || 2.6*size,height:1.75,depth:stand.footprintDepth || 1.9*size
    },scene);
    collider.position.copyFrom(floorPoint(0,.875,0));collider.rotation.y=yaw;
    collider.isVisible=false;collider.isPickable=false;collider.checkCollisions=true;
    collider.metadata={demoArchitecture:true,demoCollisions:true,standId,demoMapStandCollider:true};
    collider.freezeWorldMatrix();
    mergeFurniture(scene,groups,materials);
    scene.metadata.demoMapStands=scene.metadata.demoMapStands || [];
    scene.metadata.demoMapStands.push({id:standId,image:image.name,collider:collider.name,width,height,tilt,housingScale:size});
    image.freezeWorldMatrix();
    return image;
  };
})();
