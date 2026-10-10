import type { CityIntersection, CityMapData, CityPoint } from './CityMapData';
import { junctionExtent, polylineLength, portDirection, roadEdges, roadPoints, rotatePoint, sampleAt } from './geometry';
import { sampleRibbonPolyline } from '../subject3/geometry';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { CityRoad } from './CityMapData';
import type { IntersectionPort } from './CityMapData';
/** Paint terminals use the same polygon boundary, including widened acute corners. */
export function junctionApproachExtent(j:CityIntersection,map:CityMapData,port:IntersectionPort):number {
    if(!j.pavementFootprint)return junctionExtent(j,map);
    const d=portDirection(j,port);let distance=0;
    const polygon=j.pavementFootprint;
    for(let i=0;i<polygon.length;i++){
        const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,ex=b.x-a.x,ez=b.z-a.z,den=d.x*ez-d.z*ex;
        if(Math.abs(den)<1e-8)continue;
        const t=(a.x*ez-a.z*ex)/den,u=(a.x*d.z-a.z*d.x)/den;
        if(t>=0&&u>=-1e-6&&u<=1+1e-6)distance=Math.max(distance,t);
    }
    return distance||junctionExtent(j,map);
}
/** Allocation-free support mask compiled once, used by the road contact closures. */
export function compileJunctionSurface(j:CityIntersection){
    const outline=j.pavementFootprint!.map(p=>{const q=rotatePoint(p,j.rotation);return {x:j.position.x+q.x,y:(j.position.y??0)+(q.y??0),z:j.position.z+q.z};});
    const minX=Math.min(...outline.map(p=>p.x)),maxX=Math.max(...outline.map(p=>p.x)),minZ=Math.min(...outline.map(p=>p.z)),maxZ=Math.max(...outline.map(p=>p.z));
    const base=j.position.y??0;
    const planes=outline.map((a,i)=>{const b=outline[(i+1)%outline.length]!,ax=a.x-j.position.x,az=a.z-j.position.z,bx=b.x-j.position.x,bz=b.z-j.position.z,den=ax*bz-az*bx;
        return {ax,az,bx,bz,den,gx:((a.y-base)*bz-(b.y-base)*az)/den,gz:(ax*(b.y-base)-bx*(a.y-base))/den};}).filter(p=>Math.abs(p.den)>1e-8);
    return {contains(x:number,z:number){
        if(x<minX||x>maxX||z<minZ||z>maxZ)return false;
        let inside=false;
        for(let i=0,k=outline.length-1;i<outline.length;k=i++){const a=outline[i]!,b=outline[k]!;if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}
        return inside;
    },heightAt(x:number,z:number){const qx=x-j.position.x,qz=z-j.position.z;
        for(const p of planes){const u=(qx*p.bz-qz*p.bx)/p.den,v=(p.ax*qz-p.az*qx)/p.den;if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return base+p.gx*qx+p.gz*qz;}return base;
    }};
}
export function junctionSurfaceContains(j: CityIntersection, map: CityMapData, p: CityPoint, margin = 0): boolean {
    const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation), outline = j.pavementFootprint;
    if (!outline) {
        const h = junctionExtent(j, map) + margin;
        return Math.abs(q.x) <= h && Math.abs(q.z) <= h;
    }
    let inside = false;
    for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) {
        const a = outline[i]!, b = outline[k]!;
        if ((a.z > q.z) !== (b.z > q.z) && q.x < (b.x - a.x) * (q.z - a.z) / (b.z - a.z) + a.x)
            inside = !inside;
        const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l)) : 0;
        const distance=Math.hypot(q.x-a.x-t*dx,q.z-a.z-t*dz);
        if(margin<0&&distance<=-margin)return false;
        if (distance <= margin + 1e-6)
            return true;
    }
    return inside;
}
/** One convex outline through actual approach mouths, respecting every road's width. */
export function setJunctionPavementFootprint(j: CityIntersection, map: CityMapData): void {
    const points: CityPoint[] = [];
    const ribbons:CityPoint[][][]=[];
    const approaches:{path:CityPoint[];reach:number;left:number;right:number;distance:number}[]=[];
    for (const c of j.connections) {
        const r = map.roads.find(r => r.id === c.roadId);
        if (!r) continue;
        const path = roadPoints(r), start = c.end === 'start', mouth = start ? path[0]! : path.at(-1)!;
        const neighbour = start ? path[1]! : path.at(-2)!;
        const dx = start ? neighbour.x-mouth.x : mouth.x-neighbour.x;
        const dz = start ? neighbour.z-mouth.z : mouth.z-neighbour.z;
        const length = Math.hypot(dx,dz) || 1, e = roadEdges(r);
        for (const offset of [e.left, e.right])
            points.push(rotatePoint({x:mouth.x-j.position.x-dz/length*offset,
                y:(mouth.y??0)-(j.position.y??0),z:mouth.z-j.position.z+dx/length*offset},-j.rotation));
        // A shallow crossing or parallel merge can overlap beyond its old preset mouth.
        // Include actual approach overlap, bounded by the next junction's shared road.
        const outward=start?path:[...path].reverse(),total=polylineLength(outward);
        const otherJunction=map.intersections.some(other=>other!==j&&other.connections.some(q=>q.roadId===r.id));
        const reach=Math.min(180,otherJunction?total/2:total),near:CityPoint[]=[];
        let distance=0;
        for(let i=0;i<outward.length;i++){
            if(i)distance+=Math.hypot(outward[i]!.x-outward[i-1]!.x,outward[i]!.z-outward[i-1]!.z);
            if(distance>=reach){near.push(sampleAt(outward,reach).point);break;}near.push(outward[i]!);
        }
        const samples=sampleRibbonPolyline(near,6),left=start?e.left:-e.right,right=start?e.right:-e.left;
        approaches.push({path:outward,reach,left,right,distance:0});
        const edge=(i:number,offset:number)=>{const s=samples[i]!;return {x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset};};
        ribbons.push(samples.slice(1).map((_,i)=>[edge(i,left),edge(i,right),edge(i+1,right),edge(i+1,left)]));
    }
    if (points.length < 3) return;
    for(let i=0;i<ribbons.length;i++)for(let k=i+1;k<ribbons.length;k++)for(const a of ribbons[i]!)for(const b of ribbons[k]!){
        if(Math.max(...a.map(p=>p.x))<Math.min(...b.map(p=>p.x))||Math.min(...a.map(p=>p.x))>Math.max(...b.map(p=>p.x))||Math.max(...a.map(p=>p.z))<Math.min(...b.map(p=>p.z))||Math.min(...a.map(p=>p.z))>Math.max(...b.map(p=>p.z)))continue;
        if(Math.abs(a.reduce((s,p)=>s+(p.y??0),0)-b.reduce((s,p)=>s+(p.y??0),0))>2)continue;
        let overlap=a;
        // Ribbon order is clockwise in XZ; retain the right side of every edge.
        for(let e=0;e<b.length&&overlap.length;e++){
            const p=b[e]!,q=b[(e+1)%b.length]!,side=(r:CityPoint)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x),cut:CityPoint[]=[];
            for(let n=0;n<overlap.length;n++){
                const x=overlap[n]!,y=overlap[(n+1)%overlap.length]!,sx=side(x),sy=side(y),inside=sx<=0;
                if(inside)cut.push(x);
                if(inside!==(sy<=0)){const t=sx/(sx-sy);cut.push({x:x.x+t*(y.x-x.x),y:(x.y??0)+t*((y.y??0)-(x.y??0)),z:x.z+t*(y.z-x.z)});}
            }overlap=cut;
        }
        const area=overlap.reduce((sum,p,n)=>{const q=overlap[(n+1)%overlap.length]!;return sum+p.x*q.z-q.x*p.z;},0);
        if(overlap.length>=3&&Math.abs(area)>1e-4)for(const p of overlap){
            points.push(rotatePoint({x:p.x-j.position.x,y:(p.y??0)-(j.position.y??0),z:p.z-j.position.z},-j.rotation));
            for(const index of [i,k]){const approach=approaches[index]!,mouth=approach.path[0]!,tangent=sampleAt(approach.path,0).tangent;
                approach.distance=Math.max(approach.distance,(p.x-mouth.x)*tangent.x+(p.z-mouth.z)*tangent.z);
            }
        }
    }
    // Give each extended mouth a complete cross-section after the overlap ends.
    // This reserves a clean terminal strip for crosswalk/stop-line ownership.
    for(const approach of approaches)if(approach.distance>.1){
        const s=sampleAt(approach.path,Math.min(approach.reach,approach.distance+7));
        for(const offset of [approach.left,approach.right])points.push(rotatePoint({x:s.point.x-j.position.x-s.tangent.z*offset,y:(s.point.y??0)-(j.position.y??0),z:s.point.z-j.position.z+s.tangent.x*offset},-j.rotation));
    }
    points.sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (a: CityPoint, b: CityPoint, c: CityPoint) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const hull = (list: CityPoint[]) => { const out: CityPoint[] = []; for (const p of list) {
        while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0)
            out.pop();
        out.push(p);
    } return out; };
    const a = hull(points), b = hull([...points].reverse());
    j.pavementFootprint = [...a.slice(0, -1), ...b.slice(0, -1)];
    j.markingFootprint = { kind: 'polygon', points: structuredClone(j.pavementFootprint) };
}
export function junctionSurfaceHeight(j: CityIntersection, p: CityPoint): number {
    const outline = j.pavementFootprint, base = j.position.y ?? 0;
    if (!outline)
        return base;
    const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation);
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i]!, b = outline[(i + 1) % outline.length]!, den = a.x * b.z - a.z * b.x;
        if (Math.abs(den) < 1e-8)
            continue;
        const u = (q.x * b.z - q.z * b.x) / den, v = (a.x * q.z - a.z * q.x) / den;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
            return base + u * (a.y ?? 0) + v * (b.y ?? 0);
    }
    return base;
}
/** Trim connected approach triangles at the authoritative outline, including skewed mouths. */
export function clipRoadJunctionPavement(geometry: BufferGeometry, road: CityRoad, map: CityMapData, surfaceOffset = 0.024, sidewalk = false): BufferGeometry {
    const junctions = map.intersections.filter(j => j.pavementFootprint && j.connections.some(c => c.roadId === road.id));
    if (!junctions.length)
        return geometry;
    type Vertex = {
        x: number;
        y: number;
        z: number;
        u: number;
        v: number;
    };
    const attribute = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), index = geometry.index;
    const triangles: Vertex[][] = [];
    for (let i = 0; i < (index?.count ?? attribute.count); i += 3)
        triangles.push(Array.from({ length: 3 }, (_, k) => { const n = index ? index.getX(i + k) : i + k; return { x: attribute.getX(n), y: attribute.getY(n), z: attribute.getZ(n), u: uv?.getX(n) ?? 0, v: uv?.getY(n) ?? 0 }; }));
    let pieces = triangles;
    const masks=junctions.map(j=>({outline:j.pavementFootprint!.map(p=>{const q=rotatePoint(p,j.rotation);return {x:j.position.x+q.x,z:j.position.z+q.z};}),heightAt:(x:number,z:number)=>junctionSurfaceHeight(j,{x,z})}));
    if(sidewalk){
        const neighbours=new Set(junctions.flatMap(j=>j.connections.map(c=>c.roadId)));
        for(const link of map.roadLinks??[])if(link.from.roadId===road.id)neighbours.add(link.to.roadId);else if(link.to.roadId===road.id)neighbours.add(link.from.roadId);
        for(const other of map.roads.filter(r=>r.id!==road.id&&neighbours.has(r.id))){
            const samples=sampleRibbonPolyline(roadPoints(other),6),edges=roadEdges(other);
            const vertex=(i:number,offset:number)=>{const s=samples[i]!;return {x:s.point.x-s.tangent.z*offset,z:s.point.z+s.tangent.x*offset};};
            for(let i=1;i<samples.length;i++){
                const a=samples[i-1]!.point,b=samples[i]!.point,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
                if(l2<1e-8)continue;
                masks.push({outline:[vertex(i-1,edges.left),vertex(i,edges.left),vertex(i,edges.right),vertex(i-1,edges.right)],heightAt:(x,z)=>(a.y??0)+((b.y??0)-(a.y??0))*Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2))});
            }
        }
    }
    for (const mask of masks) {
        const outline=mask.outline,next: Vertex[][] = [];
        const minX = Math.min(...outline.map(p => p.x)), maxX = Math.max(...outline.map(p => p.x)), minZ = Math.min(...outline.map(p => p.z)), maxZ = Math.max(...outline.map(p => p.z));
        for (const triangle of pieces) {
            const center={x:(triangle[0]!.x+triangle[1]!.x+triangle[2]!.x)/3,z:(triangle[0]!.z+triangle[1]!.z+triangle[2]!.z)/3};
            const height=(triangle[0]!.y+triangle[1]!.y+triangle[2]!.y)/3-surfaceOffset;
            if(Math.abs(height-mask.heightAt(center.x,center.z))>0.5){next.push(triangle);continue;}
            if (triangle.every(p => p.x < minX) || triangle.every(p => p.x > maxX) || triangle.every(p => p.z < minZ) || triangle.every(p => p.z > maxZ)) {
                next.push(triangle);
                continue;
            }
            let remaining = triangle;
            for (let edge = 0; edge < outline.length && remaining.length >= 3; edge++) {
                const a = outline[edge]!, b = outline[(edge + 1) % outline.length]!, side = (p: Vertex) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
                const cut = (inside: boolean) => { const polygon: Vertex[] = []; for (let i = 0; i < remaining.length; i++) {
                    const p = remaining[i]!, q = remaining[(i + 1) % remaining.length]!, sp = side(p), sq = side(q), pin = inside ? sp >= 0 : sp <= 0, qin = inside ? sq >= 0 : sq <= 0;
                    if (pin)
                        polygon.push(p);
                    if (pin !== qin) {
                        const t = sp / (sp - sq);
                        polygon.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, u: p.u + (q.u - p.u) * t, v: p.v + (q.v - p.v) * t });
                    }
                } return polygon; };
                const outside = cut(false);
                for (let k = 1; k + 1 < outside.length; k++) {
                    const a = outside[0]!, b = outside[k]!, c = outside[k + 1]!;
                    if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) > 1e-7)
                        next.push([a, b, c]);
                }
                remaining = cut(true);
            }
        }
        pieces = next;
    }
    const clipped = new BufferGeometry();
    clipped.setAttribute('position', new Float32BufferAttribute(pieces.flatMap(t => t.flatMap(p => [p.x, p.y, p.z])), 3));
    clipped.setAttribute('uv', new Float32BufferAttribute(pieces.flatMap(t => t.flatMap(p => [p.u, p.v])), 2));
    clipped.computeVertexNormals();
    clipped.computeBoundingSphere();
    geometry.dispose();
    return clipped;
}
