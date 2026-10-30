'use strict';
/* ============================================================
 * game.js — 血月幸存者 主引擎
 * 固定步长 60Hz · 空间哈希碰撞 · 摄像机 · 波次导演 · Canvas HUD
 * ============================================================ */

/* ---------- 基础工具 ---------- */
const TAU = Math.PI*2;
const WORLD = 3200;            // 世界边长
const GAME_LEN = 1200;         // 20 分钟胜利
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rnd=(a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a);
const irnd=(a,b)=>Math.floor(rnd(a,b+1));
const pick=a=>a[(Math.random()*a.length)|0];
const d2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const lerp=(a,b,t)=>a+(b-a)*t;
let uidC=1;

/* ---------- 画布 ---------- */
let cv=null, ctx=null, VW=1280, VH=720, DPR=1;
function initCanvas(){
  cv=document.getElementById('cv');
  ctx=cv.getContext('2d');
  resize();
  window.addEventListener('resize',resize);
}
function resize(){
  DPR=Math.min(1.5, window.devicePixelRatio||1);
  VW=window.innerWidth; VH=window.innerHeight;
  cv.width=VW*DPR; cv.height=VH*DPR;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.imageSmoothingEnabled=false;
  buildVignette();
}

/* ---------- 输入 ---------- */
const keys={};
function bindInput(){
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    keys[k]=true;
    AudioSys.unlock();
    if(k==='escape') togglePause();
    if(k==='m'){ AudioSys.setMuted(!AudioSys.muted); showToast(AudioSys.muted?'已静音':'声音开启'); }
  });
  window.addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
  window.addEventListener('pointerdown',()=>AudioSys.unlock(),{once:false});
  window.addEventListener('blur',()=>{ if(state==='playing') pauseGame(); });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden&&state==='playing') pauseGame(); });
}
function axisX(){
  if(touch.active&&Math.abs(touch.dx)>8) return clamp(touch.dx/40,-1,1);
  return (keys['d']||keys['arrowright']?1:0)-(keys['a']||keys['arrowleft']?1:0);
}
function axisY(){
  if(touch.active&&Math.abs(touch.dy)>8) return clamp(touch.dy/40,-1,1);
  return (keys['s']||keys['arrowdown']?1:0)-(keys['w']||keys['arrowup']?1:0);
}
/* ---------- 触屏虚拟摇杆 ---------- */
const touch={active:false,id:-1,ox:0,oy:0,dx:0,dy:0};
function bindTouch(){
  cv.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch') return;
    touch.active=true; touch.id=e.pointerId;
    touch.ox=e.clientX; touch.oy=e.clientY; touch.dx=0; touch.dy=0;
  });
  cv.addEventListener('pointermove',e=>{
    if(!touch.active||e.pointerId!==touch.id) return;
    touch.dx=e.clientX-touch.ox; touch.dy=e.clientY-touch.oy;
    const l=Math.hypot(touch.dx,touch.dy);
    if(l>52){
      const nx=touch.dx/l*52, ny=touch.dy/l*52;
      touch.ox=e.clientX-nx; touch.oy=e.clientY-ny;
      touch.dx=nx; touch.dy=ny;
    }
  });
  const up=e=>{ if(e.pointerId===touch.id){ touch.active=false; touch.dx=0; touch.dy=0; } };
  cv.addEventListener('pointerup',up);
  cv.addEventListener('pointercancel',up);
}

/* ---------- 全局状态 ---------- */
let state='menu';   // menu charsel playing levelup paused dying dead winning win
let G=null;         // 对局
let menuT=0;
const MBATS=[];
window.__errors=[];
window.onerror=(msg,src,line)=>{
  window.__errors.push(msg+' @'+line);
  const eb=document.getElementById('errbox');
  if(eb){ eb.style.display='block'; eb.textContent=window.__errors.slice(-6).join('\n'); }
  return false;
};

/* ---------- 空间哈希 ---------- */
const CELL=72;
let hash=new Map();
function hashKey(cx,cy){ return cx+'_'+cy; }
function rebuildHash(){
  hash.clear();
  for(const e of G.enemies){
    if(e.dead) continue;
    const k=hashKey(Math.floor(e.x/CELL),Math.floor(e.y/CELL));
    let arr=hash.get(k); if(!arr){arr=[];hash.set(k,arr);}
    arr.push(e);
  }
}
function queryCircle(x,y,r,out){
  out.length=0;
  const x0=Math.floor((x-r)/CELL),x1=Math.floor((x+r)/CELL);
  const y0=Math.floor((y-r)/CELL),y1=Math.floor((y+r)/CELL);
  for(let cx=x0;cx<=x1;cx++)for(let cy=y0;cy<=y1;cy++){
    const arr=hash.get(hashKey(cx,cy));
    if(!arr) continue;
    for(const e of arr){ if(!e.dead && d2(x,y,e.x,e.y)<=(r+e.r)*(r+e.r)) out.push(e); }
  }
  return out;
}
const _q=[];

/* ============================================================
 * 对局创建
 * ============================================================ */
/* 主菜单演示对局：AI 用典型开局在后台自动游玩 */
function startDemo(){
  startGame('hunter');
  G.ai=true; G.god=true; G.demo=true; G.timeScale=0.75;
  G.weapons=[{id:'whip',lv:3,t:0.3,pulse:0,active:null},{id:'wand',lv:2,t:0.3,pulse:0,active:null},{id:'garlic',lv:2,t:0.3,pulse:0,active:null}];
  recalcStats();
  G.time=120+Math.random()*120;
  state='menu';
  showScreen('menu');
  if(AudioSys.ctx) AudioSys.play('menu');
}
function startGame(charId){
  const ch=CHARACTERS[charId]||CHARACTERS.hunter;
  G={
    char:charId, time:0, kills:0, gold:0, meta:loadMeta(),
    xp:0, level:1, luQueue:0,
    player:{ x:WORLD/2, y:WORLD/2, r:12, hp:100, face:1, faceA:0, iframes:0, hurtF:0, walkT:0 },
    weapons:[], passives:{},
    enemies:[], projs:[], gems:[], pickups:[], parts:[], texts:[], slashes:[], zones:[], bolts:[],
    cam:{x:WORLD/2,y:WORLD/2,shake:0},
    spawnT:1.2, evIdx:0, boss:null,
    timeScale:1, god:false, dieT:0, winT:0, paused:false, hitstop:0,
    gemsGot:0,
  };
  Pmods=ch.mods||{};
  G.weapons.push({id:ch.weapon, lv:1, t:0.4, pulse:0, active:null});
  recalcStats();
  G.player.hp=G.P.maxhp;
  genDecor();
  state='playing';
  showScreen(null);
  AudioSys.play('game');
  hudGems=0;
}

/* ---------- 永久强化（元进度） ---------- */
function loadMeta(){ try{ return JSON.parse(localStorage.getItem('bms_upgrades')||'{}'); }catch(e){ return {}; } }
function saveMeta(m){ try{ localStorage.setItem('bms_upgrades',JSON.stringify(m)); }catch(e){} }
function loadBank(){ try{ return parseInt(localStorage.getItem('bms_bank')||'0',10)||0; }catch(e){ return 0; } }
function addBank(n){ try{ localStorage.setItem('bms_bank',''+(loadBank()+n)); }catch(e){} }
const SHOP_ITEMS=[
  {id:'hp',  name:'生命上限', desc:'每级 +10 最大生命', max:5, cost:l=>20*Math.pow(2,l)},
  {id:'dmg', name:'力量祝福', desc:'每级 +4% 伤害', max:5, cost:l=>30*Math.pow(2,l)},
  {id:'spd', name:'轻靴', desc:'每级 +3% 移动速度', max:3, cost:l=>40*Math.pow(2,l)},
  {id:'mag', name:'贪婪磁石', desc:'每级 +15% 拾取范围', max:3, cost:l=>40*Math.pow(2,l)},
];

/* ---------- 角色属性与被动 ---------- */
let Pmods={};
function recalcStats(){
  const p=G.passives;
  const lv=id=>p[id]||0;
  const M=G.meta||{};
  const P={};
  P.maxhp = (Pmods.maxhp||100) + 10*(M.hp||0);
  P.might = (Pmods.might||1) * Math.pow(1.12, lv('might')) * (1+0.04*(M.dmg||0));
  P.cd    = (Pmods.cd||1) * Math.pow(0.93, lv('tome'));
  P.area  = (Pmods.area||1) * (1+0.10*lv('area'));
  P.pspd  = 1;
  P.amount= lv('dupe');
  P.armor = (Pmods.armor||0) + lv('armor');
  P.speed = 175 * (Pmods.speed||1) * (1+0.08*lv('wings')) * (1+0.03*(M.spd||0));
  P.magnet= 55 * (1+0.30*lv('magnetP')) * (1+0.15*(M.mag||0));
  P.regen = 0.4*lv('heart');
  P.growth= 1+0.10*lv('growth');
  P.luck  = 1+0.15*lv('luck');
  G.P=P;
}

/* ============================================================
 * 武器运行时
 * ============================================================ */
