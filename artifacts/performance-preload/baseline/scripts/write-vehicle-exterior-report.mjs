import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const directory='artifacts/vehicle-exterior-refinement';
const read=name=>JSON.parse(readFileSync(`${directory}/${name}`,'utf8'));
const unavailable='unavailable';
const source=(type,url,scope)=>({type,url,scope});
const data={
  'family-sedan':{
    target:'Haiteng S1，项目原创驾校轿车，无唯一量产原型',spec:{},sources:[],photos:[],
    observations:['较高车顶、直立乘员舱、完整四门和独立行李厢；属于原创设计观察，不能作为厂家参数。'],
    before:'车顶受静态车身下沉影响低于声明高度；车身与玻璃舱主要由折面和直线框架构成。',
    changes:'独立高顶轿车截面、弧形车顶、前后门及固定角窗、圆肩/内收门槛、薄门缝、独立灯罩及包角灯面；16 英寸六辐轮圈与圆胎肩。',
    conflicts:['厂商规格和实车照片均 unavailable；保留原创车辆身份，没有擅自指定现实车型。'],
  },
  'sport-coupe':{
    target:'GT 3.0 Turbo，项目原创前置发动机双门 GT',spec:{},sources:[],photos:[],
    observations:['长发动机舱、后移双门座舱、短弧顶和宽后肩；为原创设计而非某量产跑车的尺寸复刻。'],
    before:'车顶高度不足，车头、车尾和车身横截面仍有通用低多边形轿车的折面感。',
    changes:'独立 GT 纵向站点、后移弧顶、双门结构线、宽后肩、动力舱盖、制动风口、双排气；19 英寸五辐轮圈。',
    conflicts:['唯一现实原型、厂家参数和官方照片 unavailable。'],
  },
  'test-6at-sedan':{
    target:'Mazda CX-4（2016 中国第一代造型参考）；目录仍明确保留简化轿车平台',
    spec:{length:4.633,width:1.840,height:1.530,wheelBase:2.700,groundClearance:.196},
    tyres:{front:'225/65 R17',rear:'225/65 R17',rimInches:17,nominalFrontDiameter:.7243,nominalRearDiameter:.7243},
    sources:[source('manufacturer newsroom','https://newsroom.mazda.com/en/publicity/release/2016/201604/160425b.html','2016 CX-4，2.0 6AT；1530mm 高、196mm 离地间隙，其他动力/轮圈版本不同')],
    photos:[source('manufacturer photos','https://newsroom.mazda.com/en/publicity/release/2016/201604/160425b.html','同代发布图片'),source('automotive media photos','https://drivemag.com/news/all-new-mazda-cx-4-is-a-better-looking-cx-5-sold-exclusively-in-china/','2016 CX-4 多角度图库')],
    observations:['Mazda 流动肩线、较窄灯组和盾形中网；现实 CX-4 的跨界车体量与当前游戏轿车不是同一设定。'],
    before:'简化轿车轮廓与 CX-4 名称冲突，车顶低于游戏声明尺寸。',
    changes:'为现有 legacy flow 车体独立重建曲面截面、较低流线车头、盾形中网、独立灯形、弧顶及三段侧窗；17 英寸分叉十辐轮圈。',
    conflicts:['游戏为 4580×1795×1490mm、2700mm 轴距的简化轿车，轮胎直径也明显小于现实 CX-4。没有把物理平台改成跨界 SUV，也不声称已复刻 CX-4 的完整真实比例。'],
  },
  'test-7dct-sedan':{
    target:'Volkswagen Sagitar 280TSI；2019 中国第三代长轴车身作为可核查参照，原游戏长度设定仍有冲突',
    spec:{length:4.753,width:1.800,height:1.462,wheelBase:2.730},
    sources:[source('manufacturer newsroom','https://www.volkswagen-newsroom.com/en/press-releases/market-overview-compact-notchback-models-are-one-of-volkswagens-key-segments-in-china-5954','中国 Sagitar 2.73m 轴距，区分美国 Jetta'),source('automotive media','https://motor1.uol.com.br/news/301914/volkswagen-jetta-2019-alongado-china/','2019 中国车型长宽高；其轴距精确到 2731mm，厂家新闻采用 2.73m')],
    photos:[source('manufacturer photos','https://www.volkswagen-newsroom.com/en/images/detail/volkswagen-press-conference-at-shanghai-auto-show-2019-28492','2019 Sagitar 发布照片'),source('automotive media photos','https://motor1.uol.com.br/news/301914/volkswagen-jetta-2019-alongado-china/','中国长轴车身参考')],
    observations:['平直肩线、独立后备厢、四门长轴侧窗和横向格栅，不借用 Golf 两厢或美国标准轴距车壳。'],
    before:'外壳高度不足；灯组和横截面较通用，4670mm 游戏车长与该代现实长轴版本不符。',
    changes:'独立 formal 站点、较平直长顶、细分侧窗及 C 柱、横向格栅与灯组、薄结构线；16 英寸五辐轮圈。',
    conflicts:['游戏 4670mm 长、1500mm 高与 2019 中国第三代规格不符；目标年款不能唯一锁定。保留目录和物理轮位，未静默换成另一代。'],
  },
  'cvt-family-sedan':{
    target:'Nissan Sylphy 2.0 CVT；目标代际未能唯一确认，2009 中国 2.0 CVT 仅作版本冲突比对',
    spec:{length:4.665,width:1.700,height:1.510,wheelBase:2.700},
    sources:[source('automotive database','https://www.drom.ru/catalog/nissan/sylphy/551867/','中国 2009 2.0 CVT 数据库条目；不是官方同年中国 brochure'),source('manufacturer archive, comparator only','https://history.nissan.co.jp/SYLPHY/G11/0905/g110905g05.html?gradeID=G05&model=SYLPHY','日本 G11 1.5L 条目；市场/动力不同，其尺寸与轮胎未混入目标规格')],
    photos:[source('manufacturer archive, comparator only','https://history.nissan.co.jp/SYLPHY/G11/0905/g110905g05.html?gradeID=G05&model=SYLPHY','G11 车身家族观察；不能证明中国 2.0 CVT 的具体配置')],
    observations:['舒适三厢、高顶与柔和肩线；无法把现代宽车体和早期 2.0 动力名称拼成一个经验证的量产版本。'],
    before:'车顶偏低，车型名称、宽度/轴距与已查到的 2.0 CVT 版本不一致。',
    changes:'独立 comfort 站点、较丰满车门和拱顶、四门加角窗、柔和灯组、V 形格栅语言；16 英寸七辐轮圈。',
    conflicts:['游戏宽 1820mm、轴距 2710mm，与上述中国 2.0 CVT 参照的 1700/2700mm 不符；V 形前脸属于保留的项目设计语言，不能宣称为 2009 G11 原厂复刻。'],
  },
  'executive-lwb-2t':{
    target:'Audi A6L C8，中国长轴距 45 TFSI quattro，2023 动感车身；非欧洲 A6 Sedan',
    spec:{length:5.050,width:1.886,height:1.475,wheelBase:3.024,groundClearance:.117},
    sources:[source('manufacturer specification table','https://contact.audi.cn/contact/performanceequipment_exportEquipment.htm?carStyleId=10218&cnname=A6&is_publish=4&isen=0&typeId_0=2023&typeId_1=2024','2023 C8 A6L 车身规格；5038 致雅 / 5050 动感，1475 普通悬架 /1460 空气悬架'),source('manufacturer brochure, search indexed','https://www.audi.cn/content/dam/OneWeb/faw_vw/pdf/2024%E6%9B%B4%E6%96%B0%E8%BD%A6%E5%9E%8B/a6l/Audi_A6L_2023_Q4.pdf','官方装备表含 45 TFSI quattro；PDF 直接抓取不可用，搜索索引可核对车身尺寸')],
    photos:[source('manufacturer photo reproduction','https://www.dailyrevs.com/cars/2023-audi-a6l','2023 中国 A6L 多角度；部分为 55 TFSI，限共享车体观察，不替换 45 的配置')],
    observations:['较平长车顶、长后门和较平直腰线；宽 Singleframe 与横向灯组保持行政轿车体量。'],
    before:'静态下沉后外壳最高点约 1445mm，低于普通悬架 C8；侧身仅少量横向折面，前轮拱还受到车头圆角变形影响。',
    changes:'按加载地面基准恢复 1475mm 车顶；车身纵向密度和横截面增加、门皮同曲率、薄门缝；保险杠圆角不再扭曲前轮拱。保留 Singleframe、灯组、四环、活动驾驶门和原有轮圈图集。',
    conflicts:['游戏物理宽 1890mm、轴距 3025mm，而厂家为 1886/3024mm；物理保持原值。游戏支持空气悬架，1475mm 为普通车高参考，未把 1460mm 配置高度当作固定物理高度。轮距/精确轮胎选装未核实。'],
  },
  'road-suv-v6-8at':{
    target:'Volkswagen Touareg 第三代 CR，2018 改款前；V6 TSI 的确切市场轮圈配置未锁定',
    spec:{length:4.878,width:1.984,height:1.702,wheelBase:2.894},
    sources:[source('manufacturer newsroom','https://www.volkswagen-newsroom.com/en/leading-the-way-the-new-touareg-2405/technical-data-of-the-new-touareg-2453','2018 第三代尺寸，18–21 英寸选装范围；不是 2024 改款'),source('manufacturer design release','https://www.volkswagen-newsroom.com/de/leading-the-way-der-neue-touareg-2405/exterieur-design-des-touareg-ein-massanzug-fuer-die-freiheit-2416','2018 车身设计')],
    photos:[source('manufacturer photos','https://www.volkswagen-newsroom.com/en/leading-the-way-the-new-touareg-2405','同代新闻图库'),source('automotive media photos','https://de.motor1.com/reviews/241359/vw-touareg-2018-diesel-test/','同代柴油车共享车壳；不作为 TSI 动力/配置证据')],
    observations:['高发动机舱、较直立的窗体、明显 D 柱、短尾门和横向格栅；不是放大的三厢轿车。'],
    before:'低细节折面 SUV，轮拱/格栅/灯组较像外挂矩形；没有足够连续横截面表达车体收放。',
    changes:'独立 SUV 站点、高车头、较直立玻璃舱、长顶与 D 柱/尾门、圆肩、实际开口轮拱和轮舱、横向格栅和独立灯形；19 英寸双辐轮圈。',
    conflicts:['游戏 4880×1985×1740mm、2895mm 轴距，和厂家 4878×1984×1702/2894mm 不完全相同；保留现有乘员舱及物理声明，车高仍约高 38mm，不能声称 OEM 尺寸全部一致。'],
  },
  'ferrari-458-italia':{
    target:'Ferrari 458 Italia F142 berlinetta，2009–2015；不是 Spider 或 488',
    spec:{length:4.527,width:1.937,height:1.213,wheelBase:2.650,frontTrackWidth:1.672,rearTrackWidth:1.606,frontOverhang:1.107,rearOverhang:.770},
    tyres:{front:'235/35 R20',rear:'295/35 R20',rimInches:20,nominalFrontDiameter:.6725,nominalRearDiameter:.7145},
    sources:[source('manufacturer owner manual, dealer hosted','https://di-uploads-pod31.s3.us-east-1.amazonaws.com/ferrarioffortlauderdale/uploads/2020/05/458spider.pdf','458 Italia/Spider 共用手册的 Italia 尺寸列与轮胎表；区分 Italia 1213mm 车高'),source('manufacturer product page, inaccessible','https://www.ferrari.com/en-EN/auto/458-italia','官网访问被拦截；未把不可读页面当作独立核验证据')],
    photos:[source('manufacturer photo reproduction','https://www.automobilesreview.com/auto-news/ferrari-458-italia/16642/','458 Italia 发布图库'),source('automotive media','https://www.carsales.com.au/editorial/details/ferrari-458-italia-in-detail-16027/','458 Italia 外形与比例')],
    observations:['前移座舱、低鼻和高翼子板、短弧顶、后置发动机玻璃、竖向前灯、圆尾灯和中央三排气。'],
    before:'短鼻中置轮廓已有雏形，但横截面折面明显；车壳前后悬对称、灯组和发动机舱表达较简单。',
    changes:'独立中置跑车截面及前移座舱；前后悬校至手册 1107/770mm；低鼻、翼子板、竖灯/圆尾灯、发动机盖玻璃/两侧通风、中央三排气；20 英寸五辐与前后不同胎宽。保留座舱马标。',
    conflicts:['物理系统前后使用同一 337mm 滚动半径；现实 295/35R20 后胎名义直径 714.5mm 更大。保留硬点和物理半径，未擅自改变后轮滚动几何。'],
  },
  'tesla-model-3-rwd':{
    target:'Tesla Model 3 RWD，Highland 2024+，18 英寸轮圈；非旧款或 Performance',
    spec:{length:4.720,width:1.850,height:1.440,wheelBase:2.875,frontTrackWidth:1.584,rearTrackWidth:1.584,frontOverhang:.868,rearOverhang:.977,groundClearance:.138},
    tyres:{front:'235/45 R18',rear:'235/45 R18',rimInches:18,nominalFrontDiameter:.6687,nominalRearDiameter:.6687},
    sources:[source('manufacturer owner manual','https://www.tesla.com/ownersmanual/model3/en_us/GUID-56562137-FC31-4110-A13C-9A9FC6657BF0.html','RWD/Long Range 列，尺寸不含后视镜；数值随配置可变'),source('manufacturer owner manual','https://www.tesla.com/ownersmanual/model3/es_cl/GUID-FDDB10EF-FFA9-46EB-B8CC-03614AE92B6B.html','18×8.5J，ET38，235/45R18')],
    photos:[source('automotive media photos','https://www.carsguide.com.au/ev/tesla-model-3-91785','2024 RWD Highland 实拍，区分旧款灯形')],
    observations:['低发动机盖、封闭鼻部、连续玻璃弧顶、细前灯及外侧下折的后灯；没有贯穿式后灯。'],
    before:'已有独立 Highland 曲面，但灯组细节、充电口位置和前后悬还存在不准确之处；后盖唇为盒体。',
    changes:'保险杠前后悬调整为 868/977mm，保留轮拱与座舱硬点；下角风道、后灯外折、左后灯内充电口、曲面后盖唇、细门缝；18 英寸轮圈采用实际英寸换算。',
    conflicts:['保持 670mm 物理胎径，与轮胎名义 668.7mm 有约 1.3mm 差异；没有将 Highland 换成旧款或 Performance。'],
  },
  'bmw-530li-g38':{
    target:'BMW 530Li G38 LCI，中国长轴距，2020 年发布的改款（2021–2023 造型）',
    spec:{wheelBase:3.105},
    sources:[source('manufacturer newsroom','https://www.press.bmwgroup.com/global/article/detail/T0316926EN/new-bmw-5-series-for-the-chinese-market-celebrates-its-premiere-at-the-auto-china-2020-in-beijing?language=en','确认 G38 中国长轴 LCI、3105mm 轴距；未从该文核实全部尺寸/轮胎')],
    photos:[source('manufacturer photos','https://www.press.bmwgroup.com/global/photo/detail/P90399467/the-new-bmw-5-series-sedan-long-wheelbase-09/2020','2020 G38 LCI 官方图片'),source('manufacturer gallery','https://www.press.bmwgroup.com/global/photo/search/G38/category%3Aphoto/','G38 图库，必须核对 LCI/长轴标签，排除 G30/G60')],
    observations:['长发动机舱、后移座舱、高肩线、长后门和 Hofmeister 回折，与 A6L 的平长顶和 V214 的圆肩分开。'],
    before:'独立车壳已有长轴和回折，但下门板/肩部横截面偏折线，双肾偏高，附件使总长略超声明。',
    changes:'保持独立 G38 车壳/长轴窗框，增强下门板凸曲与高肩折线、压低双肾纵向比例；只收整保险杠端部至声明长度，保留品牌、驾驶门、后视镜和轮圈。',
    conflicts:['5106×1868×1500mm、前后轮距及具体轮圈由项目声明沿用；此次未取得对应 530Li 版本的可核验完整官方规格表，官方字段明确 unavailable，不能把 G30 标准轴距数据补入。'],
  },
  'porsche-taycan-4s':{
    target:'Porsche Taycan 4S，2024 改款轿车，Performance Battery Plus；非 Cross/Sport Turismo',
    spec:{length:4.963,width:1.966,height:1.379,wheelBase:2.900,frontTrackWidth:1.710,rearTrackWidth:1.693},
    tyres:{front:'225/55 R19 (standard)',rear:'275/45 R19 (standard)',rimInches:19,nominalFrontDiameter:.7301,nominalRearDiameter:.7301},
    sources:[source('manufacturer technical data PDF','https://newsroom.porsche.com/dam/jcr%3A581f5508-7a15-41a1-a9a2-82e03fa3ca32/pag-taycan-4s-performance-battery-plus-td-en.pdf.PDF','2024 Taycan 4S Performance Battery Plus；标准 19 英寸，前 8J ET50/后 10J ET47')],
    photos:[source('manufacturer photos','https://www.porsche.at/taycan/taycan-modelle/taycan-4s-1','改款 4S 轿车图片'),source('automotive media photos','https://www.carsales.com.au/editorial/details/porsche-taycan-2024-review-international-145298/','2024 改款实车，限共用车体/灯形参考')],
    observations:['极低鼻部与高前翼子板、窄顶宽肩、后轮附近明显收放、改款四点 LED 和低宽贯穿后灯；不是缩扁的 Model 3。'],
    before:'车身轮廓过于依赖低位通用折面；灯组、前翼子板峰和宽后肩缺少连续曲面表达。',
    changes:'独立低宽站点、较窄弧顶与宽后肩、前翼子板峰、低鼻/封闭前部、四点 LED 和后灯桥、充电口与开口轮拱；20 英寸双辐视觉轮圈及前后异宽胎。',
    conflicts:['物理后轮距 1694mm 与手册 1693mm 差 1mm；项目使用 20 英寸视觉选装和统一 700mm 胎径，标准手册为 19 英寸、730.1mm 名义胎径。20 英寸对应选装胎尺寸未核实，保留物理半径，不把标准配置伪装成项目选装。前后悬为外形作者估计，官方 unavailable。'],
  },
  'volkswagen-golf-gti':{
    target:'Volkswagen Golf GTI Mk7.5 外形；项目尺寸引用 2017 美国 Mk7 数据，版本差异保留',
    spec:{length:4.268,width:1.799,height:1.442,wheelBase:2.631,frontTrackWidth:1.538,rearTrackWidth:1.516},
    sources:[source('manufacturer US specification PDF','https://newspress-vwusamedia.s3.amazonaws.com/documents%2Foriginal%2F6416-116801676557d8494f0ae0f.pdf','2017 美国 Golf GTI 四门尺寸，2631mm 轴距；不是对 Mk7.5 所有市场的统一结论'),source('manufacturer archive','https://www.volkswagen-newsroom.com/en/vehicle-data-golf-7-gti-profile-20033','Golf 7 GTI 概述采用 2637mm 轴距，与项目美国规格不同'),source('manufacturer drawing reproduced by media','https://www.ausmotive.com/2013/04/23/volkswagen-golf-vii-gti-in-detail.html','2013 Mk7 车身图给出 869/768mm 前后悬，仅作同平台造型参考，不作为精确 Mk7.5 原厂数据')],
    photos:[source('automotive media photos','https://www.pistonheads.com/news/ph-driven/2017-volkswagen-golf-gti-facelift-mk7-5--review/36110','Mk7.5 改款实拍'),source('automotive media photos','https://paultan.org/2018/08/18/driven-volkswagen-golf-mk7-5-meeting-all-needs/','2018 Mk7.5 实拍')],
    observations:['短后悬、厚 C 柱、短而近水平的掀背顶、独立尾门、横向前灯及 GTI 红线。'],
    before:'已有专用掀背车壳和图集，侧门横截面较直，附件使总长超出声明约 32mm。',
    changes:'独立 Golf 车壳继续保留厚 C 柱/尾门；加密侧壁、滚肩/内收门槛、舱盖折线，收整前后悬，保留红线、VW/GTI 图集与原有车轮。',
    conflicts:['Mk7.5 外形与 2017 US/Mk7 尺寸来源并不完全一致；2631/2637mm 轴距差异和前后悬来源年份明确保留，不擅自移动物理车轴。'],
  },
  'mercedes-e300l-v214':{
    target:'Mercedes-Benz E 300 L V214 中国长轴传统立标车；目录 2026 年款，共享 2023 年首发车体',
    spec:{length:5.092,width:1.880,height:1.493,wheelBase:3.094},
    sources:[source('manufacturer media release','https://media.mercedes-benz.com/article/3cde958b-be26-400e-ae4e-d0dbb6dad480','2023 V214 中国长轴首发 5092/1880/1493/3094mm；不是 W214 标准轴距，也不证明 2026 具体选装')],
    photos:[source('manufacturer photos','https://media.mercedes-benz.com/article/3cde958b-be26-400e-ae4e-d0dbb6dad480','V214 传统格栅、立标和星形尾灯'),source('automotive media photos','https://www.autocarpro.in/news/mercedes-benz-officially-reveals-e-class-lwb-117447','中国长轴首发图库')],
    observations:['3094mm 长轴后门、圆润肩部、圆弧顶、传统多横条中网/立标、三角后角窗和星形后灯。'],
    before:'专用 V214 车体已有立标和长轴结构，但门板/肩部偏折线，总长因附件略超声明。',
    changes:'保留独立 V214 站点、长后门/三角角窗，增加更饱满的下门板曲率与更宽柔和滚肩；只收整保险杠端部至 5092mm。保留传统格栅、立标、星形尾灯、活动门和镜面。',
    conflicts:['2026 具体轮胎/选装和轮距未能核实，官方字段 unavailable；不以 W214 标轴参数补齐。'],
  },
};

