'use strict';
/* ============================================================
 * content.js — 游戏内容：武器 / 被动 / 敌人 / 角色 / 事件
 * 武器 st(lv,P) 计算面板，fire(api,w,st) 负责开火逻辑。
 * P = 玩家聚合属性（含被动加成）
 * ============================================================ */

const WEAPONS = {
  whip:{
    name:'血鞭', icon:'ic_whip', maxLv:8,
    tip:'横扫身前，Lv4 后同时抽击身后',
    evo:{passive:'might', name:'血月之鞭', tip:'血月加冕：前后同时抽击，范围与伤害大幅提升'},
    tips:['挥出血鞭抽打身前敌人','伤害提升','范围提升','同时抽击身后','伤害提升','可同时抽打两侧','伤害大幅提升','伤害与范围大幅提升'],
    st(lv,P){ return { dmg:14+9*lv, cd:1.35*P.cd, area:(1+0.1*lv)*P.area, amount:(lv>=6?2:1), range:95+9*lv }; },
    fire(api,w,s){
      const dirs = (w.evolved||w.lv>=4)? [api.face, -api.face] : [api.face];
      for(let i=0;i<s.amount;i++){
        for(const d of dirs){
          api.slash(api.px, api.py, d>0?0:Math.PI, s.range*0.5*s.area, 46*s.area, s.dmg*P_(api).might, 'whip');
        }
      }
      api.sfx('slash');
      function P_(){ return api.P; }
    },
  },
  knife:{
    name:'飞刀', icon:'ic_knife', maxLv:8,
    tip:'朝面向方向高速投掷飞刀',
    evo:{passive:'dupe', name:'万刃风暴', tip:'刀刃如暴雨倾泻，穿透大增'},
    tips:['投出一把飞刀','伤害提升','+1 把飞刀','伤害与穿透提升','+1 把飞刀','伤害提升','+1 把飞刀','伤害与穿透大幅提升'],
    st(lv,P){ return { dmg:8+4*lv, cd:0.95*P.cd, amount:1+Math.floor(lv/3)+(lv>=8?1:0), speed:540*P.pspd, pierce:lv>=8?3:(lv>=4?2:1) }; },
    fire(api,w,s){
      for(let i=0;i<s.amount;i++){
        const a = api.faceA + (i-(s.amount-1)/2)*0.13;
        api.proj({x:api.px,y:api.py-10,vx:Math.cos(a)*s.speed,vy:Math.sin(a)*s.speed,
          dmg:s.dmg*api.P.might, r:9, pierce:s.pierce, life:1.4, spr:'ic_knife', spin:0, wid:'knife'});
      }
      api.sfx('shoot');
    },
  },
  wand:{
    name:'魔杖', icon:'ic_wand', maxLv:8,
    tip:'自动射向最近的敌人',
    evo:{passive:'tome', name:'奥术洪流', tip:'魔弹成潮水般齐射'},
    tips:['射出一发魔弹','伤害提升','+1 发魔弹','伤害提升','+1 发魔弹','伤害与弹速提升','+1 发魔弹','伤害大幅提升'],
    st(lv,P){ return { dmg:10+5*lv, cd:1.05*P.cd, amount:1+Math.floor((lv+1)/3), speed:430*P.pspd }; },
    fire(api,w,s){
      const ts=api.nearestN(s.amount);
      for(let i=0;i<s.amount;i++){
        const t=ts[i%Math.max(1,ts.length)];
        let a = t? Math.atan2(t.y-api.py,t.x-api.px) : api.faceA;
        a += (i>=ts.length? Math.PI : 0) + (Math.random()-0.5)*0.08;
        api.proj({x:api.px,y:api.py-10,vx:Math.cos(a)*s.speed,vy:Math.sin(a)*s.speed,
          dmg:s.dmg*api.P.might, r:8, pierce:1, life:1.6, magic:true, wid:'wand'});
      }
      api.sfx('shoot');
    },
  },
  axe:{
    name:'巨斧', icon:'ic_axe', maxLv:8,
    tip:'抛向空中划出弧线，穿透打击',
    evo:{passive:'area', name:'处刑巨斧', tip:'巨斧化作绞肉风车，撕裂全场'},
    tips:['抛出一把巨斧','伤害提升','+1 把斧头','伤害与穿透提升','+1 把斧头','伤害提升','+1 把斧头','伤害与穿透大幅提升'],
    st(lv,P){ return { dmg:24+12*lv, cd:1.7*P.cd, amount:1+Math.floor(lv/3), pierce:lv>=8?8:(lv>=4?5:3), size:1+0.07*lv }; },
    fire(api,w,s){
      for(let i=0;i<s.amount;i++){
        api.proj({x:api.px,y:api.py-14,vx:(Math.random()*160-80)+(i-1)*70,vy:-430-Math.random()*80,
          dmg:s.dmg*api.P.might, r:14*s.size, pierce:s.pierce, life:2.6, spr:'ic_axe', spin:9, grav:980, wid:'axe'});
      }
      api.sfx('slash');
    },
  },
  garlic:{
    name:'圣蒜光环', icon:'ic_garlic', maxLv:8,
    tip:'环绕圣洁光环，持续灼伤并击退',
    evo:{passive:'heart', name:'圣者领域', tip:'圣光领域扩张成不可逾越的圣域'},
    tips:['圣光环绕自身','伤害提升','范围提升','伤害提升','范围与伤害提升','击退增强','伤害提升','范围与伤害大幅提升'],
    st(lv,P){ return { dmg:(3+2*lv)*P.might, cd:0.5*P.cd, radius:(66+10*lv)*P.area, kb:lv>=6?90:45 }; },
    fire(api,w,s){
      api.auraHit(s.radius, s.dmg, s.kb);
      w.pulse = 1;
    },
  },
  bible:{
    name:'圣书环绕', icon:'ic_bible', maxLv:8,
    tip:'圣书环绕护体，周期性激活',
    evo:{passive:'armor', name:'圣典结界', tip:'六本圣书组成旋转结界'},
    tips:['1本圣书环绕','伤害提升','+1本圣书','持续时间提升','+1本圣书','伤害提升','+1本圣书','伤害与速度大幅提升'],
    st(lv,P){ return { dmg:11+6*lv, cd:5.5*P.cd, dur:3+0.4*Math.floor(lv/4), amount:1+Math.floor(lv/2)-(lv>=8?0:1)-(lv>=2&&lv<4?0:1)+((lv>=2)?1:0), radius:74+8*lv, spin:(3.1+0.15*lv) }; },
    fire(api,w,s){
      w.active={t:s.dur, ang:0, n:Math.max(1,Math.min(6,1+Math.floor(w.lv/2)+(w.evolved?2:0))), dmg:s.dmg, r:s.radius, spin:s.spin};
    },
  },
  lightning:{
    name:'天罚闪电', icon:'ic_light', maxLv:8,
    tip:'雷电随机轰击敌人并溅射',
    evo:{passive:'luck', name:'天罚风暴', tip:'雷霆之海随机轰击全场'},
    tips:['轰击一名敌人','伤害提升','+1 道闪电','溅射范围提升','伤害提升','+1 道闪电','伤害提升','伤害与数量大幅提升'],
    st(lv,P){ return { dmg:30+14*lv, cd:2.3*P.cd, amount:1+Math.floor(lv/3)+(lv>=7?1:0), aoe:(58+7*lv)*P.area }; },
    fire(api,w,s){
      const ts=api.randomEnemies(s.amount);
      for(const t of ts){ api.bolt(t.x,t.y,s.dmg*api.P.might,s.aoe); }
      if(ts.length) api.sfx('thunder');
    },
  },
  cross:{
    name:'圣十字', icon:'ic_cross', maxLv:8,
    tip:'飞出后折返的穿透十字',
    evo:{passive:'magnetP', name:'圣光回旋刃', tip:'十字化作追踪回旋的圣光之刃'},
    tips:['投出一枚十字','伤害提升','+1 枚十字','伤害与弹速提升','+1 枚十字','伤害提升','+1 枚十字','伤害大幅提升'],
    st(lv,P){ return { dmg:17+8*lv, cd:2.1*P.cd, amount:1+Math.floor(lv/3), speed:(370+15*lv)*P.pspd }; },
    fire(api,w,s){
      const ts=api.nearestN(s.amount);
      for(let i=0;i<s.amount;i++){
        const t=ts[i%Math.max(1,ts.length)];
        let a=t? Math.atan2(t.y-api.py,t.x-api.px) : api.faceA;
        api.proj({x:api.px,y:api.py-10,vx:Math.cos(a)*s.speed,vy:Math.sin(a)*s.speed,
          dmg:s.dmg*api.P.might, r:12, pierce:999, life:4, spr:'ic_cross', spin:7, boomerang:true, wid:'cross'});
      }
      api.sfx('shoot');
    },
  },
  fire:{
    name:'炼狱火瓶', icon:'ic_fire', maxLv:8,
    tip:'掷出火瓶留下燃烧地带',
    evo:{passive:'growth', name:'无尽炼狱', tip:'火海更持久更炽热，吞噬一切'},
    tips:['掷出一瓶地狱火','伤害提升','燃烧范围提升','+1 瓶','伤害提升','燃烧时间提升','+1 瓶','伤害与范围大幅提升'],
    st(lv,P){ return { dmg:(5+2.5*lv)*P.might, cd:3.1*P.cd, amount:1+Math.floor(lv/4)+(lv>=8?1:0), radius:(56+8*lv)*P.area, dur:2.6+0.35*Math.floor(lv/6) }; },
    fire(api,w,s){
      for(let i=0;i<s.amount;i++){
        const t=api.randomEnemies(1)[0];
        const tx=t?t.x+(Math.random()*60-30):api.px+(Math.random()*200-100);
        const ty=t?t.y+(Math.random()*60-30):api.py+(Math.random()*200-100);
        api.zone(tx,ty,s.radius,s.dur,s.dmg,'fire');
      }
      api.sfx('slash');
    },
  },
  totem:{
    name:'毒图腾', icon:'ic_totem', maxLv:8,
    tip:'放置毒图腾，持续释放毒云侵蚀',
    evo:{passive:'wings', name:'瘟疫之柱', tip:'毒云扩张成蔓延的瘟疫之地'},
    tips:['放置一座毒图腾','伤害提升','+1 座图腾','持续时间提升','伤害提升','+1 座图腾','毒云范围提升','伤害与数量大幅提升'],
    st(lv,P){ return { dmg:(5+2.6*lv)*P.might, cd:5.2*P.cd, amount:1+Math.floor(lv/3)+(lv>=8?1:0), radius:(58+7*lv)*P.area, dur:5+0.5*Math.floor(lv/2) }; },
    fire(api,w,s){
      for(let i=0;i<s.amount;i++){
        const a=Math.random()*TAU, r=40+Math.random()*70;
        api.zone(api.px+Math.cos(a)*r, api.py+Math.sin(a)*r, s.radius, s.dur, s.dmg, 'poison');
      }
      api.sfx('slash');
    },
  },
};

