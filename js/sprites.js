'use strict';
/* ============================================================
 * sprites.js — 程序化像素素材系统
 * 所有美术资源以字符画定义，启动时烘焙为离屏 canvas。
 * 调色板统一，保证风格一致。
 * ============================================================ */
const PAL = {
  k:'#191622', // 描边
  d:'#241f31', // 最深
  w:'#f2ede4', // 白
  f:'#f0c9a2', F:'#cf9d72', // 皮肤
  e:'#2b2336', // 眼/暗
  r:'#b8383e', R:'#e04a4a', // 红
  v:'#5a2d3a', V:'#7a3f4e', // 暗红
  b:'#3e5a8c', B:'#5d7fb4', // 蓝
  c:'#4a3d5c', C:'#6b5a80', // 外套紫
  n:'#7a5233', N:'#96683f', // 棕
  s:'#8d8677', S:'#b3ac9a', // 石
  g:'#4f7a43', G:'#78a75f', // 绿
  y:'#d9a934', Y:'#f0cf6e', // 金
  o:'#cf7222', O:'#eb9a4a', // 橙
  p:'#7b4a8c', P:'#a06bb5', // 紫
  t:'#4a4656', T:'#6e6a7c', // 灰
  m:'#56c8d8', // 青
  h:'#d97098', // 粉
  x:'#ded6c2', // 骨白
  A:'#9ecbff', // 魔法蓝
  q:'#2a3d2a', Q:'#3d5a3d', // 暗绿(草地)
};

/* ---------- 烘焙工具 ---------- */
function _mkcv(w,h){ const c=document.createElement('canvas'); c.width=Math.max(1,w); c.height=Math.max(1,h); return c; }
function bake(rows, scale){
  scale = scale||3;
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const c=_mkcv(w*scale,h*scale), g=c.getContext('2d');
  for(let y=0;y<h;y++){
    const row=rows[y];
    for(let x=0;x<row.length;x++){
      const ch=row[x];
      if(ch==='.'||ch===' ') continue;
      const col=PAL[ch];
      if(!col) continue;
      g.fillStyle=col;
      g.fillRect(x*scale,y*scale,scale,scale);
    }
  }
  return c;
}
function whiteVer(src){
  const c=_mkcv(src.width,src.height), g=c.getContext('2d');
  g.drawImage(src,0,0);
  g.globalCompositeOperation='source-atop';
  g.fillStyle='#ffffff';
  g.fillRect(0,0,c.width,c.height);
  return c;
}
/* 定义 → {frames:[cv...], white:[cv...], w, h} */
function defSprite(frames, scale){
  const f=frames.map(r=>bake(r,scale));
  return { frames:f, white:f.map(whiteVer), w:f[0].width, h:f[0].height };
}

/* ============================================================
 * 素材定义（字符画）
 * ============================================================ */
const RAW = {};

/* ---- 主角：吸血鬼猎人（宽檐帽+红围巾+暗紫大衣）---- */
RAW.hero=[
"................",
".....kkkkkk.....",
"....knnnnnnk....",
"...knnnnnnnnk...",
"..kkkkkkkkkkkk..",
"...kffffffffk...",
"...kffeffeffk...",
"....kffffffk....",
"...krrrrrrrrk...",
"..kcccccccccck..",
"..kcCccccccCck..",
"..kcccccccccck..",
"..kbbbbybbbbk...",
"...kttk..kttk...",
"...kNNk..kNNk...",
"...kkkk..kkkk...",
];
RAW.hero2=RAW.hero.slice(0,13).concat([
"....kttk.kttk...",
"....kNNk.kNNk...",
"....kkkk.kkkk...",
]);

/* ---- 蝙蝠 ---- */
RAW.bat=[
"kk..........kk",
"kpk........kpk",
"kppk..kk..kppk",
".kppkkbbkkppk.",
"..kkbebbebkk..",
"....kbbbbk....",
"....kbbbbk....",
".....kkkk.....",
];
RAW.bat2=[
"..............",
"..............",
".....kkkk.....",
".kkkkbbbbkkkk.",
"kppkbebbebkppk",
".kk.kbbbbk.kk.",
"....kbbbbk....",
".....kkkk.....",
];