const EVOLVE_BONUS={knife:4,wand:3,axe:2,lightning:3,cross:2,fire:1,whip:1,bible:2,garlic:0};
function weaponStats(w){
  const def=WEAPONS[w.id];
  const s=def.st(w.lv,G.P);
  if(w.evolved){
    s.dmg=(s.dmg||0)*1.5;
    if(s.radius) s.radius*=1.25;
    if(s.aoe) s.aoe*=1.35;
    if(s.range) s.range*=1.35;
    if(s.speed) s.speed*=1.25;
    if(s.spin) s.spin+=1.5;
    if(s.pierce!==undefined) s.pierce+=2;
    if(s.dur) s.dur+=1;
    if(s.amount!==undefined) s.amount+=EVOLVE_BONUS[w.id]||0;
  }
  if(s.amount!==undefined) s.amount+=G.P.amount;
  return s;
}
function weaponAPI(){
  const pl=G.player;
  return {
    px:pl.x, py:pl.y, P:G.P, face:pl.face, faceA:pl.faceA,
    nearestN(n){
      const list=[];
      for(const e of G.enemies){ if(e.dead||e.spawnT>0) continue;
        const dd=d2(pl.x,pl.y,e.x,e.y); list.push([dd,e]); }
      list.sort((a,b)=>a[0]-b[0]);
      return list.slice(0,Math.max(0,n)).map(v=>v[1]);
    },
    randomEnemies(n){
      const live=G.enemies.filter(e=>!e.dead&&e.spawnT<=0);
      const out=[];
      for(let i=0;i<n&&live.length;i++) out.push(pick(live));
      return out;
    },
    proj(o){ o.uid=uidC++; o.hit=new Set(); o.t=0; G.projs.push(o); },
    slash(x,y,ang,range,half,dmg){
      const s={x,y,ang,range,half,dmg,t:0,dur:0.22,applied:true};
      applySlashDamage(s);
      G.slashes.push(s);
    },
    zone(x,y,r,dur,dmg,kind,opts){ const z={x,y,r,dur,t:0,tick:0,dmg,kind,uid:uidC++}; if(opts) Object.assign(z,opts); G.zones.push(z); },
    bolt(x,y,dmg,aoe){
      G.bolts.push({x,y,t:0,dur:0.28,seed:Math.random()*7});
      queryCircle(x,y,aoe,_q);
      for(const e of _q) damageEnemy(e,dmg,(e.x-x)*2,(e.y-y)*2);
      for(let i=0;i<8;i++) addPart(x+rnd(-aoe/2,aoe/2),y+rnd(-aoe/3,aoe/3),rnd(-40,40),rnd(-80,-10),0.4,'#f0cf6e',3,true);
    },
    auraHit(radius,dmg,kb){
      queryCircle(G.player.x,G.player.y,radius,_q);
      for(const e of _q){
        damageEnemy(e,dmg,(e.x-G.player.x)/Math.max(1,Math.hypot(e.x-G.player.x,e.y-G.player.y))*kb,
                         (e.y-G.player.y)/Math.max(1,Math.hypot(e.x-G.player.x,e.y-G.player.y))*kb);
        if(Math.random()<0.3) addPart(e.x+rnd(-6,6),e.y-8,0,-40,0.4,'#f0cf6e',2,true);
      }
    },
    sfx(n){ AudioSys.sfx(n); },
  };
}
function updateWeapons(dt){
  const pl=G.player;
  for(const w of G.weapons){
    const def=WEAPONS[w.id];
    if(w.id==='bible'&&w.active){
      const a=w.active;
      a.t-=dt; a.ang+=a.spin*dt;
      for(let i=0;i<a.n;i++){
        const ang=a.ang+i*TAU/a.n;
        const ox=pl.x+Math.cos(ang)*a.radius, oy=pl.y+Math.sin(ang)*a.radius;
        queryCircle(ox,oy,18,_q);
        for(const e of _q){
          if(canHit(e,'bible',0.45)) damageEnemy(e,a.dmg*G.P.might,Math.cos(ang)*60,Math.sin(ang)*60);
        }
      }
      if(a.t<=0) w.active=null;
    }
    if(w.id==='garlic') w.pulse=Math.max(0,w.pulse-dt*4);
    w.t-=dt;
    if(w.t<=0 && !(w.id==='bible'&&w.active)){
      const s=weaponStats(w);
      def.fire(weaponAPI(),w,s);
      w.t=Math.max(0.1,s.cd);
    }
  }
}
function canHit(e,wid,interval){
  if(!e.wcd) e.wcd={};
  const now=G.time;
  if((e.wcd[wid]||0)<=now){ e.wcd[wid]=now+interval; return true; }
  return false;
}
/* 鞭击伤害：以玩家为圆心的扇形判定，出手瞬间立即结算 */
function applySlashDamage(s){
  const c=Math.cos(s.ang), sn=Math.sin(s.ang);
  queryCircle(s.x+c*s.range*0.5,s.y+sn*s.range*0.5,Math.max(s.range,s.half)*0.9,_q);
  for(const e of _q){
    const dx=e.x-s.x, dy=e.y-s.y;
    const lx=dx*c+dy*sn, ly=-dx*sn+dy*c;
    if(lx>-14 && lx<s.range+e.r && Math.abs(ly)<s.half+e.r)
      damageEnemy(e,s.dmg,c*140,sn*140);
  }
}

/* ============================================================
 * 投射物 / 地带
 * ============================================================ */
function updateProjs(dt){
  const pl=G.player;
  for(const p of G.projs){
    if(p.grav) p.vy+=p.grav*dt;
    if(p.boomerang){
      if(!p.ph){ p.vx*=Math.pow(0.18,dt); p.vy*=Math.pow(0.18,dt);
        if(Math.abs(p.vx)+Math.abs(p.vy)<40){ p.ph=1; p.hit.clear(); } }
      else{
        const a=Math.atan2(pl.y-p.y,pl.x-p.x);
        const sp=420; p.vx=lerp(p.vx,Math.cos(a)*sp,1-Math.pow(0.001,dt)); p.vy=lerp(p.vy,Math.sin(a)*sp,1-Math.pow(0.001,dt));
        if(d2(p.x,p.y,pl.x,pl.y)<400) p.life=0;
      }
    }
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.t+=dt; p.life-=dt;
    if(p.spin) p.ang=(p.ang||0)+p.spin*dt;
    if(p.life<=0 || p.x<0||p.y<0||p.x>WORLD||p.y>WORLD){ p.dead=true; continue; }
    if(p.x<G.player.x-VW || p.x>G.player.x+VW || p.y<G.player.y-VH || p.y>G.player.y+VH) { p.dead=true; continue; }
    queryCircle(p.x,p.y,p.r+6,_q);
    for(const e of _q){
      if(p.hit.has(e.uid)) continue;
      p.hit.add(e.uid);
      damageEnemy(e,p.dmg,p.vx*0.14,p.vy*0.14);
      if(--p.pierce<=0){ p.dead=true; break; }
    }
  }
  G.projs=G.projs.filter(p=>!p.dead);
  for(const z of G.zones){
    z.t+=dt; z.tick-=dt;
    if(z.tick<=0){
      z.tick=0.5;
      if(z.kind==='heal'){
        if(d2(z.x,z.y,G.player.x,G.player.y)<z.r*z.r){
          G.player.hp=Math.min(G.P.maxhp,G.player.hp+4);
          if(Math.random()<0.5) addPart(G.player.x+rnd(-14,14),G.player.y-rnd(0,20),0,-50,0.5,'#f0cf6e',2,true);
        }
      } else if(z.kind==='vortex'){
        queryCircle(z.x,z.y,z.r,_q);
        for(const e of _q){
          damageEnemy(e,z.dmg,0,0);
          const dx=z.x-e.x, dy=z.y-e.y;
          const l=Math.hypot(dx,dy)||1;
          const pull=(z.pull||14)*(e.boss?0.15:1);
          e.x+=dx/l*pull; e.y+=dy/l*pull;
          if(Math.random()<0.35) addPart(e.x+rnd(-6,6),e.y-6,dx/l*80+rnd(-25,25),dy/l*80+rnd(-25,25),0.4,'#a06bb5',2,true);
        }
      } else {
        queryCircle(z.x,z.y,z.r,_q);
        for(const e of _q) damageEnemy(e,z.dmg,0,0);
      }
    }
    const pc=z.kind==='poison'?'#78a75f':z.kind==='heal'?'#f0cf6e':'#eb9a4a';
    if(Math.random()<0.5) addPart(z.x+rnd(-z.r,z.r)*0.8,z.y+rnd(-z.r,z.r)*0.5,rnd(-15,15),rnd(-70,-30),0.6,pc,3,z.kind!=='poison');
    if(z.t>=z.dur) z.dead=true;
  }
  G.zones=G.zones.filter(z=>!z.dead);
  for(const s of G.slashes){
    s.t+=dt;
    if(s.t>=s.dur) s.dead=true;
  }
  G.slashes=G.slashes.filter(s=>!s.dead);
  for(const b of G.bolts){ b.t+=dt; if(b.t>=b.dur) b.dead=true; }
  G.bolts=G.bolts.filter(b=>!b.dead);
}

/* ============================================================
 * 敌人
 * ============================================================ */
