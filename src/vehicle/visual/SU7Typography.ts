export const SU7_FONT_FAMILY='"SU7 MiSans Latin", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
let loading:Promise<void>|undefined;

/** Official, unmodified offline fonts. Shared font faces; each display retains its own canvas. */
export function prepareSU7Typography():Promise<void> {
  if(typeof FontFace==='undefined')return Promise.resolve();
  return loading??=Promise.all([
    [new URL('./assets/su7-fonts/MiSansLatin-Regular.woff2',import.meta.url).href,'400'],
    [new URL('./assets/su7-fonts/MiSansLatin-Medium.woff2',import.meta.url).href,'500'],
  ].map(([url,weight])=>{
    const face=new FontFace('SU7 MiSans Latin',`url("${url}")`,{weight});
    document.fonts.add(face);return face.load();
  })).then(()=>{
    console.info('SU7 display typography: MiSans Latin © Xiaomi. License:',
      new URL('./assets/su7-fonts/MiSans-LICENSE.pdf',import.meta.url).href);
  });
}