/* ---- 僵尸 ---- */
RAW.zombie=[
"...kkkkkkkk...",
"..kggggggggk..",
"..kgeeggeegk..",
"..kggggggggk..",
"...kggggggk...",
"..kttttttttk..",
".kttttttttttk.",
".kgttttttttgk.",
".kgttttttttgk.",
".kkttttttttkk.",
"..kttttttttk..",
"..ktttkktttk..",
"..kggk..kggk..",
"..kggk..kggk..",
"..kkkk..kkkk..",
];
RAW.zombie2=RAW.zombie.slice(0,12).concat([
"...kggk.kggk..",
"...kggk.kggk..",
"...kkkk.kkkk..",
"..............",
]);

/* ---- 骷髅 ---- */
RAW.skeleton=[
"...kkkkkkkk...",
"..kxxxxxxxxk..",
"..kxkkxxkkxk..",
"..kxxxxxxxxk..",
"...kxkxxkxk...",
"....kxxxxk....",
"..kxxxxxxxxk..",
".kxkxxxxxxkxk.",
".kx.kxxxxk.xk.",
".kk.kxxxxk.kk.",
"....kxxxxk....",
"...kxxxxxxk...",
"...kxk..kxk...",
"...kxk..kxk...",
"...kkk..kkk...",
];

/* ---- 幽灵 ---- */
RAW.ghost=[
"....kkkkkk....",
"..kkxxxxxxxxkk",
".kxxxxxxxxxxk.",
".kxkkxxxxkkxk.",
".kxxxxxxxxxxk.",
".kxxxxxxxxxxk.",
".kxxkxxxxkxxk.",
".kxxxxxxxxxxk.",
".kxxxxxxxxxxk.",
".kxxxxxxxxxxk.",
".kxkxxxxxxkxk.",
".kk.kxxxxk.kk.",
"....kxkxkxk...",
".....kxkxk....",
"......k.k.....",
];

/* ---- 小恶魔 ---- */
RAW.imp=[
".kk......kk.",
".kpk....kpk.",
"..krrrrrrk..",
".krRRRRRRrk.",
".krerrrrrerk",
".krrrrrrrrk.",
"..krrrrrrk..",
".krVVVVVVrk.",
"krVVVVVVVVrk",
"krVkkkkkkVrk",
".kVVVVVVVVk.",
"..kVk..kVk..",
"..kkk..kkk..",
];
RAW.imp2=RAW.imp.slice(0,10).concat([
".kVVVVVVVVk.",
"..kVk..kVk..",
"..kkk..kkk..",
"............",
]);

/* ---- 史莱姆 ---- */
RAW.slime=[
"..............",
"..............",
"....kkkkkk....",
"..kkggggggkk..",
".kggGgggGgggk.",
".kggggggggggk.",
"kggkggggggkggk",
"kggggGggGgggk.",
"kggggggggggggk",
".kGGGGGGGGGGk.",
"..kkkkkkkkkk..",
];
RAW.slime2=[
"..............",
"..............",
"..............",
"..............",
"...kkkkkkkk...",
".kkggggggggkk.",
"kggGgggGgggggk",
"kgkgggggggkggk",
"kggggGggGggggk",
"kGGGGGGGGGGGGk",
".kkkkkkkkkkkk.",
];

/* ---- 大恶魔 ---- */
RAW.demon=[
"..k..........k..",
".kVk........kVk.",
".kVkk......kkVk.",
"..kkkkkkkkkkkk..",
".kvvvvvvvvvvvvk.",
"kvVRvvvvvvvvRvvk",
"kvveevvvvvveevvk",
"kvvvvvvvvvvvvvvk",
".kvvvvvkkvvvvvk.",
".kvvvvvkkvvvvvk.",
"kvVVvvvvvvvvVVvk",
"kvVvkvvvvvvkvVvk",
".kkkvvvvvvvvkkk.",
"...kvvk..kvvk...",
"...kVvk..kvVk...",
"...kkkk..kkkk...",
];