function hpScale(){ const t=G.time; return 1+t*0.0016+(t>600?(t-600)*0.0019:0); }
function dmgScale(){ return 1+G.time*0.00055; }
function spawnEnemy(id, x, y, opts){
  const def=ENEMIES[id];
  opts=opts||{};
  const elite=opts.elite&&!def.boss;
  const e={
    uid:uidC++, id, name:def.name, boss:def.boss,
    x,y, r:def.r*(elite?1.45:1), hp:0, maxhp:0,
    spd:def.spd*(elite?0.92:1)*rnd(0.92,1.08), dmg:def.dmg, xp:def.xp,
    elite, flashT:0, kx:0, ky:0, dead:false, spawnT:def.boss?0.6:0.25,
    seed:Math.random()*10, animT:Math.random()*2, wcd:{},
    phT:rnd(0.8), phS:Math.random()<0.5?1:-1,
    stT:def.dash2?rnd(1.5,3):0, stMode:0, // 头目/猎手技能状态
  };
  if(!def.boss){
    e.maxhp=def.noScale? Math.round(def.hp) : Math.round(def.hp*hpScale()*(elite?9:1));
  } else { e.maxhp=Math.round(def.hp); }
  e.hp=e.maxhp;
  e.dmg=Math.round(def.dmg*(elite?1.5:1));
  G.enemies.push(e);
  if(!G.seen) G.seen={};
  if(!G.seen[id]){
    G.seen[id]=1;
    if(def.first&&G.time>60&&!G.demo) showToast('⚠ 新怪物出现：'+def.name,'warn',2.4);
  }
  if(def.boss){ G.boss=e; AudioSys.sfx('boss'); G.cam.shake=Math.max(G.cam.shake,8); }
  return e;
}
function spawnAtEdge(id,opts){
  const pl=G.player;
  const R=Math.max(VW,VH)*0.62+60;
  const a=rnd(TAU);
  let x=clamp(pl.x+Math.cos(a)*R,30,WORLD-30);
  let y=clamp(pl.y+Math.sin(a)*R,30,WORLD-30);
  if(Math.abs(x-pl.x)<VW*0.55&&Math.abs(y-pl.y)<VH*0.55){
    x=pl.x-Math.cos(a)*R; y=pl.y-Math.sin(a)*R;
    x=clamp(x,30,WORLD-30); y=clamp(y,30,WORLD-30);
  }
  return spawnEnemy(id,x,y,opts);
}
function damageEnemy(e,dmg,kx,ky){
  if(e.dead) return;
  dmg=Math.max(1,Math.round(dmg));
  e.hp-=dmg; e.flashT=0.12;
  e.kx+=(kx||0)*(e.boss?0.15:1); e.ky+=(ky||0)*(e.boss?0.15:1);
  addText(e.x+rnd(-8,8),e.y-e.r-8,''+dmg,'#ffffff');
  AudioSys.sfx('hit');
  if(e.hp<=0) killEnemy(e,true);
}
function killEnemy(e, drops){
  if(e.dead) return;
  e.dead=true; G.kills++;
  const col=e.boss?'#e04a4a':(e.elite?'#f0cf6e':'#b8383e');
  for(let i=0;i<(e.boss?40:e.elite?14:6);i++)
    addPart(e.x+rnd(-e.r,e.r),e.y-rnd(0,e.r*1.6),rnd(-90,90),rnd(-140,20),rnd(0.3,0.7),Math.random()<0.5?col:'#191622',rnd(2,4),false);
  if(drops){
    if(e.boss){
      G.pickups.push({type:'chest',x:e.x,y:e.y,t:0});
      G.pickups.push({type:'potion',x:e.x+30,y:e.y+10,t:0});
      for(let i=0;i<10;i++) G.pickups.push({type:'coin',v:2,x:e.x+rnd(-40,40),y:e.y+rnd(-40,40),t:0});
      AudioSys.sfx('chest'); G.cam.shake=10;
      showToast('头目被击败！','gold');
    } else if(e.elite){
      G.pickups.push({type:'chest',x:e.x,y:e.y,t:0});
      for(let i=0;i<4;i++) G.pickups.push({type:'coin',v:1,x:e.x+rnd(-24,24),y:e.y+rnd(-24,24),t:0});
    } else {
      G.gems.push(makeGem(e.x,e.y,Math.round(e.xp)));
      const L=G.P.luck;
      if(Math.random()<0.10*L) G.pickups.push({type:'coin',v:1,x:e.x+rnd(-8,8),y:e.y+rnd(-8,8),t:0});
      if(Math.random()<0.016*L) G.pickups.push({type:'potion',x:e.x,y:e.y,t:0});
      else if(Math.random()<0.002*L) G.pickups.push({type:'magnet',x:e.x,y:e.y,t:0});
    }
  }
  AudioSys.sfx('die');
}
function makeGem(x,y,v){
  return {x,y,v,t:rnd(TAU),attract:false,vx:0,vy:0};
}
function updateEnemies(dt){
  const pl=G.player;
  rebuildHash();
  for(const e of G.enemies){
    if(e.dead) continue;
    if(e.spawnT>0){ e.spawnT-=dt; continue; }
    e.animT+=dt; e.flashT=Math.max(0,e.flashT-dt);
    const def=ENEMIES[e.id];
    let dx=pl.x-e.x, dy=pl.y-e.y;
    const dist=Math.hypot(dx,dy)||1;
    dx/=dist; dy/=dist;
    let sp=e.spd;
    /* 行为修饰 */
    if(def.wobble){ const px=-dy,py=dx; const w=Math.sin(G.time*5+e.seed)*0.7; dx+=px*w; dy+=py*w; }
    if(def.zigzag){ e.phT-=dt; if(e.phT<=0){e.phT=0.7;e.phS*=-1;} const px=-dy,py=dx; dx+=px*0.8*e.phS; dy+=py*0.8*e.phS; }
    if(def.squash) sp*= 0.7+0.5*Math.abs(Math.sin(G.time*2+e.seed));
    /* 头目技能 / 暗影猎手冲刺 */
    if(e.boss||def.dash2){
      if(!e.enraged&&e.boss&&e.hp<e.maxhp*0.5){
        e.enraged=true; e.cdMul=0.62; e.spd=e.spd*1.3;
        addText(e.x,e.y-e.r-16,'狂暴！','#e04a4a');
        AudioSys.sfx('boss'); G.cam.shake=Math.max(G.cam.shake,6);
        for(let i=0;i<14;i++) addPart(e.x+rnd(-e.r,e.r),e.y-rnd(0,e.r*2),rnd(-80,80),rnd(-140,-30),0.6,'#e04a4a',3,true);
      }
      e.stT-=dt;
      const cdM=e.cdMul||1;
      if(def.dash||def.dash2){
        const dashCd=(def.dash2?3.2:5.5)*cdM;
        if(e.stMode===0 && e.stT<=0){ e.stMode=1; e.stT=0.7; }
        else if(e.stMode===1 && e.stT<=0){ e.stMode=2; e.stT=0.9; }
        else if(e.stMode===2 && e.stT<=0){ e.stMode=0; e.stT=dashCd; }
        if(e.stMode===1){ sp=0; if(Math.random()<0.4) addPart(e.x+rnd(-e.r,e.r),e.y-rnd(0,20),0,-50,0.3,'#e04a4a',3,true); }
        if(e.stMode===2){ sp=e.spd*3.6; }
      }
      if(def.slam && e.stT<=0){
        e.stT=4.5*cdM;
        for(let i=0;i<26;i++){ const a=i/26*TAU; addPart(e.x+Math.cos(a)*30,e.y+Math.sin(a)*30,Math.cos(a)*220,Math.sin(a)*220,0.5,'#b3ac9a',4,false); }
        G.cam.shake=Math.max(G.cam.shake,7);
        if(d2(e.x,e.y,pl.x,pl.y)<150*150) hurtPlayer(e.dmg*0.8);
      }
      if(def.summon && e.stT<=0){
        e.stT=6*cdM;
        for(let i=0;i<5;i++){ const a=rnd(TAU); spawnEnemy('bat',e.x+Math.cos(a)*50,e.y+Math.sin(a)*50); }
        addText(e.x,e.y-e.r-14,'召唤！','#d97098');
      }
    }
    e.x+=(dx*sp+e.kx)*dt;
    e.y+=(dy*sp+e.ky)*dt;
    e.kx*=Math.pow(0.001,dt); e.ky*=Math.pow(0.001,dt);
    e.x=clamp(e.x,16,WORLD-16); e.y=clamp(e.y,16,WORLD-16);
    /* 接触伤害 */
    const rr=e.r+pl.r;
    if(dist<rr && pl.iframes<=0 && state==='playing') hurtPlayer(e.dmg);
    /* 分离(轻量) */
    let sepN=0;
    const cx=Math.floor(e.x/CELL), cy=Math.floor(e.y/CELL);
    for(let ox=-1;ox<=1&&sepN<6;ox++)for(let oy=-1;oy<=1&&sepN<6;oy++){
      const arr=hash.get(hashKey(cx+ox,cy+oy)); if(!arr) continue;
      for(const o of arr){ if(o===e||o.dead) continue; sepN++;
        const ddx=e.x-o.x, ddy=e.y-o.y; const dd=ddx*ddx+ddy*ddy;
        const mr=(e.r+o.r)*0.75;
        if(dd<mr*mr&&dd>0.01){ const l=Math.sqrt(dd); const push=(mr-l)/l*0.5;
          e.x+=ddx*push; e.y+=ddy*push; }
        if(sepN>=6) break; }
    }
  }
  G.enemies=G.enemies.filter(e=>!e.dead);
  if(G.boss&&G.boss.dead) G.boss=null;
}

/* ============================================================
 * 导演（波次与事件）
 * ============================================================ */
function updateDirector(dt){
  const t=G.time;
  /* 常规刷怪 */
  G.spawnT-=dt;
  if(G.spawnT<=0){
    G.spawnT=clamp(1.15-t*0.00085,0.3,1.15);
    if(G.enemies.length<270){
      const batch=Math.min(5,1+Math.floor(t/150));
      const pool=ENEMY_POOL.filter(p=>t>=p.from);
      for(let i=0;i<batch;i++){
        const p=pick(pool);
        const elite=!G.boss&&Math.random()<Math.min(0.02+t*0.00002,0.06);
        spawnAtEdge(p.id,{elite});
      }
    }
  }
  /* 定时事件 */
  const pl=G.player;
  while(G.evIdx<EVENTS.length && t>=EVENTS[G.evIdx].t){
    const ev=EVENTS[G.evIdx++];
    showToast(ev.msg,'warn',2.6);
    if(ev.type==='ring'){
      const R=Math.max(VW,VH)*0.55;
      for(let i=0;i<ev.n;i++){ const a=i/ev.n*TAU;
        spawnEnemy(ev.e,clamp(pl.x+Math.cos(a)*R,30,WORLD-30),clamp(pl.y+Math.sin(a)*R,30,WORLD-30)); }
    } else if(ev.type==='wall'){
      const side=irnd(0,3);
      for(let i=0;i<ev.n;i++){
        const off=(i-ev.n/2)*36;
        let x,y;
        if(side===0){x=pl.x+off;y=pl.y-Math.max(VW,VH)*0.6;}
        else if(side===1){x=pl.x+off;y=pl.y+Math.max(VW,VH)*0.6;}
        else if(side===2){x=pl.x-Math.max(VW,VH)*0.6;y=pl.y+off;}
        else {x=pl.x+Math.max(VW,VH)*0.6;y=pl.y+off;}
        spawnEnemy(ev.e,clamp(x,30,WORLD-30),clamp(y,30,WORLD-30));
      }
    } else if(ev.type==='swarm'){
      for(let i=0;i<ev.n;i++) spawnAtEdge(ev.e,{elite:ev.elite&&i<ev.elite});
    } else if(ev.type==='chestrain'){
      for(let i=0;i<2;i++){ const a=rnd(TAU), r=rnd(120,240);
        G.pickups.push({type:'chest',x:clamp(G.player.x+Math.cos(a)*r,40,WORLD-40),y:clamp(G.player.y+Math.sin(a)*r,40,WORLD-40),t:0}); }
    } else if(ev.type==='hunters'){
      for(let i=0;i<ev.n;i++) spawnAtEdge('hunter',{});
    } else if(ev.type==='heal'){
      for(let i=0;i<3;i++){ const a=rnd(TAU), r=rnd(60,200);
        G.zones.push({x:clamp(G.player.x+Math.cos(a)*r,40,WORLD-40),y:clamp(G.player.y+Math.sin(a)*r,40,WORLD-40),r:72,dur:7,t:0,tick:0,dmg:0,kind:'heal',uid:uidC++}); }
    } else if(ev.type==='firewall'){
      const vert=Math.random()<0.5;
      const near=Math.random()<0.5?-540:540;
      for(let i=-6;i<=6;i++){
        const off=i*62;
        let x,y;
        if(vert){ x=G.player.x+off; y=G.player.y+near; }
        else{ x=G.player.x+near; y=G.player.y+off; }
        G.zones.push({x:clamp(x,40,WORLD-40),y:clamp(y,40,WORLD-40),r:52,dur:5,t:0,tick:0,dmg:12,kind:'fire',uid:uidC++});
      }
    } else if(ev.type==='boss'){
      spawnAtEdge(ev.e);
    }
  }
  /* 胜利判定 */
  if(t>=GAME_LEN && state==='playing'){
    state='winning'; G.winT=2.8; AudioSys.sfx('win');
  }
}

/* ============================================================
 * 经验 / 升级
 * ============================================================ */
