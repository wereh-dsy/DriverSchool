import * as T from 'three';

/** Circumferential tread grooves on a lathed tyre's existing profile UVs.
 * A shared 1x256 texture replaces three extra torus meshes on every wheel. */
export function tyreDetailTexture(width:number,color:number):T.DataTexture {
  const size=256,pixels=new Uint8Array(size*4),base=new T.Color(color).convertLinearToSRGB();
  for(let i=0;i<size;i++){
    const v=(i+.5)/size;
    let shade=1;
    for(const x of [-.062,0,.062]){
      const centre=(3+(x+width*.28)/(width*.56))/8;
      shade-=.45*Math.exp(-(((v-centre)/.0035)**2));
    }
    pixels[i*4]=Math.round(base.r*255*shade);pixels[i*4+1]=Math.round(base.g*255*shade);
    pixels[i*4+2]=Math.round(base.b*255*shade);pixels[i*4+3]=255;
  }
  const texture=new T.DataTexture(pixels,1,size);
  texture.name='Shared tyre tread grooves 1x256';texture.colorSpace=T.SRGBColorSpace;
  texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
  return texture;
}
