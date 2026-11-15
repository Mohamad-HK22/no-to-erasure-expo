/* A small, dependency-free walking planner for the exhibition floor.
 * Uses a visibility graph around the same walls and furniture footprints that
 * build the scene. Returned waypoints exclude the start and include the exact
 * destination. Runtime movement should retain Babylon's collision checks.
 */
(function () {
  'use strict';
  const EPS = 1e-8;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const point = p => p && finite(p.x) && finite(p.z);
  const distance2 = (a,b) => (a.x-b.x)**2+(a.z-b.z)**2;
  const cross = (a,b,c) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  function pointSegment2(p,a,b) {
    const length=distance2(a,b);
    const t=length ? Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/length)) : 0;
    return distance2(p,{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
  }
  function segmentDistance2(a,b,c,d) {
    const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
    if(((abC>EPS&&abD<-EPS)||(abC<-EPS&&abD>EPS)) &&
       ((cdA>EPS&&cdB<-EPS)||(cdA<-EPS&&cdB>EPS))) return 0;
    return Math.min(pointSegment2(a,c,d),pointSegment2(b,c,d),pointSegment2(c,a,b),pointSegment2(d,a,b));
  }
  function rectangle(x,z,halfWidth,halfDepth,ux,uz,vx,vz) {
    return {x,z,halfWidth,halfDepth,ux,uz,vx,vz};
  }
  function corners(r,padding=0) {
    const w=r.halfWidth+padding,d=r.halfDepth+padding;
    return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([u,v])=>({
      x:r.x+u*r.ux+v*r.vx,z:r.z+u*r.uz+v*r.vz
    }));
  }
  function pointRectangle2(p,r) {
    const x=p.x-r.x,z=p.z-r.z;
    const u=Math.max(0,Math.abs(x*r.ux+z*r.uz)-r.halfWidth);
    const v=Math.max(0,Math.abs(x*r.vx+z*r.vz)-r.halfDepth);
    return u*u+v*v;
  }
  function segmentRectangle2(a,b,r) {
    if(pointRectangle2(a,r)<EPS || pointRectangle2(b,r)<EPS) return 0;
    const c=r.corners;
    return Math.min(...c.map((p,i)=>segmentDistance2(a,b,p,c[(i+1)%4])));
  }
  function obstacles(layout) {
    const result=[];
    for(const w of layout.walls || []) {
      if(w.collisions===false || ![w.x1,w.z1,w.x2,w.z2].every(finite)) continue;
      const dx=w.x2-w.x1,dz=w.z2-w.z1,length=Math.hypot(dx,dz);
      if(length<EPS) continue;
      const thickness=finite(w.thickness)&&w.thickness>0 ? w.thickness : w.kind==='outer' ? .24 : .22;
      result.push(rectangle((w.x1+w.x2)/2,(w.z1+w.z2)/2,thickness/2,length/2,-dz/length,dx/length,dx/length,dz/length));
    }
    for(const f of [...(layout.mapStands || []),...(layout.benches || [])]) {
      const width=f.footprintWidth || f.width,depth=f.footprintDepth || f.depth;
      if(f.collisions===false || !point(f) || !finite(width) || !finite(depth) || width<=0 || depth<=0) continue;
      const yaw=finite(f.yaw) ? f.yaw : 0,c=Math.cos(yaw),s=Math.sin(yaw);
      result.push(rectangle(f.x,f.z,width/2,depth/2,c,-s,s,c));
    }
    for(const r of result) r.corners=corners(r);
    return result;
  }
  window.planDemoWalk=function(layout,start,target,options={}) {
    if(!layout || !point(start) || !point(target)) return null;
    const radius=finite(options.radius)&&options.radius>0 ? options.radius : .35;
    // The comfortable route also clears the framed works projecting from walls.
    const margin=finite(options.margin)&&options.margin>=0 ? options.margin : .16;
    const clearance=radius+margin,physical=radius+.0001;
    const blocks=obstacles(layout),bounds=layout.bounds;
    const inBounds=p=>!bounds || ![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(finite) ||
      (p.x>=bounds.minX+physical && p.x<=bounds.maxX-physical && p.z>=bounds.minZ+physical && p.z<=bounds.maxZ-physical);
    const free=(p,padding)=>inBounds(p)&&blocks.every(r=>pointRectangle2(p,r)>=padding*padding-EPS);
    if(!free(start,physical) || !free(target,physical)) return null;
    const safeSegment=(a,b,endpointEdge=false)=>blocks.every(r=>{
      let padding=clearance;
      // A visitor may already be closer to a wall than our comfort margin.
      // Only that obstacle uses physical clearance for the first/last leg;
      // unrelated obstacles retain the usual margin. No position is snapped.
      if(endpointEdge && (pointRectangle2(a,r)<clearance*clearance-EPS || pointRectangle2(b,r)<clearance*clearance-EPS)) padding=physical;
      return segmentRectangle2(a,b,r)>=padding*padding-EPS;
    });
    const end={x:target.x,z:target.z},begin={x:start.x,z:start.z};
    if(safeSegment(begin,end,true)) return [end];
    const nodes=[begin,end],seen=new Set([`${begin.x},${begin.z}`,`${end.x},${end.z}`]);
    for(const r of blocks) for(const p of corners(r,clearance+.004)) {
      if(!free(p,clearance)) continue;
      const key=`${p.x.toFixed(6)},${p.z.toFixed(6)}`;
      if(!seen.has(key)) {seen.add(key);nodes.push(p);}
    }
    // This gallery has only a few dozen corners, so a dense Dijkstra search is
    // simpler and more stable than a sampled grid or a heavyweight navmesh.
    const cost=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),closed=nodes.map(()=>false);
    const visibility=new Map();
    function visible(a,b) {
      const key=a<b ? `${a}:${b}` : `${b}:${a}`;
      if(!visibility.has(key)) visibility.set(key,safeSegment(nodes[a],nodes[b],a<2||b<2));
      return visibility.get(key);
    }
    cost[0]=0;
    for(let step=0;step<nodes.length;step++) {
      let current=-1;
      for(let i=0;i<nodes.length;i++) if(!closed[i] && (current<0 || cost[i]<cost[current])) current=i;
      if(current<0 || !Number.isFinite(cost[current])) return null;
      if(current===1) {
        const route=[];
        for(let at=1;at!==0;at=previous[at]) {
          if(at<0) return null;
          route.push({x:nodes[at].x,z:nodes[at].z});
        }
        return route.reverse();
      }
      closed[current]=true;
      for(let next=0;next<nodes.length;next++) {
        if(closed[next]) continue;
        const proposed=cost[current]+Math.sqrt(distance2(nodes[current],nodes[next]));
        if(proposed+EPS<cost[next] && visible(current,next)) {cost[next]=proposed;previous[next]=current;}
      }
    }
    return null;
  };
})();