/* ---- 头目：死神 ---- */
RAW.reaper=[
"........kkkkkkkk........",
"......kkkkkkkkkkkk......",
".....kkddddddddkkkk.....",
"....kkddddddddddddkk....",
"....kddddddddddddddk....",
"...kkddkkddddddkkddkk...",
"...kdddkkddddkkkdddk....",
"...kddddddddddddddddk...",
"....kddddddddddddddk....",
"....kddddkkkkkkddddk....",
"...kkddddddddddddddkk...",
"..kdddkkkkkkkkkkkdddk...",
"..kddksskkkkkkkkkdddk...",
"..kddksSkSSSSSSkddddk...",
"..kddddddkkkkkkkddddk...",
"..kddddddddddddddddddk..",
"...kddddddddddddddddk...",
"...kddddkddddddkddddk...",
"....kdddkddddddkdddk....",
"....kdddkddddddkdddk....",
".....kkkkddddddkkkk.....",
".........kddddd.........",
".........kkkkkk.........",
];

/* ---- 头目：血岩傀儡 ---- */
RAW.golem=[
"....kkkkkkkkkkkk....",
"...kssssssssssssk...",
"..kssSSssssssSSssk..",
"..ksskkssssssskkssk.",
"..ksssssssssssssssk.",
".kssssssssssssssssk.",
"kssskssssssssssksssk",
"kssskssssssssssksssk",
"ksskksrrkkkkrrskkssk",
"ksskksrkssssrksskssk",
"kssskksssssssskksssk",
".kssssssssssssssssk.",
".kssksssssssssskssk.",
".kssksssssssssskssk.",
"..kkksssssssssskkk..",
"...kssskk..kksssk...",
"...ksssk....ksssk...",
"...kkkk......kkkk...",
];

/* ---- 头目：吸血鬼领主 ---- */
RAW.lord=[
"..kk..............kk..",
".kRRk............kRRk.",
".kRRRk..........kRRRk.",
"..kRRk..........kRRk..",
"..kRRRkkkkkkkkkkRRRk..",
"...kRRRRRRRRRRRRRRk...",
"....kRRffffffffRRk....",
"....kRffffffffffffRk..",
"....kRffkkffffkkffRk..",
"....kRffkkffffkkffRk..",
"....kRffffffffffffRk..",
".....kffkkkkkkkkffk...",
"....kkRRRRRRRRRRRRkk..",
"...kRRRRRRRRRRRRRRRRk.",
"..kRRRRkkRRRRRRkkRRRk.",
"..kRRRk vvRRRRRRvkRRk.",
".kRRRkvvvvvvvvvvvvkRRk",
".kRRkvvvvvvvvvvvvvvkRk",
".kRRkvvvvvvvvvvvvvvkRk",
"..kkkvvvvvvvvvvvvvvkkk",
"....kvvk..kvvk..kvvk..",
"....kkkk..kkkk..kkkk..",
];

/* ---- 拾取物 ---- */
RAW.gem1=[ // 绿(小)
"..kkk..",
".kgGgk.",
"kgGGGgk",
".kgGgk.",
"..kkk..",
];
RAW.gem2=[ // 蓝(中)
"..kkk..",
".kbBbk.",
"kbBBBbk",
".kbBbk.",
"..kkk..",
];
RAW.gem3=[ // 红(大)
"..kkk..",
".krRrk.",
"krRRRrk",
".krRrk.",
"..kkk..",
];
RAW.potion=[
"...kkk....",
"...kwk....",
"..kkkkk...",
".krrrrrk..",
"krrRRrrrk.",
"krrRRrrrk.",
"krrrrrrrk.",
".krrrrrk..",
"..kkkkk...",
];
RAW.magnet=[
".kkk....kkk.",
"krrk....krrk",
"krwk....kwrk",
"krrk....krrk",
"krrk....krrk",
"krrkkkkkkrrk",
"krrrrrrrrrrk",
".kkkkkkkkkk.",
"....kyyk....",
"....kyyk....",
"....kkkk....",
];
RAW.chest=[
"..kkkkkkkkkk..",
".knnnnnnnnnnk.",
"knnNnnnnnnNnnk",
"kyyyyyyyyyyyyk",
"kyyyykkkkyyyyk",
"knnnnkyyknnnnk",
"knnnnkyyknnnnk",
"knnnnkkkknnnnk",
"knnnnnnnnnnnnk",
".kkkkkkkkkkkk.",
];

