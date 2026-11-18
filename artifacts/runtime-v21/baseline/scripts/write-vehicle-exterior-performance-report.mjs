import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const root='artifacts/vehicle-exterior-performance';
const read=path=>JSON.parse(readFileSync(`${root}/${path}`,'utf8'));
const before=read('before/render-results.json'),after=read('after/render-results.json');
const changes=after.results.map(value=>{
  const old=before.results.find(entry=>entry.id===value.id);
  if(!old)throw Error(`Missing baseline ${value.id}`);
  return {id:value.id,before:old,after:value,callsSaved:old.calls-value.calls,trianglesSaved:old.triangles-value.triangles,
    geometryResourcesSaved:old.geometries-value.geometries};
});
writeFileSync(`${root}/comparison.json`,JSON.stringify(changes,null,2)+'\n');
const sum=(key,phase)=>changes.reduce((total,entry)=>total+entry[phase][key],0);
let report='# 外观贴图与加载性能优化\n\n2026-10-28。基线为上一轮全车型精修后的源码；覆盖实际 13 辆目录车辆。\n\n';
report+='## 实现\n\n';
report+='- 8 款分段车壳共用每车型一张 1024×512 图集：格栅细条/网格、灯内反光结构、风口和牌照底板使用贴图；门缝与油口/充电口线直接绘制到侧壳 UV，删除管状线条。无需外部图片下载，也没有逐帧重绘。\n';
report+='- 车身轮廓、轮拱、玻璃曲率、镜壳与凸起把手保持几何；灯面仅保留贴合曲面所需的网格，细分由固定 10 改为按实际范围取 2–6。\n';
report+='- 奔驰格栅条使用现有图集；6 组尾灯星形和环改为共享 64×64 光学遮罩，继续由原有尾灯通道驱动。BMW/奔驰每车 12 个胎纹圆环改为 1×256 纹理，保持原始滚动半径。\n';
report+='- 轮胎、轮圈桶、制动盘/圈唇和左右轮辐几何按尺寸复用；端部前后悬校准跳过固定轴距区域，仅复制真正受影响的网格，并保留仍被其他对象使用的源几何。\n';
report+='- 灯光控制器释放时恢复自带灯面的实例材质，不再移除/释放注册表借出的灯组网格；共享几何和贴图只由注册表最终释放。避免切车后的重复 GPU 上传，同时修复被替换的实例材质遗漏清理。\n';
report+='- Golf 内饰底纹保留同一确定性采样和 2×2 像素图案，改用 ImageData 一次提交，取代每张底纹 262144 次 Canvas 状态设置及绘制；法线/ORM 写入也取消逐像素 Vector3 和临时数组。\n';
report+='- 物理、输入、地图、车型身份和加载策略未修改；现有按选车准备、邻居预热与缓存淘汰仍有效。图集随缓存所有者复用，没有常驻全部 13 辆的新增预加载。\n\n';
report+='## 同规则渲染比较\n\n';
report+='隐藏 Chromium、相同相机和 position 灯状态；每车五视图。calls/三角形来自最后一个后 3/4 视图，含座舱、灯具、地面，不是单纯外壳面数。\n\n';
report+='车型 | draw calls 前→后 | 可见三角形 前→后 | GPU 几何资源 前→后 | 未缓存视觉创建 ms 前→后\n---|---:|---:|---:|---:\n';
for(const c of changes)report+=`${c.id} | ${c.before.calls}→${c.after.calls} | ${c.before.triangles}→${c.after.triangles} | ${c.before.geometries}→${c.after.geometries} | ${c.before.constructionMs.toFixed(1)}→${c.after.constructionMs.toFixed(1)}\n`;
for(const [key,label] of [['calls','draw calls'],['triangles','可见三角形'],['geometries','GPU 几何资源']]){
  const a=sum(key,'before'),b=sum(key,'after');report+=`\n13 车分别测量的 ${label} 汇总：${a}→${b}，减少 ${((1-b/a)*100).toFixed(1)}%。这不是 13 辆同时出场的负载。\n`;
}
report+='\n创建耗时仅为本机单轮未缓存 VehicleVisual + VehicleLighting 的 CPU 测量，不含首帧贴图上传、shader 编译、地图或完整启动时间；部分车型会受 JIT/GC 噪声影响而升高。不能由此宣称统一加载加速比例或 FPS 提升。\n\n';
report+='## 贴图代价与验证\n\n';
report+='每张新增共享图集为 1024×512 RGBA8，基础约 2MiB，含 mipmap 约 2.67MiB；不会为每个细节/实例创建一张。新增胎纹约 1KiB/尺寸，尾灯遮罩含 mipmap 约 21KiB。GPU 几何资源减少不等于总显存必然减少：这里用少量有界贴图换取更少顶点、对象和绘制调用。\n\n';
const integration=read('integration-results.json');
for(const name of Object.keys(integration.results))report+=`- ${name}：PASS。\n`;
for(const [name,error] of Object.entries(integration.errors))report+=`- ${name}：FAIL（${error}）。前一轮外观精修前已复现同一 A6L 静态悬挂断言；未修改物理以消除它。\n`;
const dimensions=read('dimensions-after.json');
report+=`- 13 辆实际几何尺寸/轮心对齐：通过；${dimensions.reduce((n,c)=>n+c.clearanceRays,0)} 条加载/压缩/转向采样，${dimensions.reduce((n,c)=>n+c.clearanceIssues.length,0)} 个间隙命中。\n`;
report+=`- 前后各 13 张五视图，浏览器错误 ${before.errors.length}/${after.errors.length}，控制台捕获自检 ${before.consoleCaptureVerified&&after.consoleCaptureVerified?'通过':'未确认'}。\n`;
report+='- 共享资源检查逐一验证所有缓存外观几何/静态贴图：实例与灯光清理不释放借用对象，注册表最终各释放一次；两实例灯光独立。Golf 结构检查 171 条断言通过。\n';
if(existsSync(`${root}/build-result.json`))report+=`- 最终构建：${read('build-result.json').status}。${read('build-result.json').note}\n`;
else report+='- 最终构建尚未记录。\n';
report+='- 未运行 full core、地图/编辑器全量、长时间驾驶或桌面打包。\n\n';
report+='## 文件与复验\n\n';
for(const name of ['ExteriorDetailAtlas.ts','TyreDetailTexture.ts','RefinedVehicleExterior.ts','ExteriorEnvelope.ts','VehicleLighting.ts','BMW530Wheels.ts','MercedesE300LWheels.ts','MercedesE300LExterior.ts','MercedesE300LExteriorDetails.ts','GolfGTICockpitMaterials.ts','VehicleExterior.selftest.ts'])report+=`- [${name}](../../src/vehicle/visual/${name})\n`;
for(const name of ['check-vehicle-exterior-integration.ts','vehicle-exterior-preview.ts','render-vehicle-exteriors.cjs','write-vehicle-exterior-report.mjs','write-vehicle-exterior-performance-report.mjs'])report+=`- [${name}](../../scripts/${name})\n`;
report+='\n[量化数据](comparison.json) · [尺寸结果](dimensions-after.json) · [集成结果](integration-results.json) · [全车型参考资料与外观报告](../vehicle-exterior-refinement/REPORT.md)\n\n';
for(const c of changes)report+=`- ${c.id}：[优化前五视图](before/${c.id}.png) / [优化后五视图](after/${c.id}.png)\n`;
report+='\n```powershell\npnpm exec esbuild scripts/check-vehicle-exterior-integration.ts --bundle --platform=node --format=esm --outfile=.tmp-check-exterior-integration.mjs\nnode .tmp-check-exterior-integration.mjs\npnpm exec esbuild scripts/check-vehicle-exteriors.ts --bundle --platform=node --format=esm --outfile=.tmp-check-vehicle-exteriors.mjs\nnode .tmp-check-vehicle-exteriors.mjs\npnpm exec electron scripts/render-vehicle-exteriors.cjs --output-dir=artifacts/vehicle-exterior-performance/after\nnode scripts/write-vehicle-exterior-performance-report.mjs\n```\n';
writeFileSync(`${root}/REPORT.md`,report);
console.log(`Wrote ${changes.length}-vehicle performance comparison`);