function xpNeed(l){ return Math.floor(5+(l-1)*7+Math.pow(l-1,1.9)*1.6); }
function gainXp(v){
  G.xp+=v*G.P.growth;
  while(G.xp>=xpNeed(G.level)){ G.xp-=xpNeed(G.level); G.level++; G.luQueue++; }
  if(G.luQueue>0&&state==='playing') openLevelUp();
}
function buildChoices(){
  const pool=[];
  const wSlots=G.weapons.length>=4, pSlots=Object.keys(G.passives).length>=4;
  for(const w of G.weapons){
    const def=WEAPONS[w.id];
    if(w.lv<def.maxLv) pool.push({kind:'wu',id:w.id,lv:w.lv+1,wt:28});
  }
  if(!wSlots) for(const id in WEAPONS){
    if(!G.weapons.some(w=>w.id===id)) pool.push({kind:'wn',id,lv:1,wt:G.level<=3?42:20});
  }
  for(const id in G.passives){
    const def=PASSIVES[id];
    if(G.passives[id]<def.maxLv) pool.push({kind:'pu',id,lv:G.passives[id]+1,wt:22});
  }
  if(!pSlots) for(const id in PASSIVES){
    if(!(id in G.passives)) pool.push({kind:'pn',id,lv:1,wt:15});
  }
  const out=[];
  for(let i=0;i<3&&pool.length;i++){
    let tot=0; for(const c of pool) tot+=c.wt;
    let r=rnd(tot), idx=0;
    for(let j=0;j<pool.length;j++){ r-=pool[j].wt; if(r<=0){idx=j;break;} }
    out.push(pool.splice(idx,1)[0]);
  }
  if(!out.length) out.push({kind:'heal'});
  return out;
}
function openLevelUp(){
  state='levelup';
  AudioSys.sfx('level');
  for(let i=0;i<20;i++) addPart(G.player.x+rnd(-20,20),G.player.y-rnd(0,30),rnd(-60,60),rnd(-120,-30),0.8,'#f0cf6e',3,true);
  const cs=buildChoices();
  const box=document.getElementById('lucards');
  box.innerHTML='';
  for(const c of cs){
    const el=document.createElement('div');
    el.className='lucard';
    let name,tag,desc,icon;
    if(c.kind==='heal'){ name='烤鸡'; tag='回复'; desc='回复 40 点生命。'; icon='ic_heart'; }
    else if(c.kind==='wu'||c.kind==='wn'){
      const def=WEAPONS[c.id];
      name=def.name; icon=def.icon;
      tag=c.kind==='wn'?'新武器！':'Lv '+c.lv;
      desc=c.kind==='wn'?(def.tip||''):(def.tips[c.lv-1]||def.tip);
    } else {
      const def=PASSIVES[c.id];
      name=def.name; icon=def.icon;
      tag=c.kind==='pn'?'新道具！':'Lv '+c.lv;
      desc=def.tip;
    }
    el.innerHTML=`<div class="lname">${name}</div><div class="ltag">${tag}</div><div class="ldesc">${desc}</div><div class="lvlrow"></div>`;
    const cvs=document.createElement('canvas');
    const spr=SPR[icon];
    cvs.width=spr.w; cvs.height=spr.h;
    cvs.getContext('2d').drawImage(spr.frames[0],0,0);
    el.insertBefore(cvs,el.firstChild);
    const row=el.querySelector('.lvlrow');
    const max=c.kind==='wu'?WEAPONS[c.id].maxLv:c.kind==='pu'?PASSIVES[c.id].maxLv:0;
    if(max){
      for(let i=0;i<max;i++){ const s=document.createElement('div'); s.className='pip'+(i<c.lv?' on':''); row.appendChild(s); }
    }
    el.onclick=()=>{ applyChoice(c); };
    box.appendChild(el);
  }
  showScreen('levelup');
}
function applyChoice(c){
  AudioSys.sfx('click');
  if(c.kind==='heal'){ G.player.hp=Math.min(G.P.maxhp,G.player.hp+40); }
  else if(c.kind==='wu'){ const w=G.weapons.find(w=>w.id===c.id); w.lv=c.lv; }
  else if(c.kind==='wn'){ G.weapons.push({id:c.id,lv:1,t:0.3,pulse:0,active:null}); }
  else if(c.kind==='pu'||c.kind==='pn'){ G.passives[c.id]=c.lv; recalcStats(); }
  G.luQueue--;
  if(G.luQueue>0){ openLevelUp(); return; }
  showScreen(null);
  state='playing';
  G.player.iframes=Math.max(G.player.iframes,0.8);
}
/* 宝箱奖励 */
function grantChest(){
  AudioSys.sfx('chest');
  /* 优先：可进化的武器（武器满级 + 指定被动满级） */
  const evoCand=G.weapons.find(w=>{
    const def=WEAPONS[w.id];
    if(w.evolved||w.lv<def.maxLv||!def.evo) return false;
    const p=PASSIVES[def.evo.passive];
    return p&&(G.passives[def.evo.passive]||0)>=p.maxLv;
  });
  if(evoCand){
    evoCand.evolved=true;
    const def=WEAPONS[evoCand.id];
    showToast(`✦ 武器进化！${def.name} → ${def.evo.name} ✦`,'gold',4.5);
    AudioSys.sfx('win');
    G.cam.shake=8;
    for(let i=0;i<40;i++) addPart(G.player.x+rnd(-30,30),G.player.y-rnd(0,50),rnd(-100,100),rnd(-220,-60),rnd(0.8,1.4),'#f0cf6e',rnd(2,4),true);
    return;
  }
  const cands=G.weapons.filter(w=>w.lv<WEAPONS[w.id].maxLv);
  if(cands.length&&Math.random()<0.8){
    const w=pick(cands);
    const n=Math.min(WEAPONS[w.id].maxLv-w.lv, irnd(1,3));
    w.lv+=n;
    showToast(`宝箱：${WEAPONS[w.id].name} 提升到 Lv${w.lv}！`,'gold',3);
  } else if(G.weapons.length<4){
    const unowned=Object.keys(WEAPONS).filter(id=>!G.weapons.some(w=>w.id===id));
    if(unowned.length){ const id=pick(unowned); G.weapons.push({id,lv:1,t:0.3,pulse:0,active:null}); showToast('宝箱：获得 '+WEAPONS[id].name+'！','gold',3); }
    else { G.player.hp=Math.min(G.P.maxhp,G.player.hp+50); showToast('宝箱：生命完全回复！','gold',3); }
  } else {
    G.player.hp=Math.min(G.P.maxhp,G.player.hp+50);
    showToast('宝箱：生命回复 50！','gold',3);
  }
  for(let i=0;i<24;i++) addPart(G.player.x+rnd(-20,20),G.player.y-rnd(0,40),rnd(-80,80),rnd(-160,-40),1,'#f0cf6e',3,true);
}

/* ============================================================
 * 玩家
 * ============================================================ */
function hurtPlayer(raw){
  if(G.god) return;
  const dmg=Math.max(1,Math.round(raw-G.P.armor));
  G.player.hp-=dmg;
  G.player.iframes=0.8; G.player.hurtF=0.55;
  G.hitstop=0.09;
  G.cam.shake=Math.max(G.cam.shake,5);
  addText(G.player.x,G.player.y-30,'-'+dmg,'#e04a4a');
  AudioSys.sfx('hurt');
  if(G.player.hp<=0){ G.player.hp=0; startDying(); }
}
function startDying(){
  state='dying'; G.dieT=1.5; AudioSys.sfx('lose');
  AudioSys.play('menu');
}
/* 自动走位 AI（测试台/菜单演示用）：逃离敌人压力 + 安全时拾取宝石 + 边界回避 */
function aiAxes(){
  const pl=G.player;
  let sx=0, sy=0;
  for(const e of G.enemies){
    if(e.dead||e.spawnT>0) continue;
    const dx=pl.x-e.x, dy=pl.y-e.y;
    const dd=dx*dx+dy*dy;
    if(dd>300*300) continue;
    const w=1/Math.max(600,dd);
    sx+=dx*w; sy+=dy*w;
  }
  let gx=0, gy=0, best=1e18;
  for(const g of G.gems){
    const dx=g.x-pl.x, dy=g.y-pl.y;
    const dd=dx*dx+dy*dy;
    if(dd<best&&dd<200*200){ best=dd; gx=dx; gy=dy; }
  }
  let ax=sx*2.2+(best<1e18?gx*0.0006:0);
  let ay=sy*2.2+(best<1e18?gy*0.0006:0);
  /* 远离世界边界 */
  const M=220;
  if(pl.x<M) ax+=0.8; if(pl.x>WORLD-M) ax-=0.8;
  if(pl.y<M) ay+=0.8; if(pl.y>WORLD-M) ay-=0.8;
  const l=Math.hypot(ax,ay);
  if(l<0.04){ ax=Math.cos(G.time*0.6); ay=Math.sin(G.time*0.6); }
  else{ ax/=l; ay/=l; }
  return [ax,ay];
}
function updatePlayer(dt){
  const pl=G.player;
  let ax,ay;
  if(G.ai){ [ax,ay]=aiAxes(); }
  else{ ax=axisX(); ay=axisY(); }
  if(ax||ay){
    const l=Math.hypot(ax,ay);
    if(l>0){ ax/=l; ay/=l; }
    pl.x+=ax*G.P.speed*dt; pl.y+=ay*G.P.speed*dt;
    pl.walkT+=dt;
    pl.moving=true;
    if(ax!==0) pl.face=ax>0?1:-1;
    pl.faceA=Math.atan2(ay,ax);
  } else pl.moving=false;
  pl.x=clamp(pl.x,20,WORLD-20); pl.y=clamp(pl.y,20,WORLD-20);
  pl.iframes=Math.max(0,pl.iframes-dt);
  pl.hurtF=Math.max(0,pl.hurtF-dt);
  if(G.P.regen>0) pl.hp=Math.min(G.P.maxhp,pl.hp+G.P.regen*dt);
}

/* ============================================================
 * 拾取物与宝石
 * ============================================================ */
function updatePickups(dt){
  const pl=G.player;
  for(const g of G.gems){
    g.t+=dt;
    const dd=d2(g.x,g.y,pl.x,pl.y);
    if(!g.attract&&dd<G.P.magnet*G.P.magnet) g.attract=true;
    if(g.attract){
      const a=Math.atan2(pl.y-g.y,pl.x-g.x);
      const sp=Math.min(700,(g.sp||120)+1400*dt);
      g.sp=sp;
      g.x+=Math.cos(a)*sp*dt; g.y+=Math.sin(a)*sp*dt;
      if(dd<18*18){ g.dead=true; hudGems++; AudioSys.sfx('gem'); gainXp(g.v); }
    }
  }
  G.gems=G.gems.filter(g=>!g.dead);
  if(G.gems.length>350){
    const absorb=G.gems.splice(0,G.gems.length-350);
    for(const a of absorb){ const t=pick(G.gems); t.v+=a.v; }
  }
  for(const p of G.pickups){
    p.t=(p.t||0)+dt;
    if(p.type==='coin'){
      const dd=d2(p.x,p.y,pl.x,pl.y);
      if(!p.attract&&dd<G.P.magnet*G.P.magnet*1.3) p.attract=true;
      if(p.attract){
        const a=Math.atan2(pl.y-p.y,pl.x-p.x);
        p.x+=Math.cos(a)*520*dt; p.y+=Math.sin(a)*520*dt;
        if(dd<20*20){ p.dead=true; G.gold+=p.v||1; AudioSys.sfx('gem'); }
      }
      continue;
    }
    if(d2(p.x,p.y,pl.x,pl.y)<26*26){
      p.dead=true;
      if(p.type==='chest') grantChest();
      else if(p.type==='potion'){ pl.hp=Math.min(G.P.maxhp,pl.hp+30); AudioSys.sfx('heal'); addText(pl.x,pl.y-34,'+30','#78a75f'); }
      else if(p.type==='magnet'){ for(const g of G.gems) g.attract=true; AudioSys.sfx('magnet'); showToast('磁石！全部宝石被吸来','gold'); }
    }
  }
  G.pickups=G.pickups.filter(p=>!p.dead);
}