/* ---------- 被动道具 ---------- */
const PASSIVES = {
  might:{ name:'力量之证', icon:'ic_might', maxLv:5, tip:'所有伤害 +12% / 级' },
  tome:{ name:'虚空魔典', icon:'ic_tome', maxLv:5, tip:'武器冷却 -7% / 级' },
  armor:{ name:'荆棘护甲', icon:'ic_armor', maxLv:5, tip:'受到伤害 -1 / 级（最低1）' },
  wings:{ name:'追风之翼', icon:'ic_wings', maxLv:5, tip:'移动速度 +8% / 级' },
  area:{ name:'广域棱镜', icon:'ic_area', maxLv:5, tip:'攻击范围 +10% / 级' },
  magnetP:{ name:'虚空磁石', icon:'ic_dupe', maxLv:5, tip:'拾取范围 +30% / 级' },
  heart:{ name:'不冻心脏', icon:'ic_heart', maxLv:5, tip:'每秒回复 +0.4 HP / 级' },
  growth:{ name:'智慧果实', icon:'ic_growth', maxLv:5, tip:'经验获取 +10% / 级' },
  luck:{ name:'幸运草', icon:'ic_luck', maxLv:5, tip:'掉落概率 +15% / 级' },
  dupe:{ name:'幻影分身', icon:'ic_dupe', maxLv:2, tip:'所有武器 +1 弹体 / 级' },
};