/* ---- 地图装饰 ---- */
RAW.grass=[
".q..q..q.",
"q.qqq.q..",
".qQqqqQq.",
"..qqQq...",
];
RAW.flower=[
"..y..",
".yGy.",
"yGGGy",
".yGy.",
"..y..",
];
RAW.rock=[
"...kkkk...",
"..kssssk..",
".kssSSssk.",
"kssssssssk",
"ksSSsssssk",
".kkkkkkkk.",
];
RAW.grave=[
"..kkkkkk..",
".kssssssk.",
"kssSSssssk",
"ksssSSsssk",
"kssssssssk",
"kssSssSssk",
"kssssssssk",
"kssssssssk",
"kkkkkkkkkk",
];
RAW.tree=[
"....kk.kk......",
"..kk.kkk..kk...",
".kkk.kk.kkkk...",
"..kkkkkkkk.kk..",
"....kkkkk.kk...",
".....kkk.kk....",
"..kk..kkkk.....",
".knnk.kkk......",
"..knnkkkk......",
"...knnnk.......",
"....knnk.......",
"....knnk.......",
".....knnk......",
".....knnk......",
"......knk......",
];
RAW.bones=[
"..kxk...kk..",
".kxxxkkkxxk.",
"..kxk...kk..",
];
RAW.coin=[
"..kkkk..",
".kyYYyk.",
"kyYyyyyk",
"kyyyyyyk",
"kyyyyyyk",
"kyyyyyyk",
".kyyyyk.",
"..kkkk..",
];
RAW.ic_totem=[
"....kk......",
"...kgggk....",
"..kgGgGgk...",
"...kgggk....",
"...kxxxxk...",
"..kxkxxkxk..",
"..kxxxxxxk..",
"..kxkxxkxk..",
"...kxxxxk...",
"....knnk....",
"....knnk....",
"...kkkkkk...",
];
RAW.ic_vortex=[
"....kkkk....",
"..kkPPPPkk..",
".kPkkkkkkPk.",
".kPk....kPk.",
"kPPk.kk.kPPk",
"kPkkk..kkkPk",
"kPkkk..kkkPk",
"kPPk.kk.kPPk",
".kPk....kPk.",
".kPkkkkkkPk.",
"..kkPPPPkk..",
"....kkkk....",
];
RAW.shadow=[
"....kkkkkk....",
"...kppppppk...",
"..kppppppppk..",
".kppppppppppk.",
".kpdkkkkkkdpk.",
".kpderkkerdpk.",
".kpdkkkkkkdpk.",
".kppppppppppk.",
"..kppppppppk..",
".kppppppppppk.",
".kpkppppppkpk.",
"..kk.kppk.kk..",
".....kppk.....",
"....kpkpk.....",
".....k.k......",
"..............",
];
RAW.shadow2=RAW.shadow.slice(0,13).concat([
"....kpkpk.....",
"....k...k.....",
"..............",
]);

