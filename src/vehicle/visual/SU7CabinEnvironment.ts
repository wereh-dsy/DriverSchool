import * as T from 'three';

/** Small authored cabin reflection probe: broad window apertures against warm trim.
 * This is an irradiance/specular approximation, not a live reflection or additional light pass.
 * Three filters it once during the existing renderer warmup. No scene-wide environment change. */
export function createSU7CabinEnvironment():T.DataTexture {
  const width=128,height=64,data=new Float32Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const elevation=-Math.cos(Math.PI*(y+.5)/height),azimuth=2*Math.PI*(x+.5)/width;
    const ring=Math.sqrt(1-elevation*elevation),right=Math.cos(azimuth)*ring,forward=Math.sin(azimuth)*ring;
    const windowHeight=T.MathUtils.smoothstep(elevation,.01,.16)*(1-T.MathUtils.smoothstep(elevation,.57,.72));
    const side=T.MathUtils.smoothstep(Math.abs(right),.65,.83);
    const front=T.MathUtils.smoothstep(-forward,.61,.84);
    const back=T.MathUtils.smoothstep(forward,.77,.93)*.55;
    const aperture=Math.max(side,front,back)*windowHeight;
    const roof=.06*T.MathUtils.smoothstep(elevation,.65,.95),lower=Math.max(.025,elevation*.04+.055);
    const i=(y*width+x)*4;
    data[i]=lower*1.12+aperture*1.35+roof;
    data[i+1]=lower+aperture*1.47+roof;
    data[i+2]=lower*.84+aperture*1.58+roof;
    data[i+3]=1;
  }
  const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);
  texture.name='SU7 cabin window-aperture reflection probe';
  texture.mapping=T.EquirectangularReflectionMapping;texture.needsUpdate=true;return texture;
}