/* ---------- 敌人 ---------- */
const ENEMIES = {
  bat:     { name:'蝙蝠', spr:'batA', anim:9,  hp:8,   spd:96,  dmg:4,  xp:1,  r:11, wobble:1 },
  zombie:  { name:'僵尸', spr:'zombieA', anim:4, hp:26, spd:50, dmg:8, xp:2, r:13 },
  skeleton:{ name:'骷髅', spr:'skeletonA', anim:5, hp:42, spd:78, dmg:11, xp:3, r:13, first:1 },
  ghost:   { name:'幽灵', spr:'ghostA', anim:3, hp:60, spd:86, dmg:13, xp:5, r:13, ghost:true, first:1 },
  imp:     { name:'小恶魔', spr:'impA', anim:7, hp:48, spd:116, dmg:11, xp:6, r:12, zigzag:1, first:1 },
  slime:   { name:'史莱姆', spr:'slimeA', anim:3, hp:115, spd:36, dmg:15, xp:9, r:17, squash:1, first:1 },
  demon:   { name:'大恶魔', spr:'demonA', anim:4, hp:200, spd:64, dmg:18, xp:14, r:16, first:1 },
  hunter:  { name:'暗影猎手', spr:'ghostA', anim:7, hp:2600, spd:100, dmg:20, xp:26, r:14, ghost:true, dash2:1, noScale:1, first:1 },
  /* 头目 */
  reaper:  { name:'死神', spr:'reaperA', anim:2, hp:1700, spd:62, dmg:26, xp:80, r:26, boss:1, dash:1, size:1.15 },
  golem:   { name:'血岩傀儡', spr:'golemA', anim:1, hp:5600, spd:38, dmg:34, xp:120, r:30, boss:1, slam:1, size:1.1 },
  lord:    { name:'吸血鬼领主', spr:'lordA', anim:2, hp:12000, spd:58, dmg:30, xp:160, r:27, boss:1, summon:1, size:1.1 },
};