mkdirSync(`${directory}/references`,{recursive:true});
const before=read('dimensions-before.json'),after=read('dimensions-after.json');
const fields=['length','width','height','wheelBase','frontTrackWidth','rearTrackWidth','frontOverhang','rearOverhang','groundClearance'];
const generated=[];
for(const car of after){
  const d=data[car.id];if(!d)throw Error(`Missing reference: ${car.id}`);
  const official=Object.fromEntries(fields.map(key=>[key,d.spec[key]??unavailable]));
  const tyres={front:unavailable,rear:unavailable,rimInches:unavailable,nominalFrontDiameter:unavailable,nominalRearDiameter:unavailable,
    frontRimWidthInches:unavailable,rearRimWidthInches:unavailable,frontOffsetMetres:unavailable,rearOffsetMetres:unavailable,...d.tyres};
  tyres.frontWidthMetres=tyres.front===unavailable?unavailable:Number(tyres.front.slice(0,3))/1000;
  tyres.rearWidthMetres=tyres.rear===unavailable?unavailable:Number(tyres.rear.slice(0,3))/1000;
  tyres.widthDifferenceMetres=tyres.front===unavailable?unavailable:tyres.rearWidthMetres-tyres.frontWidthMetres;
  if(car.id==='tesla-model-3-rwd')Object.assign(tyres,{frontRimWidthInches:8.5,rearRimWidthInches:8.5,frontOffsetMetres:.038,rearOffsetMetres:.038});
  if(car.id==='porsche-taycan-4s')Object.assign(tyres,{frontRimWidthInches:8,rearRimWidthInches:10,frontOffsetMetres:.050,rearOffsetMetres:.047});
  const ref={vehicleId:car.id,displayName:car.name,researchDate:'2026-10-28',targetGeneration:d.target,
    units:{dimensions:'metres',rim:'inches',nominalTyreDiameter:'metres, calculated from marked size; not measured rolling radius'},
    officialOrDocumentedSpecifications:official,specificationProvenance:d.sources,tyres,
    photoReferences:d.photos,photoCoverageNote:d.photos.length?'链接是指定代际图库/实拍参考；未取得每款完全一致的正侧/正前/正后/高低视角七张图。未确认的独立视角为 unavailable。':'unavailable',
    unavailablePhotoAngles:['matched orthographic side','matched straight front','matched straight rear','matched high angle','matched low angle'],
    qualitativePhotoObservations:d.observations,observationProvenance:'Qualitative photo/design observations. No photograph-derived number is labelled as an OEM specification.',
    gameConstraints:{declaredDimensions:car.target,loadedModel:car.actual,physicalTyreWidths:car.wheels.map(w=>({id:w.id,width:w.width})),
      note:'Physical hardpoints, rolling radii and chassis/collision declarations retained. Model values are measurements, not manufacturer data.'},
    unresolvedDifferences:d.conflicts};
  writeFileSync(`${directory}/references/${car.id}.json`,JSON.stringify(ref,null,2)+'\n');generated.push(ref);
}
if(after.length!==Object.keys(data).length)throw Error('Reference/catalog coverage mismatch');
const fmt=v=>typeof v==='number'?v.toFixed(4):String(v);
let report=`# 全车型外观精修报告\n\n日期：2026-10-28。实际目录共 ${after.length} 辆，以当前 VehicleCatalog 和生产构建入口为准。\n\n`;
report+='本次仅修改程序化 visual 外观、相关视觉验证和本报告资料。没有更改质量、悬挂、轮胎物理、动力总成、驾驶辅助、地图或 UI；未增加依赖/网络模型/4K 纹理。车辆原有标识保留。工作区已有其他未提交修改未回退。\n\n';
report+='## 本次文件\n\n';
for(const name of ['ExteriorShapeProfiles.ts','RefinedVehicleExterior.ts','ExteriorEnvelope.ts','ExteriorMirrorGeometry.ts','VehicleExterior.ts','ExecutiveExteriorSurfaces.ts','TeslaModel3Exterior.ts','TeslaModel3Wheels.ts','BMW530Exterior.ts','MercedesE300LExterior.ts','GolfGTIExterior.ts','VehicleStaticAssets.ts','VehicleLighting.ts','VehicleVisual.ts','ExecutiveExterior.selftest.ts','VehicleVisualDimensions.selftest.ts','VehicleLighting.selftest.ts','VehicleExterior.selftest.ts','Ferrari458Visual.selftest.ts'])report+=`- [${name}](../../src/vehicle/visual/${name})\n`;
for(const name of ['vehicle-exterior-measurements.ts','check-vehicle-exteriors.ts','check-vehicle-exterior-integration.ts','vehicle-exterior-preview.ts','render-vehicle-exteriors.cjs','write-vehicle-exterior-report.mjs'])report+=`- [${name}](../../scripts/${name})\n`;
report+='- 当前目录下 13 份 reference JSON、尺寸/集成验证结果、前后五视图和本报告。VehicleVisual / VehicleStaticAssets 等文件包含已有工作，本次只调整上述外观部分。\n\n';
if(existsSync('artifacts/vehicle-exterior-performance/REPORT.md'))report+='后续贴图与加载性能优化、补充修改文件及独立前后数据：[性能报告](../vehicle-exterior-performance/REPORT.md)。此处 After 截图和尺寸已同步至优化后版本。\n\n';
report+='## 数据与尺寸口径\n\n';
report+='表格单位为米，宽度不含后视镜。高度按加载后地面到外壳最高点；轮胎直径测量实际橡胶几何，轮距按轮心。before/after 都来自生产外观构建器，包含车轮，不包括后视镜。\n\n';
report+='每个目标字段有可信实车数据时用实车值，缺失时明确标记“游戏约束”；这不等于厂家认证。尺寸验证脚本检查游戏声明及硬点（2% 报警），报告另列实车差异，因此脚本通过不代表全部 OEM 参数一致。未查到的字段在 JSON 中为 `unavailable`。轮胎名义直径由标记尺寸计算，不等于加载滚动直径。\n\n';
report+='共享的是三角网格、灯面、轮圈和镜壳生成工具；各车型使用独立 SI 车体/玻璃舱站点或原有专用车壳，没有使用整车统一缩放。前后悬修正仅作用于轮拱之外的保险杠端部，车轴、轮拱邻域、座舱和活动门硬点固定。\n\n';
report+='## 已知设定/资料限制\n\n';
for(const car of after)for(const text of data[car.id].conflicts)report+=`- **${car.name}**：${text}\n`;
report+='\n## 验证\n\n';
report+='- `pnpm run selftest:vehicles`：通过，13 个 descriptor。\n';
if(existsSync(`${directory}/integration-results.json`)){
  const checks=read('integration-results.json');for(const name of Object.keys(checks.results))report+=`- 针对性 ${name}：通过；详见 integration-results.json。\n`;
  for(const [name,error]of Object.entries(checks.errors))report+=`- 针对性 ${name}：失败，${error}。\n`;
}
if(existsSync(`${directory}/stance-baseline.json`))report+=`- 修改前源码快照复现同一悬挂失败：${read('stance-baseline.json').error??'none'}。这是原有静态支撑断言，未改悬挂以消除它；本次另以实际外壳/轮胎顶点完成压缩和转向间隙检查。\n`;
report+=`- 实际几何检查：${after.reduce((sum,c)=>sum+c.clearanceRays,0)} 条采样射线；${after.reduce((sum,c)=>sum+c.clearanceIssues.length,0)} 个间隙命中；13 辆轮心误差均不超过 1e-6m。采样为加载/半悬挂行程压缩限位、前轮 0/±0.5rad，实际圆胎肩上方顶点；不是连续全转向/全姿态几何证明。\n`;
if(existsSync(`${directory}/renders-after/render-results.json`)){
  const rendered=read('renders-after/render-results.json');report+=`- 离屏渲染：${rendered.results.length} 辆、每辆五个固定视角，浏览器错误 ${rendered.errors.length} 条。\n`;
}
if(existsSync(`${directory}/build-result.json`)){const build=read('build-result.json');report+='- 最终 `pnpm run build -BasicValidation`：'+build.status+'。'+build.note+'\n';}
else report+='- 最终 build 结果尚未记录；不能据此宣称发布完成。\n';
report+='- 按用户要求，未运行 full core、全地图、编辑器全量、physics exhaustive、长时间驾驶或 desktop:package。\n\n';
report+='## 固定截图与性能口径\n\n';
report+='隐藏 Chromium 直接调用 VehicleVisual 与 VehicleLighting，使用真实 WebGL、相同 RoomEnvironment/灯光和 position 灯状态。每个视图 800×500，垂直透视 FOV 28°、画幅 1.6，距离约10.7m；正前/正后/侧面机高1.45m，3/4机高2.55m，瞄准(0,0.78,0)。同车 before/after 使用相同相机。五图合为一张2400×1060联系表，位置顺序为正前、正后、侧面、前3/4、后3/4。\n\n';
report+='draw calls/三角形来自最后一个后3/4视角，包含座舱、灯具和地面，受背面剔除影响；不是整车理论面数或帧率 benchmark。精修成本主要用于连续曲面、实际开口轮拱和胎肩，未加入每帧生成工作。\n\n';
for(const car of after){
  const d=data[car.id],old=before.find(c=>c.id===car.id);
  report+=`## ${car.name} — ${car.id}\n\n### References\n\n${d.target}。\n\n`;
  report+=`[完整参考表](references/${car.id}.json)。\n\n`;
  for(const s of d.sources)report+=`- [${s.type}](${s.url})：${s.scope}。\n`;
  for(const s of d.photos)report+=`- [照片：${s.type}](${s.url})：${s.scope}。\n`;
  if(!d.sources.length)report+='- 官方规格、实车照片：unavailable（原创车辆）。\n';
  report+=`\n### Before\n\n${d.before}\n\n### Changes\n\n${d.changes}\n\n${d.observations.join(' ')} 这些是定性观察，非照片测量的厂家数值。\n\n### Dimensions\n\nitem | target | model before | model after | error after\n---|---:|---:|---:|---:\n`;
  for(const key of [...fields.filter(k=>k!=='groundClearance'),'wheelDiameter']){
    const official=key==='wheelDiameter'?d.tyres?.nominalFrontDiameter:d.spec[key];
    const target=official??car.target[key];
    if(target===undefined){report+=`${key} | unavailable | ${fmt(old.actual[key]??unavailable)} | ${fmt(car.actual[key]??unavailable)} | unavailable\n`;continue;}
    const actual=car.actual[key];report+=`${key} | ${fmt(target)}（${official!==undefined?'资料值':'游戏约束'}） | ${fmt(old.actual[key])} | ${fmt(actual)} | ${((actual-target)/target*100).toFixed(2)}%\n`;
  }
  report+=`\n### Result\n\n[Before 五视图](renders-before/${car.id}.png) · [After 五视图](renders-after/${car.id}.png)\n\n`;
  report+=`侧面/轮廓：见固定侧视图及站点变化；前/后脸：见两张正视与两张3/4。轮心、实际轮胎几何和开口轮拱均通过轻量验证；${car.clearanceRays} 条加载/压缩/转向采样，命中 ${car.clearanceIssues.length}。主观辨识度和实际驾驶视觉仍由用户评估。\n\n`;
  const renderPath=`${directory}/renders-after/render-results.json`;
  if(existsSync(renderPath)){const r=read('renders-after/render-results.json').results.find(r=>r.id===car.id);const b=existsSync(`${directory}/renders-before/render-results.json`)?read('renders-before/render-results.json').results.find(r=>r.id===car.id):undefined;
    if(r)report+=`渲染成本：${b?.calls??'unavailable'} → ${r.calls} draw calls；${b?.triangles??'unavailable'} → ${r.triangles} 可见三角形。外壳+车轮静态几何 ${car.meshes} 个 mesh、${car.triangles} 个三角形，无非法顶点。\n\n`;}
  report+=`限制：${d.conflicts.join(' ')}\n\n`;
}
report+='## 复验命令\n\n```powershell\npnpm exec esbuild scripts/check-vehicle-exteriors.ts --bundle --platform=node --format=esm --outfile=.tmp-check-vehicle-exteriors.mjs\nnode .tmp-check-vehicle-exteriors.mjs\npnpm exec esbuild scripts/check-vehicle-exterior-integration.ts --bundle --platform=node --format=esm --outfile=.tmp-check-exterior-integration.mjs\nnode .tmp-check-exterior-integration.mjs\npnpm exec electron scripts/render-vehicle-exteriors.cjs\nnode scripts/write-vehicle-exterior-report.mjs\n```\n';
writeFileSync(`${directory}/REPORT.md`,report);
console.log(`Wrote ${generated.length} reference sheets and REPORT.md`);