/* ---- 武器图标 (12x12) ---- */
RAW.ic_whip=[
"..........nn",
".........kk.",
"........knk.",
".......knk..",
"......knk...",
".....knk....",
"....knk.....",
"...knk......",
"..knk.......",
".knk........",
"knk.........",
"kk..........",
];
RAW.ic_knife=[
"........kk..",
".......kSk..",
"......kSk...",
".....kSk....",
"....kSk.....",
"...kSk......",
"..kSk.......",
".knk........",
"knnyk.......",
"knnyyk......",
".knyk.......",
"..kk........",
];
RAW.ic_wand=[
".........AA.",
"........A..A",
".........AA.",
"......kk.A..",
".....knk....",
"....knk.....",
"...knk......",
"..knk.......",
".knk........",
"knk.........",
"kk..........",
"............",
];
RAW.ic_axe=[
"...kkkk.....",
"..kSSSSk....",
".kSSkkSSk...",
".kSSkkSSk...",
"..kkknnk....",
"....knnk....",
"....knnk....",
"....knnk....",
"....knnk....",
"....knnk....",
"....knnk....",
"....kkkk....",
];
RAW.ic_garlic=[
"....kk....",
"...kxxk...",
"..kxxxxk..",
".kxxXXxxk.",
".kxXXXXxk.",
".kxXXXXxk.",
".kxXXXXxk.",
"..kxXXxk..",
"...kxxk...",
"....kk....",
"..........",
"..........",
];
RAW.ic_bible=[
"kkkkkkkkkk..",
"kyyyyyyyyk..",
"kywwwwwwyk..",
"kywyyyywyk..",
"kywywwywyk..",
"kywywwywyk..",
"kywyyyywyk..",
"kywwwwwwyk..",
"kyyyyyyyyk..",
"kkkkkkkkkk..",
"............",
"............",
];
RAW.ic_light=[
"......kk....",
".....kYYk...",
"....kYYk....",
"...kYYk.....",
"..kYYYYYk...",
"...kkYYk....",
".....kYk....",
"....kYk.....",
"...kYk......",
"...kk.......",
"............",
"............",
];
RAW.ic_cross=[
"....kkkk....",
"....kxxk....",
"....kxxk....",
"kkkkkxxkkkkk",
"kxxxxxxxxxxk",
"kkkkkxxkkkkk",
"....kxxk....",
"....kxxk....",
"....kxxk....",
"....kxxk....",
"....kkkk....",
"............",
];
RAW.ic_fire=[
".....k......",
"....kok.....",
"....kokk....",
"...kookk....",
"..koOookk...",
".koOOOookk..",
".koOYOOokk..",
".koOYYOokk..",
"..koOYokk...",
"...koook....",
"....kkk.....",
"............",
];
/* ---- 被动图标 ---- */
RAW.ic_might=[
".....kk.....",
"....kRRk....",
"...kRRRRk...",
"..kRRRRRRk..",
".kRRkkkkRRk.",
".kRk....kRk.",
".kk......kk.",
".kk......kk.",
".kk......kk.",
".kk......kk.",
"kkkkkkkkkkkk",
"............",
];
RAW.ic_tome=[
"kkkkkkkkkk..",
"kppppppppk..",
"kpAAAAAApk..",
"kpAkkkkApk..",
"kpAkAAkApk..",
"kpAkAAkApk..",
"kpAkkkkApk..",
"kpAAAAAApk..",
"kppppppppk..",
"kkkkkkkkkk..",
"............",
"............",
];
RAW.ic_armor=[
"...kkkkkk...",
"..kSSSSSSk..",
".kSSkkkkSSk.",
".kSk....kSk.",
".kSk....kSSk",
".kSk....kSSk",
"..kSk..kSSk.",
"...kSkkSSk..",
"....kkkk....",
"............",
"............",
"............",
];
RAW.ic_wings=[
"..kk......kk..",
".kwwk....kwwk.",
".kwwwk..kwwwk.",
".kwwwwkkwwwwk.",
"..kwwwwwwwwk..",
"...kwwwwwwk...",
"....kwwwwk....",
".....kwwk.....",
"......kk......",
"..............",
"..............",
"..............",
];
RAW.ic_area=[
"............",
"....kkkk....",
"..kk....kk..",
".k........k.",
"k..........k",
"k....kk....k",
"k...kYYk...k",
"k....kk....k",
"k..........k",
".k........k.",
"..kk....kk..",
"....kkkk....",
];
RAW.ic_heart=[
"..kkk..kkk..",
".krrrkkrrrk.",
"krrRrrrrrRrk",
"krrRRrrrRRrk",
"krrrRRRRRrrk",
".krrrRRRrrk.",
"..krrrRrrk..",
"...krrrrk...",
"....krrk....",
".....kk.....",
"............",
"............",
];
RAW.ic_growth=[
"....kk......",
"....kwk.....",
"...kwwwk....",
"kkkkwwwkkk..",
"kwwwwwwwwwk.",
".kwwwwwk....",
"..kwwwk.....",
"...kwk......",
"....k.......",
"............",
"............",
"............",
];
RAW.ic_luck=[
"...kk.kk....",
"..kGkkGk....",
".kGGkGGk....",
".kGGGGGk....",
"..kGGGk.....",
"..kGGGk.....",
".kGkGkGk....",
"..kk.kk.....",
"...k.k......",
"............",
"............",
"............",
];
RAW.ic_dupe=[
"...kk...kk..",
"..kSSk.kSSk.",
"..kSkkkkSSk.",
"..kSSkkkSk..",
"...kSSkSk...",
"....kSSk....",
"....kSSk....",
"...kkkkkk...",
"...kSSSSk...",
"....kkkk....",
"............",
"............",
];