/* ============================================================
 * 粒子与飘字
 * ============================================================ */
function addPart(x,y,vx,vy,life,col,size,add){
  if(G.parts.length>420) G.parts.shift();
  G.parts.push({x,y,vx,vy,life,dur:life,col,size,add});
}
function addText(x,y,txt,col){
  if(G.texts.length>60) G.texts.shift();
  G.texts.push({x,y,txt,col,t:0,dur:0.7});
}
function updateFx(dt){
  for(const p of G.parts){ p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=(p.add?60:220)*dt; p.vx*=Math.pow(0.3,dt); }
  G.parts=G.parts.filter(p=>p.life>0);
  for(const t of G.texts){ t.t+=dt; t.y-=36*dt; }
  G.texts=G.texts.filter(t=>t.t<t.dur);
}

/* ============================================================
 * 世界装饰
 * ============================================================ */
function genDecor(){
  G.decor=[];
  const types=[['grassA',0.42],['flowerA',0.12],['rockA',0.14],['graveA',0.10],['treeA',0.12],['bonesA',0.10]];
  for(let i=0;i<430;i++){
    let r=Math.random(), acc=0, type=types[0][0];
    for(const [t,w] of types){ acc+=w; if(r<=acc){type=t;break;} }
    let x=rnd(60,WORLD-60), y=rnd(60,WORLD-60);
    if(d2(x,y,WORLD/2,WORLD/2)<260*260){ i--; continue; }
    G.decor.push({type,x,y,s:rnd(0.8,1.35),flip:Math.random()<0.5});
  }
  /* 世界边缘装饰带：墓碑与枯树 */
  const estep=125;
  for(let x=80;x<WORLD-80;x+=estep){
    const v=((x/estep)|0)%2;
    G.decor.push({type:v?'graveA':'treeA',x:x+rnd(-22,22),y:62+rnd(0,26),s:rnd(0.9,1.2),flip:Math.random()<0.5});
    G.decor.push({type:v?'treeA':'graveA',x:x+rnd(-22,22),y:WORLD-62-rnd(0,26),s:rnd(0.9,1.2),flip:Math.random()<0.5});
  }
  for(let y=200;y<WORLD-200;y+=estep){
    const v=((y/estep)|0)%2;
    G.decor.push({type:v?'graveA':'treeA',x:62+rnd(0,26),y:y+rnd(-22,22),s:rnd(0.9,1.2),flip:Math.random()<0.5});
    G.decor.push({type:v?'treeA':'graveA',x:WORLD-62-rnd(0,26),y:y+rnd(-22,22),s:rnd(0.9,1.2),flip:Math.random()<0.5});
  }
}

/* ============================================================
 * 主循环
 * ============================================================ */
let lastT=0, acc=0, fps=0, fpsC=0, fpsT=0;
const DT=1/60;
function frame(now){
  requestAnimationFrame(frame);
  now/=1000;
  if(!lastT) lastT=now;
  let d=Math.min(now-lastT,0.12);
  lastT=now;
  fpsC++; if(now-fpsT>0.5){ fps=fpsC/(now-fpsT); fpsC=0; fpsT=now; }
  acc+=d;
  let guard=0;
  while(acc>=DT&&guard++<6){ step(DT); acc-=DT; }
  render();
}
function step(dt){
  if(!G) { menuT+=dt; updateMenuBats(dt); return; }
  /* 主菜单演示对局：AI 自动游玩作为背景 */
  if(G.demo){
    const ts=dt*G.timeScale;
    G.time+=ts;
    if(G.time>520){ G.time=130; G.enemies.length=0; G.projs.length=0; G.gems.length=0; G.pickups.length=0; G.zones.length=0; G.texts.length=0; }
    updatePlayer(ts); updateDirector(ts); updateWeapons(ts); updateProjs(ts); updateEnemies(ts); updatePickups(ts); updateFx(ts);
    G.cam.x=lerp(G.cam.x,G.player.x,1-Math.pow(0.001,dt));
    G.cam.y=lerp(G.cam.y,G.player.y,1-Math.pow(0.001,dt));
    G.cam.shake=Math.max(0,G.cam.shake-dt*22);
    return;
  }
  let ts=(state==='dying')?dt*0.3:(state==='winning')?dt:dt*G.timeScale;
  if(G.hitstop>0&&state==='playing'){ G.hitstop-=dt; ts*=0.12; }
  if(state==='playing'||state==='dying'||state==='winning'){
    if(state!=='winning') G.time+=ts;
    AudioSys.intensity=G.time>600?2:(G.time>300?1:0);
    updatePlayer(ts);
    if(state==='playing') updateDirector(ts);
    if(state==='winning') updateWinning(dt);
    updateWeapons(ts);
    updateProjs(ts);
    updateEnemies(ts);
    updatePickups(ts);
    updateFx(ts);
    /* 摄像机 */
    const pl=G.player;
    G.cam.x=lerp(G.cam.x,pl.x,1-Math.pow(0.001,dt));
    G.cam.y=lerp(G.cam.y,pl.y,1-Math.pow(0.001,dt));
    G.cam.shake=Math.max(0,G.cam.shake-dt*22);
    if(state==='dying'){
      G.dieT-=dt;
      if(Math.random()<0.3) addPart(pl.x+rnd(-10,10),pl.y-rnd(0,24),rnd(-40,40),rnd(-90,-20),0.6,'#b8383e',3,false);
      if(G.dieT<=0) finishDeath();
    }
  } else if(state==='levelup'||state==='paused'){
    updateFx(dt*0.2);
  }
}
function updateWinning(dt){
  G.winT-=dt;
  const pl=G.player;
  for(const e of G.enemies){
    if(!e.dead&&Math.random()<dt*4){
      for(let i=0;i<8;i++) addPart(e.x+rnd(-e.r,e.r),e.y-rnd(0,e.r),rnd(-30,30),rnd(-150,-60),0.7,'#f0cf6e',3,true);
      killEnemy(e,false);
    }
  }
  if(Math.random()<0.6) addPart(pl.x+rnd(-200,200),pl.y-rnd(60,320),0,120,1.2,'#f7e9b0',3,true);
  if(G.winT<=0) finishWin();
}
function finishDeath(){
  state='dead';
  saveBest(false);
  showStats('deadstats','你被黑暗吞没了');
  document.getElementById('deadnew').classList.toggle('hidden',!G.newBest);
  showScreen('dead');
}
function finishWin(){
  state='win';
  saveBest(true);
  showStats('winstats','黎明降临');
  document.getElementById('winnew').classList.toggle('hidden',!G.newBest);
  showScreen('win');
}
function bankRun(){ if(G&&!G.banked&&G.gold>0){ addBank(G.gold); G.banked=true; } }
function saveBest(win){
  bankRun();
  try{
    const prev=JSON.parse(localStorage.getItem('bms_best')||'null');
    const cur={time:Math.floor(G.time),kills:G.kills,level:G.level,win};
    let isNew=false;
    if(!prev||cur.time>prev.time||(cur.time===prev.time&&cur.kills>prev.kills)){ isNew=true; localStorage.setItem('bms_best',JSON.stringify(cur)); }
    G.newBest=isNew;
  }catch(e){}
  G.newBest=false;
}
function showStats(elId,title){
  const el=document.getElementById(elId);
  const m=Math.floor(G.time/60), s=Math.floor(G.time%60);
  el.innerHTML=
    `<div class="k">存活时间</div><div class="v gold">${m}:${String(s).padStart(2,'0')}</div>`+
    `<div class="k">击杀</div><div class="v">${G.kills}</div>`+
    `<div class="k">等级</div><div class="v">${G.level}</div>`+
    `<div class="k">宝石</div><div class="v">${hudGems}</div>`+
    `<div class="k">金币</div><div class="v gold">🪙 ${G.gold}（已存入银行）</div>`+
    `<div class="k">最佳纪录</div><div class="v">${bestStatLine()}</div>`;
}

/* ============================================================
 * 渲染
 * ============================================================ */