/* 出场时间（秒）与权重 */
const ENEMY_POOL = [
  { id:'bat', from:0 },
  { id:'zombie', from:0 },
  { id:'skeleton', from:170 },
  { id:'ghost', from:350 },
  { id:'imp', from:520 },
  { id:'slime', from:700 },
  { id:'demon', from:880 },
];

/* 定时事件：t=游戏秒 */
const EVENTS = [
  { t:110, type:'ring', e:'bat', n:26, msg:'蝙蝠群袭来！' },
  { t:230, type:'ring', e:'bat', n:44, msg:'大批蝙蝠包围了你！' },
  { t:300, type:'boss', e:'reaper', msg:'⚠ 死神现身！' },
  { t:420, type:'wall', e:'zombie', n:30, msg:'僵尸潮从一侧涌来！' },
  { t:560, type:'ring', e:'skeleton', n:36, msg:'骷髅环阵！' },
  { t:600, type:'boss', e:'golem', msg:'⚠ 血岩傀儡苏醒！' },
  { t:720, type:'ring', e:'ghost', n:30, msg:'怨灵萦绕……' },
  { t:840, type:'swarm', e:'imp', n:36, msg:'恶魔群扑来！' },
  { t:660, type:'heal', msg:'✚ 天使之光降临！' },
  { t:760, type:'firewall', msg:'火墙走廊来袭！' },
  { t:900, type:'boss', e:'lord', msg:'⚠ 吸血鬼领主降临！' },
  { t:950, type:'chestrain', msg:'宝箱雨！抬头看！' },
  { t:1000, type:'ring', e:'demon', n:16, msg:'地狱之门开启！' },
  { t:1080, type:'swarm', e:'skeleton', n:34, msg:'亡者大军压境！' },
  { t:1120, type:'hunters', n:4, msg:'暗影猎手盯上了你！' },
  { t:1140, type:'swarm', e:'demon', n:18, elite:2, msg:'最终考验！' },
];

/* ---------- 角色 ---------- */
const CHARACTERS = {
  hunter:{ name:'猎人', spr:'heroA', weapon:'whip', desc:'均衡的吸血鬼猎人。\n全天候作战首选。', mods:{might:1.1}, stat:'+10% 伤害' },
  mage:{ name:'法师', spr:'heroA', weapon:'wand', desc:'精通奥术的法师。\n冷却更快，范围更广。', mods:{cd:0.9,area:1.1}, stat:'-10% 冷却 / +10% 范围' },
  knight:{ name:'骑士', spr:'heroA', weapon:'axe', desc:'重甲骑士，稳如磐石。\n生命更厚，但脚步沉重。', mods:{maxhp:140,armor:2,speed:0.92}, stat:'+40 HP / +2 护甲 / -8% 速度' },
};