/* ---------- 烘焙全部 ---------- */
const SPR = {};
function buildSprites(){
  for(const k in RAW){
    SPR[k] = defSprite([RAW[k]]);
  }
  // 动画帧
  SPR.heroA  = defSprite([RAW.hero, RAW.hero2]);
  SPR.batA   = defSprite([RAW.bat, RAW.bat2]);
  SPR.zombieA= defSprite([RAW.zombie, RAW.zombie2]);
  SPR.impA   = defSprite([RAW.imp, RAW.imp2]);
  SPR.slimeA = defSprite([RAW.slime, RAW.slime2]);
  SPR.ghostA = defSprite([RAW.ghost, RAW.ghost]);
  SPR.skeletonA = defSprite([RAW.skeleton, RAW.skeleton]);
  SPR.demonA = defSprite([RAW.demon, RAW.demon]);
  SPR.reaperA= defSprite([RAW.reaper, RAW.reaper]);
  SPR.golemA = defSprite([RAW.golem, RAW.golem]);
  SPR.lordA  = defSprite([RAW.lord, RAW.lord]);
  SPR.potionA= defSprite([RAW.potion]);
  SPR.magnetA= defSprite([RAW.magnet]);
  SPR.chestA = defSprite([RAW.chest]);
  SPR.grassA = defSprite([RAW.grass],2);
  SPR.flowerA= defSprite([RAW.flower],2);
  SPR.rockA  = defSprite([RAW.rock],2);
  SPR.graveA = defSprite([RAW.grave],2);
  SPR.treeA  = defSprite([RAW.tree],2);
  SPR.bonesA = defSprite([RAW.bones],2);
  SPR.coinA  = defSprite([RAW.coin],2);
  SPR.shadowA= defSprite([RAW.shadow, RAW.shadow2]);
}
/* 通用绘制：底边中心锚点，支持翻转/缩放/闪白/透明 */
function drawSpr(spr, x, y, o){
  o=o||{};
  const f=o.f||0;
  const c=(o.white&&spr.white[f])?spr.white[f]:spr.frames[f%spr.frames.length];
  const g=ctx;
  g.save();
  if(o.alpha!==undefined) g.globalAlpha=o.alpha;
  g.translate(Math.round(x), Math.round(y));
  if(o.flip) g.scale(-1,1);
  if(o.scale && o.scale!==1) g.scale(o.scale,o.scale);
  g.drawImage(c, -c.width/2, -c.height);
  g.restore();
}