let vignette=null;
function buildVignette(){
  vignette=_mkcv(Math.max(2,VW),Math.max(2,VH));
  const g=vignette.getContext('2d');
  const gr=g.createRadialGradient(VW/2,VH/2,Math.min(VW,VH)*0.36,VW/2,VH/2,Math.max(VW,VH)*0.72);
  gr.addColorStop(0,'rgba(0,0,0,0)');
  gr.addColorStop(1,'rgba(5,2,10,0.55)');
  g.fillStyle=gr; g.fillRect(0,0,VW,VH);
}
let groundPat=null;
function buildGround(){
  const t=_mkcv(140,140), g=t.getContext('2d');
  g.fillStyle='#222b1f'; g.fillRect(0,0,140,140);
  /* 大块明暗斑 */
  for(let i=0;i<7;i++){
    g.fillStyle=Math.random()<0.5?'rgba(44,56,40,0.5)':'rgba(24,30,21,0.5)';
    g.beginPath();
    g.ellipse(Math.random()*140,Math.random()*140,rnd(14,30),rnd(9,20),rnd(TAU),0,TAU);
    g.fill();
  }
  for(let i=0;i<150;i++){
    g.fillStyle=Math.random()<0.5?'#2b3626':'#1b2318';
    g.fillRect((Math.random()*140)|0,(Math.random()*140)|0,3,3);
  }
  for(let i=0;i<40;i++){
    g.fillStyle='#2e3a24';
    g.fillRect((Math.random()*136)|0,(Math.random()*136)|0,2,2);
  }
  groundPat=ctx.createPattern(t,'repeat');
}
function render(){
  if(!ctx) return;
  if(!groundPat) buildGround();
  ctx.fillStyle='#060409';
  ctx.fillRect(0,0,VW,VH);
  if(!G||state==='charsel'||(state==='menu'&&!G.demo)){ renderMenu(); return; }

  const camX=G.cam.x-VW/2+(G.cam.shake?rnd(-G.cam.shake,G.cam.shake):0);
  const camY=G.cam.y-VH/2+(G.cam.shake?rnd(-G.cam.shake,G.cam.shake):0);
  ctx.save();
  ctx.translate(-camX,-camY);
  /* 地面 */
  ctx.fillStyle=groundPat;
  ctx.fillRect(0,0,WORLD,WORLD);
  /* 世界边界 */
  ctx.fillStyle='#0d0a14';
  const bw=46;
  ctx.fillRect(-bw,-bw,WORLD+2*bw,bw); ctx.fillRect(-bw,WORLD,WORLD+2*bw,bw);
  ctx.fillRect(-bw,0,bw,WORLD); ctx.fillRect(WORLD,0,bw,WORLD);
  ctx.strokeStyle='#241f31'; ctx.lineWidth=6; ctx.strokeRect(0,0,WORLD,WORLD);

  const vx0=camX-60,vy0=camY-60,vx1=camX+VW+60,vy1=camY+VH+60;
  /* 圣蒜光环(底层) */
  for(const w of G.weapons){
    if(w.id==='garlic'){
      const s=weaponStats(w);
      const pl=G.player;
      const rr=s.radius*(1+0.03*Math.sin(G.time*4)+(w.pulse?0.08*w.pulse:0));
      ctx.beginPath(); ctx.arc(pl.x,pl.y,rr,0,TAU);
      ctx.fillStyle='rgba(240,207,110,0.10)'; ctx.fill();
      ctx.strokeStyle='rgba(240,207,110,0.35)'; ctx.lineWidth=2; ctx.stroke();
    }
  }
  /* 燃烧地带 */
  for(const z of G.zones){
    const a=clamp(1-(z.t/z.dur),0,1);
    const fill=z.kind==='poison'?'122,167,95':z.kind==='heal'?'240,207,110':z.kind==='vortex'?'123,74,140':'207,114,34';
    const edge=z.kind==='poison'?'168,201,127':z.kind==='heal'?'247,233,176':z.kind==='vortex'?'160,107,181':'235,154,74';
    ctx.beginPath();
    const vr=z.kind==='vortex'? z.r*(0.55+0.1*Math.sin(z.t*9)) : z.r*(0.6+0.4*Math.min(1,z.t*4));
    ctx.arc(z.x,z.y,vr,0,TAU);
    ctx.fillStyle=`rgba(${fill},${0.22*a})`; ctx.fill();
    ctx.strokeStyle=`rgba(${edge},${0.5*a})`; ctx.lineWidth=2; ctx.stroke();
    if(z.kind==='vortex'){
      ctx.strokeStyle=`rgba(160,107,181,${0.35*a})`; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(z.x,z.y,vr*0.55,z.t*7,z.t*7+4.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(z.x,z.y,vr*0.3,-z.t*9,-z.t*9+3.6); ctx.stroke();
    }
  }
  /* 宝石 */
  for(const g of G.gems){
    if(g.x<vx0||g.x>vx1||g.y<vy0||g.y>vy1) continue;
    const spr=g.v<4?SPR.gem1:g.v<10?SPR.gem2:SPR.gem3;
    const bob=Math.sin(G.time*4+g.t)*2;
    ctx.save(); ctx.translate(g.x,g.y+bob);
    const s=0.8+0.2*Math.sin(G.time*6+g.t);
    ctx.scale(s,s);
    ctx.drawImage(spr.frames[0],-spr.w/2,-spr.h/2);
    ctx.restore();
  }
  /* 拾取物 */
  for(const p of G.pickups){
    if(p.x<vx0||p.x>vx1||p.y<vy0||p.y>vy1) continue;
    const bob=Math.sin(G.time*3+p.t)*3;
    if(p.type==='chest'){
      ctx.save(); ctx.translate(p.x,p.y+bob);
      const s=1+0.06*Math.sin(G.time*5);
      ctx.scale(s,s); ctx.drawImage(SPR.chestA.frames[0],-SPR.chestA.w/2,-SPR.chestA.h);
      ctx.restore();
      if(Math.random()<0.15) addPart(p.x+rnd(-10,10),p.y-20,0,-50,0.5,'#f0cf6e',2,true);
    }
    else if(p.type==='coin'){
      ctx.save(); ctx.translate(p.x,p.y+bob*0.6);
      const sq=0.75+0.25*Math.abs(Math.sin(G.time*4+p.t));
      ctx.scale(sq,1);
      ctx.drawImage(SPR.coinA.frames[0],-SPR.coinA.w/2,-SPR.coinA.h/2);
      ctx.restore();
    }
    else if(p.type==='potion') drawSpr(SPR.potionA,p.x,p.y+bob,{});
    else if(p.type==='magnet') drawSpr(SPR.magnetA,p.x,p.y+bob,{});
  }
  /* 阴影 */
  ctx.fillStyle='rgba(0,0,0,0.28)';
  for(const d of G.decor){ if(d.x<vx0||d.x>vx1||d.y<vy0||d.y>vy1) continue;
    if(d.type==='treeA'||d.type==='graveA'||d.type==='rockA'){ ctx.beginPath(); ctx.ellipse(d.x,d.y+2,14*d.s,5*d.s,0,0,TAU); ctx.fill(); } }
  for(const e of G.enemies){ if(e.dead||e.x<vx0||e.x>vx1||e.y<vy0||e.y>vy1) continue;
    ctx.beginPath(); ctx.ellipse(e.x,e.y+2,e.r*0.9,e.r*0.34,0,0,TAU); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(G.player.x,G.player.y+2,12,4.5,0,0,TAU); ctx.fill();

  /* y 排序绘制 */
  const draws=[];
  for(const d of G.decor){ if(d.x<vx0||d.x>vx1||d.y<vy0||d.y>vy1) continue; draws.push({y:d.y,f:()=>drawSpr(SPR[d.type],d.x,d.y,{scale:d.s,flip:d.flip})}); }
  for(const e of G.enemies){ if(e.dead||e.x<vx0||e.x>vx1||e.y<vy0||e.y>vy1) continue; draws.push({y:e.y,f:()=>drawEnemy(e)}); }
  draws.push({y:G.player.y,f:drawPlayer});
  draws.sort((a,b)=>a.y-b.y);
  for(const d of draws) d.f();

  /* 投射物 */
  for(const p of G.projs){
    if(p.spr){ drawSpr(SPR[p.spr],p.x,p.y,{f:0,scale:p.size||1});
      if(p.spin){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.ang||0); ctx.drawImage(SPR[p.spr].frames[0],-SPR[p.spr].w/2,-SPR[p.spr].h/2); ctx.restore(); }
    } else {
      ctx.save(); ctx.translate(p.x,p.y);
      ctx.fillStyle=p.magic?'#9ecbff':'#f2ede4';
      ctx.shadowColor=p.magic?'#56c8d8':'#fff'; ctx.shadowBlur=8;
      ctx.fillRect(-4,-4,8,8);
      ctx.restore();
    }
  }
  /* 圣书环绕 */
  for(const w of G.weapons){
    if(w.id==='bible'&&w.active){
      const a=w.active;
      for(let i=0;i<a.n;i++){
        const ang=a.ang+i*TAU/a.n;
        const ox=G.player.x+Math.cos(ang)*a.radius, oy=G.player.y+Math.sin(ang)*a.radius;
        ctx.save(); ctx.translate(ox,oy-8); ctx.rotate(Math.sin(G.time*8+i)*0.3);
        ctx.drawImage(SPR.ic_bible.frames[0],-SPR.ic_bible.w/2,-SPR.ic_bible.h/2);
        ctx.restore();
      }
    }
  }
  /* 鞭痕：扇形月牙光效 */
  for(const s of G.slashes){
    const a=1-s.t/s.dur;
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.ang);
    const r1=s.range*0.45;
    const grad=ctx.createRadialGradient(0,0,r1,0,0,s.range);
    grad.addColorStop(0,'rgba(240,230,228,0)');
    grad.addColorStop(0.72,`rgba(242,237,228,${0.5*a})`);
    grad.addColorStop(1,`rgba(224,74,74,${0.75*a})`);
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.arc(0,0,s.range,-0.85,0.85);
    ctx.arc(0,0,r1,0.85,-0.85,true);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=`rgba(255,246,232,${0.85*a})`;
    ctx.lineWidth=2.5*a+1;
    ctx.beginPath(); ctx.arc(0,0,s.range,-0.8,0.8); ctx.stroke();
    ctx.restore();
  }
  /* 闪电 */
  for(const b of G.bolts){
    const a=1-b.t/b.dur;
    ctx.save(); ctx.globalAlpha=a;
    ctx.strokeStyle='#f7e9b0'; ctx.lineWidth=3; ctx.shadowColor='#f0cf6e'; ctx.shadowBlur=12;
    ctx.beginPath();
    let x=b.x,y=b.y-300;
    ctx.moveTo(x,y);
    for(let i=0;i<6;i++){ x=b.x+Math.sin(b.seed*9+i*2.7)*(26-i*3); y=b.y-300+(i+1)*50; ctx.lineTo(x,y); }
    ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.restore();
  }
  /* 粒子 */
  for(const p of G.parts){
    const a=clamp(p.life/p.dur,0,1);
    if(p.add){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=a; ctx.fillStyle=p.col;
      ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size); ctx.restore(); }
    else{ ctx.globalAlpha=a; ctx.fillStyle=p.col; ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size); }
  }
  ctx.globalAlpha=1;
  /* 飘字 */
  ctx.font='bold 13px Consolas,monospace'; ctx.textAlign='center';
  for(const t of G.texts){
    const a=1-t.t/t.dur;
    ctx.globalAlpha=a;
    ctx.fillStyle='#000'; ctx.fillText(t.txt,t.x+1,t.y+1);
    ctx.fillStyle=t.col; ctx.fillText(t.txt,t.x,t.y);
  }
  ctx.globalAlpha=1;
  ctx.restore();

  /* 状态叠加 */
  ctx.drawImage(vignette,0,0);
  if(G.demo){
    /* 演示模式：轻微暗化做菜单背景 */
    ctx.fillStyle='rgba(8,6,14,0.18)'; ctx.fillRect(0,0,VW,VH);
    return;
  }
  if(G.player.hurtF>0){ ctx.fillStyle=`rgba(184,56,62,${0.42*G.player.hurtF/0.55})`; ctx.fillRect(0,0,VW,VH); }
  if(state==='dying'){ ctx.fillStyle=`rgba(60,4,10,${0.35+0.2*Math.sin(G.time*10)})`; ctx.fillRect(0,0,VW,VH); }
  if(state==='winning'||state==='win'){
    const a=state==='win'?0.5:0.35*(2.8-G.winT)/2.8;
    const gr=ctx.createLinearGradient(0,0,0,VH);
    gr.addColorStop(0,`rgba(255,236,170,${0.55*a})`); gr.addColorStop(1,'rgba(255,236,170,0)');
    ctx.fillStyle=gr; ctx.fillRect(0,0,VW,VH);
  }
  drawHUD();
}
function drawEnemy(e){
  const def=ENEMIES[e.id];
  const spr=SPR[def.spr];
  const f=Math.floor(e.animT*def.anim)%spr.frames.length;
  let sc=(def.size||1)*(e.elite?1.45:1);
  if(e.enraged){
    ctx.save(); ctx.globalAlpha=0.28+0.09*Math.sin(G.time*9);
    ctx.fillStyle='#e04a4a';
    ctx.beginPath(); ctx.ellipse(e.x,e.y,e.r*1.6*sc,e.r*0.85*sc,0,0,TAU); ctx.fill();
    ctx.restore();
  }
  const alpha=e.spawnT>0?clamp(1-e.spawnT/0.6,0.2,1):(def.ghost?0.78+0.14*Math.sin(G.time*3+e.seed):1);
  if(e.flashT>0) drawSpr(spr,e.x,e.y,{f,white:true,scale:sc,alpha});
  else drawSpr(spr,e.x,e.y,{f,scale:sc,alpha,flip:(G.player.x<e.x)});
  if(e.elite||e.boss){
    const w=e.r*2, hp=Math.max(0,e.hp/e.maxhp);
    ctx.fillStyle='#191622'; ctx.fillRect(e.x-w/2,e.y-e.r*sc-12,w,5);
    ctx.fillStyle=e.boss?'#e04a4a':'#d9a934'; ctx.fillRect(e.x-w/2+1,e.y-e.r*sc-11,(w-2)*hp,3);
  }
}
function drawPlayer(){
  const pl=G.player;
  if(pl.iframes>0&&Math.floor(G.time*18)%2===0&&state==='playing') return;
  const spr=SPR.heroA;
  const moving=pl.moving;
  const f=moving?Math.floor(pl.walkT*8)%2:0;
  if(pl.hurtF>0.2) drawSpr(spr,pl.x,pl.y,{f,white:true});
  else drawSpr(spr,pl.x,pl.y,{f,flip:pl.face<0});
}
/* ---------- 菜单场景 ---------- */
function updateMenuBats(dt){
  if(MBATS.length<14&&Math.random()<0.05)
    MBATS.push({x:rnd(VW),y:rnd(VH),vx:rnd(-40,40),vy:rnd(-24,24),t:rnd(10)});
  for(const b of MBATS){ b.x+=b.vx*dt; b.y+=b.vy*dt; b.t+=dt;
    if(b.x<-30)b.x=VW+20; if(b.x>VW+30)b.x=-20; if(b.y<-30)b.y=VH+20; if(b.y>VH+30)b.y=-20; }
}
function renderMenu(){
  menuT+=0;
  const gr=ctx.createLinearGradient(0,0,0,VH);
  gr.addColorStop(0,'#140f22'); gr.addColorStop(0.6,'#1d1226'); gr.addColorStop(1,'#0b0714');
  ctx.fillStyle=gr; ctx.fillRect(0,0,VW,VH);
  /* 血月 */
  const mx=VW*0.76,my=VH*0.28,mr=Math.min(VW,VH)*0.16;
  const mg=ctx.createRadialGradient(mx,my,mr*0.3,mx,my,mr*2.4);
  mg.addColorStop(0,'rgba(224,74,74,0.35)'); mg.addColorStop(1,'rgba(224,74,74,0)');
  ctx.fillStyle=mg; ctx.fillRect(mx-mr*2.6,my-mr*2.6,mr*5.2,mr*5.2);
  ctx.fillStyle='#c95050'; ctx.beginPath(); ctx.arc(mx,my,mr,0,TAU); ctx.fill();
  ctx.fillStyle='#b34343';
  ctx.beginPath(); ctx.arc(mx-mr*0.3,my-mr*0.2,mr*0.18,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx+mr*0.25,my+mr*0.3,mr*0.12,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx+mr*0.1,my-mr*0.45,mr*0.08,0,TAU); ctx.fill();
  /* 远山 */
  ctx.fillStyle='#0e0a18';
  ctx.beginPath(); ctx.moveTo(0,VH*0.72);
  for(let i=0;i<=10;i++) ctx.lineTo(VW*i/10,VH*(0.72+0.06*Math.sin(i*2.3+1)));
  ctx.lineTo(VW,VH); ctx.lineTo(0,VH); ctx.fill();
  /* 蝙蝠 */
  for(const b of MBATS){
    const spr=SPR.batA;
    const f=Math.floor(b.t*8)%2;
    ctx.save(); ctx.translate(b.x,b.y);
    ctx.scale(0.7,0.7); if(b.vx<0) ctx.scale(-1,1);
    ctx.globalAlpha=0.8;
    ctx.drawImage(spr.frames[f],-spr.w/2,-spr.h/2);
    ctx.restore();
  }
  ctx.globalAlpha=1;
  ctx.drawImage(vignette,0,0);
}
/* ---------- HUD ---------- */
let hudGems=0;
function drawHUD(){
  const pl=G.player;
  /* XP条 */
  const need=xpNeed(G.level);
  const fr=clamp(G.xp/need,0,1);
  ctx.fillStyle='rgba(10,7,16,0.85)'; ctx.fillRect(0,0,VW,20);
  ctx.fillStyle='#3a3050'; ctx.fillRect(0,16,VW,5);
  ctx.fillStyle='#d9a934'; ctx.fillRect(0,16,VW*fr,5);
  ctx.fillStyle='#f0cf6e'; ctx.fillRect(0,16,VW*fr,2);
  ctx.font='bold 12px Consolas,monospace'; ctx.textAlign='left';
  ctx.fillStyle='#e8e2f0'; ctx.fillText('Lv '+G.level,8,13);
  /* 计时 */
  const m=Math.floor(G.time/60),s=Math.floor(G.time%60);
  ctx.font='bold 22px Consolas,monospace'; ctx.textAlign='center';
  ctx.fillStyle='#000'; ctx.fillText(`${m}:${String(s).padStart(2,'0')}`,VW/2+2,26);
  ctx.fillStyle=G.time>1080?'#f0cf6e':'#e8e2f0'; ctx.fillText(`${m}:${String(s).padStart(2,'0')}`,VW/2,24);
  /* 击杀 */
  ctx.font='bold 13px Consolas,monospace'; ctx.textAlign='right';
  ctx.fillStyle='#e8e2f0'; ctx.fillText('击杀 '+G.kills,VW-10,14);
  ctx.fillStyle='#f0cf6e'; ctx.fillText('宝石 '+hudGems,VW-10,32);
  ctx.fillStyle='#f0cf6e'; ctx.fillText('🪙 '+G.gold,VW-10,50);
  /* 血条 */
  const bw=190,bh=15,bx=12,by=VH-30;
  ctx.fillStyle='rgba(10,7,16,0.8)'; ctx.fillRect(bx-2,by-2,bw+4,bh+4);
  ctx.fillStyle='#3a2020'; ctx.fillRect(bx,by,bw,bh);
  const hpf=clamp(pl.hp/G.P.maxhp,0,1);
  ctx.fillStyle=hpf>0.35?'#b8383e':'#e04a4a'; ctx.fillRect(bx,by,bw*hpf,bh);
  ctx.fillStyle='#e77'; ctx.fillRect(bx,by,bw*hpf,3);
  ctx.font='bold 11px Consolas,monospace'; ctx.textAlign='left';
  ctx.fillStyle='#fff'; ctx.fillText(`${Math.ceil(pl.hp)}/${Math.round(G.P.maxhp)}`,bx+6,by+12);
  /* 武器与被动图标 */
  let ix=12, iy=VH-64;
  for(const w of G.weapons){
    const spr=SPR[WEAPONS[w.id].icon];
    ctx.fillStyle='rgba(20,15,30,0.85)'; ctx.fillRect(ix,iy,26,26);
    ctx.strokeStyle=w.evolved?'#f0cf6e':'#3a3050'; ctx.lineWidth=w.evolved?2:1;
    ctx.strokeRect(ix+0.5,iy+0.5,25,25);
    ctx.lineWidth=1;
    ctx.drawImage(spr.frames[0],ix+3,iy+3,20,20);
    if(w.evolved){ ctx.fillStyle='#f0cf6e'; ctx.font='bold 9px Consolas,monospace'; ctx.fillText('✦',ix+2,iy+9); }
    ctx.fillStyle='#f0cf6e'; ctx.textAlign='right'; ctx.font='bold 10px Consolas,monospace';
    ctx.fillText(w.lv,ix+24,iy+24);
    ix+=30;
  }
  ix+=6;
  for(const id in G.passives){
    const spr=SPR[PASSIVES[id].icon];
    ctx.fillStyle='rgba(20,15,30,0.7)'; ctx.fillRect(ix,iy+2,22,22);
    ctx.strokeStyle='#2c2440'; ctx.strokeRect(ix+0.5,iy+2.5,21,21);
    ctx.drawImage(spr.frames[0],ix+3,iy+5,16,16);
    ctx.fillStyle='#9c92b8'; ctx.textAlign='right'; ctx.font='bold 9px Consolas,monospace';
    ctx.fillText(G.passives[id],ix+20,iy+12);
    ix+=26;
  }
  /* 触屏摇杆绘制 */
  if(touch.active&&state==='playing'){
    ctx.save(); ctx.globalAlpha=0.35;
    ctx.strokeStyle='#e8e2f0'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(touch.ox,touch.oy,52,0,TAU); ctx.stroke();
    ctx.fillStyle='#e8e2f0';
    ctx.beginPath(); ctx.arc(touch.ox+touch.dx,touch.oy+touch.dy,20,0,TAU); ctx.fill();
    ctx.restore();
  }
  /* Boss 血条 */
  if(G.boss&&!G.boss.dead){
    const w=Math.min(430,VW*0.5),x=VW/2-w/2,y=44;
    const hp=clamp(G.boss.hp/G.boss.maxhp,0,1);
    ctx.fillStyle='rgba(10,7,16,0.85)'; ctx.fillRect(x-3,y-3,w+6,17);
    ctx.fillStyle='#3a2020'; ctx.fillRect(x,y,w,11);
    ctx.fillStyle='#e04a4a'; ctx.fillRect(x,y,w*hp,11);
    ctx.fillStyle='#ff8a8a'; ctx.fillRect(x,y,w*hp,3);
    ctx.font='bold 12px Consolas,monospace'; ctx.textAlign='center'; ctx.fillStyle='#fff';
    ctx.fillText('☠ '+G.boss.name,VW/2,y-6);
  }
  /* 剩余时间提示 */
  if(G.time>1140&&state==='playing'){
    ctx.font='bold 15px Consolas,monospace'; ctx.textAlign='center';
    ctx.fillStyle=`rgba(240,207,110,${0.6+0.4*Math.sin(G.time*6)})`;
    ctx.fillText('黎明即将到来——撑住！',VW/2,VH*0.3);
  }
  /* 离屏目标箭头（头目/宝箱） */
  const tgts=[];
  if(G.boss&&!G.boss.dead) tgts.push({o:G.boss,col:'#e04a4a'});
  for(const p of G.pickups) if(p.type==='chest') tgts.push({o:p,col:'#f0cf6e'});
  for(const tg of tgts){
    const sx=tg.o.x-G.cam.x+VW/2, sy=tg.o.y-G.cam.y+VH/2;
    if(sx>34&&sx<VW-34&&sy>34&&sy<VH-34) continue;
    const a=Math.atan2(sy-VH/2,sx-VW/2);
    const bx=VW/2+Math.cos(a)*(Math.min(VW,VH)/2-48), by=VH/2+Math.sin(a)*(Math.min(VW,VH)/2-48);
    ctx.save(); ctx.translate(bx,by); ctx.rotate(a);
    ctx.fillStyle=tg.col; ctx.globalAlpha=0.65+0.35*Math.sin(G.time*6);
    ctx.beginPath(); ctx.moveTo(13,0); ctx.lineTo(-8,-8); ctx.lineTo(-8,8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if(G.god){ ctx.font='bold 12px Consolas,monospace'; ctx.textAlign='center'; ctx.fillStyle='#78a75f'; ctx.fillText('GOD MODE',VW/2,VH-10); }
  if(DEBUG){
    ctx.font='12px Consolas,monospace'; ctx.textAlign='left'; ctx.fillStyle='#7ad1e0';
    ctx.fillText(`FPS ${fps.toFixed(0)} | 敌人 ${G.enemies.length} | 投射物 ${G.projs.length} | 粒子 ${G.parts.length} | 坐标 ${pl.x|0},${pl.y|0}`,8,VH-8);
  }
}

/* ============================================================
 * UI 屏幕管理
 * ============================================================ */
const SCREENS=['menu','charsel','levelup','pause','dead','win','shop'];
function renderShop(){
  const bank=loadBank();
  document.getElementById('shopbank').textContent='持有金币：'+bank+'（对局中拾取的金币会在结算后存入）';
  const box=document.getElementById('shopitems');
  box.innerHTML='';
  const meta=loadMeta();
  for(const it of SHOP_ITEMS){
    const lvl=meta[it.id]||0;
    const el=document.createElement('div');
    el.className='shopitem'+(lvl>=it.max?' maxed':'');
    const pips='<span class="pips">'+Array.from({length:it.max},(_,i)=>`<i class="${i<lvl?'on':''}"></i>`).join('')+'</span>';
    el.innerHTML=`<div><div class="sname">${it.name}${pips}</div><div class="sdesc">${it.desc}</div></div>`;
    const btn=document.createElement('button');
    btn.className='sbuy';
    if(lvl>=it.max){ btn.textContent='已满级'; btn.disabled=true; }
    else{
      const cost=it.cost(lvl);
      btn.textContent='🪙 '+cost;
      btn.disabled=bank<cost;
      btn.onclick=()=>{
        const b=loadBank();
        if(b<cost) return;
        addBank(-cost);
        const m=loadMeta(); m[it.id]=(m[it.id]||0)+1; saveMeta(m);
        AudioSys.sfx('chest');
        renderShop();
      };
    }
    el.appendChild(btn);
    box.appendChild(el);
  }
}
function showScreen(name){
  for(const s of SCREENS){
    document.getElementById(s).classList.toggle('hidden',s!==name);
  }
}
function bestLine(){
  try{
    const b=JSON.parse(localStorage.getItem('bms_best')||'null');
    if(!b) return '';
    return `最佳纪录：${Math.floor(b.time/60)}分${b.time%60}秒 · 击杀 ${b.kills}${b.win?' · 黎明胜利':''}`;
  }catch(e){ return ''; }
}
function bestStatLine(){
  try{
    const b=JSON.parse(localStorage.getItem('bms_best')||'null');
    if(!b) return '暂无';
    return `${Math.floor(b.time/60)}分${b.time%60}秒 · 击杀 ${b.kills}${b.win?' · 胜利':''}`;
  }catch(e){ return '暂无'; }
}
function showToast(msg,cls,dur){
  if(typeof G!=='undefined'&&G&&G.demo) return;
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='show'+(cls?' '+cls:'');
  clearTimeout(t._h);
  t._h=setTimeout(()=>t.className='',(dur||2.2)*1000);
}
function pauseGame(){
  if(state!=='playing') return;
  state='paused';
  document.getElementById('pausestats').innerHTML=
    `<div class="k">时间</div><div class="v">${Math.floor(G.time/60)}:${String(Math.floor(G.time%60)).padStart(2,'0')}</div>`+
    `<div class="k">击杀</div><div class="v">${G.kills}</div>`+
    `<div class="k">等级</div><div class="v">${G.level}</div>`;
  showScreen('pause');
}
function resumeGame(){ if(state==='paused'){ state='playing'; showScreen(null); } }
function togglePause(){ if(state==='playing') pauseGame(); else if(state==='paused') resumeGame(); }
function toMenu(){
  bankRun();
  startDemo();
}
function buildCharCards(){
  const box=document.getElementById('charcards');
  box.innerHTML='';
  for(const id in CHARACTERS){
    const c=CHARACTERS[id];
    const el=document.createElement('div');
    el.className='charcard';
    el.innerHTML=`<div class="cname">${c.name}</div><div class="cdesc">${c.desc.replace(/\n/g,'<br>')}<br><span style="color:#d9a934">${c.stat}</span></div><div class="cstart">初始武器：${WEAPONS[c.weapon].name}<br>点击开始</div>`;
    const cvs=document.createElement('canvas');
    cvs.width=96;cvs.height=96;
    const g=cvs.getContext('2d'); g.imageSmoothingEnabled=false;
    const spr=SPR[c.spr].frames[0];
    g.drawImage(spr,(96-spr.width*2)/2,10,spr.width*2,spr.height*2);
    el.insertBefore(cvs,el.firstChild);
    el.onclick=()=>{ AudioSys.sfx('click'); startGame(id); };
    box.appendChild(el);
  }
}
function bindUI(){
  document.getElementById('btnStart').onclick=()=>{ AudioSys.unlock(); AudioSys.sfx('click'); state='charsel'; showScreen('charsel'); };
  document.getElementById('btnShop').onclick=()=>{ AudioSys.unlock(); AudioSys.sfx('click'); renderShop(); showScreen('shop'); };
  document.getElementById('btnShopBack').onclick=()=>{ AudioSys.sfx('click'); showScreen('menu'); };
  document.getElementById('btnHelp').onclick=()=>document.getElementById('helpbox').classList.toggle('hidden');
  document.getElementById('btnBack').onclick=()=>{ state='menu'; showScreen('menu'); };
  document.getElementById('btnResume').onclick=resumeGame;
  document.getElementById('btnQuit1').onclick=toMenu;
  document.getElementById('btnRetry').onclick=()=>{ AudioSys.sfx('click'); startGame(G.char); };
  document.getElementById('btnQuit2').onclick=toMenu;
  document.getElementById('btnRetry2').onclick=()=>{ AudioSys.sfx('click'); startGame(G.char); };
  document.getElementById('btnQuit3').onclick=toMenu;
}

/* ============================================================
 * 调试接口（自动化测试用）
 * ============================================================ */
const DEBUG=new URLSearchParams(location.search).has('debug');
window.GAME={
  version:'1.0',
  start(c){ startGame(c||'hunter'); },
  state:()=>state,
  info(){ return G?{state,time:+G.time.toFixed(1),kills:G.kills,level:G.level,hp:Math.ceil(G.player.hp),
    maxhp:Math.round(G.P.maxhp),enemies:G.enemies.length,weapons:G.weapons.map(w=>w.id+(w.evolved?'*':'')+':'+w.lv),
    passives:{...G.passives},boss:G.boss?G.boss.id:null,errors:window.__errors.length}:null; },
  god(v){ if(G) G.god=v===undefined?!G.god:v; },
  ts(v){ if(G) G.timeScale=v; },
  spawn(id,n){ if(!G)return; const k=n||1; for(let i=0;i<k;i++) spawnAtEdge(id,{}); },
  boss(id){ if(G) spawnAtEdge(id,{}); },
  levelUp(n){ if(!G)return; G.luQueue+=n||1; if(state==='playing') openLevelUp(); },
  give(id){ if(G&&WEAPONS[id]) G.weapons.push({id,lv:1,t:0.3,pulse:0,active:null}); },
  setW(id,lv){ if(!G)return; let w=G.weapons.find(w=>w.id===id); if(!w){ w={id,lv:1,t:0.3,pulse:0,active:null}; G.weapons.push(w); } w.lv=Math.min(lv||8,WEAPONS[id].maxLv); },
  chest(){ if(G) G.pickups.push({type:'chest',x:G.player.x,y:G.player.y,t:0}); },
  passive(id){ if(G&&PASSIVES[id]){ G.passives[id]=(G.passives[id]||0)+1; recalcStats(); } },
  skip(s){ if(G) G.time+=s; },
  killAll(){ if(G) for(const e of G.enemies) killEnemy(e,false); },
  hurt(n){ if(G) hurtPlayer(n||10); },
  gold(n){ if(G) G.gold+=n||50; },
  /* 平衡测试台：按对局时间布置"典型玩家 build" */
  buildout(t){
    if(!G) return;
    const stages=[
      {t:0,   w:[['whip',2]], p:{might:1}},
      {t:150, w:[['whip',3],['knife',2]], p:{might:2,tome:1}},
      {t:330, w:[['whip',4],['knife',3],['wand',3]], p:{might:3,tome:2,area:1}},
      {t:560, w:[['whip',5],['knife',4],['wand',4],['garlic',3]], p:{might:4,tome:3,area:2,wings:1}},
      {t:830, w:[['whip',7],['knife',6],['wand',5],['garlic',4]], p:{might:5,tome:4,area:3,wings:2,heart:2}},
      {t:1050,w:[['whip',8],['knife',8],['wand',7],['garlic',6]], p:{might:5,tome:5,area:4,wings:3,heart:3}},
    ];
    let s=stages[0];
    for(const st of stages) if(t>=st.t) s=st;
    G.weapons=s.w.map(([id,lv])=>({id,lv,t:0.2,pulse:0,active:null}));
    G.passives={...s.p};
    recalcStats();
    G.player.hp=Math.min(G.player.hp,G.P.maxhp);
    return s.t;
  },
  screenshotHint(){ return 'window.GAME.info()'; },
};

/* ---------- 启动 ---------- */
function boot(){
  buildSprites();
  initCanvas();
  bindInput();
  bindTouch();
  bindUI();
  buildCharCards();
  document.getElementById('bestline').textContent=bestLine();
  showScreen('menu');
  requestAnimationFrame(frame);
  /* 自动化测试模式 */
  const q=new URLSearchParams(location.search);
  if(q.has('autotest')){
    setTimeout(()=>{
      startGame(q.get('char')||'hunter');
      G.god=!q.has('nogod');
      if(q.has('ai')) G.ai=true;
      if(q.has('speed')) G.timeScale=parseFloat(q.get('speed'))||3;
      if(q.has('t')) G.time=parseFloat(q.get('t'));
      if(q.has('build')) GAME.buildout(parseFloat(q.get('build'))||G.time);
    },400);
  } else if(!q.has('nodemo')){
    setTimeout(startDemo,600);
  }
}
boot();
