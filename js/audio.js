'use strict';
/* ============================================================
 * audio.js — WebAudio 程序化音效 + 合成 BGM
 * 首次用户交互后解锁。M 键静音。
 * ============================================================ */
const AudioSys = {
  ctx:null, master:null, sfxG:null, musG:null, delay:null,
  muted:false, started:false, mode:'off', timer:null, nextT:0, step:0, bpm:96,
  noiseBuf:null,

  unlock(){
    if(!this.ctx){
      try{
        const AC = window.AudioContext||window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted?0:0.6;
        this.master.connect(this.ctx.destination);
        this.sfxG = this.ctx.createGain(); this.sfxG.gain.value=0.9; this.sfxG.connect(this.master);
        // 简易延迟总线(用于琶音)
        this.delay = this.ctx.createDelay(1.0); this.delay.delayTime.value=0.28;
        const fb = this.ctx.createGain(); fb.gain.value=0.3;
        this.delay.connect(fb); fb.connect(this.delay);
        const dg = this.ctx.createGain(); dg.gain.value=0.25;
        this.delay.connect(dg); dg.connect(this.sfxG);
        this.musG = this.ctx.createGain(); this.musG.gain.value=0.42; this.musG.connect(this.master);
        // 噪声缓冲
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1,len,this.ctx.sampleRate);
        const d=this.noiseBuf.getChannelData(0);
        for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
      }catch(e){ /* 无音频环境 */ }
    }
    if(this.ctx && this.ctx.state==='suspended') this.ctx.resume();
    if(this.ctx && !this.started){ this.started=true; this.play('game'); }
  },
  setMuted(m){
    this.muted=m;
    try{ localStorage.setItem('bms_muted', m?'1':'0'); }catch(e){}
    if(this.master) this.master.gain.value = m?0:0.6;
  },
  /* 基础音 */
  tone(o){
    if(!this.ctx||this.muted) return;
    const t0=this.ctx.currentTime+(o.delay||0);
    const osc=this.ctx.createOscillator(), g=this.ctx.createGain();
    osc.type=o.type||'square';
    osc.frequency.setValueAtTime(o.f||440,t0);
    if(o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1,o.f2), t0+(o.dur||0.1));
    const v=o.v||0.2, dur=o.dur||0.1, atk=o.atk||0.004;
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(v,t0+atk);
    g.gain.exponentialRampToValueAtTime(0.0008,t0+dur);
    osc.connect(g);
    g.connect(o.bus||this.sfxG);
    if(o.echo&&this.delay) g.connect(this.delay);
    osc.start(t0); osc.stop(t0+dur+0.05);
  },
  noise(o){
    if(!this.ctx||this.muted) return;
    const t0=this.ctx.currentTime+(o.delay||0);
    const src=this.ctx.createBufferSource(); src.buffer=this.noiseBuf; src.loop=true;
    const g=this.ctx.createGain(); const v=o.v||0.2, dur=o.dur||0.1;
    g.gain.setValueAtTime(v,t0);
    g.gain.exponentialRampToValueAtTime(0.0008,t0+dur);
    let node=src;
    if(o.lp){ const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=o.lp; node.connect(f); node=f; }
    if(o.hp){ const f=this.ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=o.hp; node.connect(f); node=f; }
    node.connect(g); g.connect(o.bus||this.sfxG);
    src.start(t0); src.stop(t0+dur+0.05);
  },
  sfx(name){
    if(!this.ctx||this.muted) return;
    switch(name){
      case 'shoot': this.tone({type:'square',f:720,f2:180,dur:0.07,v:0.10}); break;
      case 'slash': this.noise({hp:900,dur:0.09,v:0.16}); this.tone({type:'sawtooth',f:300,f2:120,dur:0.08,v:0.07}); break;
      case 'hit':   this.noise({lp:900,dur:0.06,v:0.16}); this.tone({type:'triangle',f:190,f2:90,dur:0.07,v:0.14}); break;
      case 'die':   this.tone({type:'sawtooth',f:260,f2:50,dur:0.16,v:0.11}); this.noise({lp:1400,dur:0.14,v:0.10}); break;
      case 'gem':   this.tone({type:'sine',f:900+Math.random()*300,f2:1500,dur:0.07,v:0.10}); break;
      case 'hurt':  this.tone({type:'sawtooth',f:160,f2:70,dur:0.22,v:0.26}); this.noise({lp:700,dur:0.18,v:0.18}); break;
      case 'level': { const n=[523,659,784,1047]; n.forEach((f,i)=>this.tone({type:'square',f,dur:0.14,v:0.13,delay:i*0.07,echo:true})); break; }
      case 'chest': { const n=[392,523,659,784,1047]; n.forEach((f,i)=>this.tone({type:'triangle',f,dur:0.2,v:0.14,delay:i*0.09,echo:true})); break; }
      case 'boss':  this.tone({type:'sawtooth',f:90,f2:36,dur:0.9,v:0.34}); this.noise({lp:300,dur:0.8,v:0.2}); break;
      case 'thunder': this.noise({lp:2500,dur:0.25,v:0.22}); this.tone({type:'sawtooth',f:120,f2:40,dur:0.3,v:0.16}); break;
      case 'click': this.tone({type:'square',f:600,f2:900,dur:0.05,v:0.08}); break;
      case 'heal':  this.tone({type:'sine',f:520,f2:880,dur:0.18,v:0.13,echo:true}); break;
      case 'magnet':{ const n=[660,880,1100,1320]; n.forEach((f,i)=>this.tone({type:'sine',f,dur:0.08,v:0.1,delay:i*0.04})); break; }
      case 'lose':  { const n=[392,330,262,196]; n.forEach((f,i)=>this.tone({type:'sawtooth',f,dur:0.4,v:0.14,delay:i*0.28})); break; }
      case 'win':   { const n=[523,659,784,1047,1319]; n.forEach((f,i)=>this.tone({type:'triangle',f,dur:0.35,v:0.15,delay:i*0.13,echo:true})); break; }
    }
  },

  /* ---------- BGM：小调暗黑循环 ---------- */
  play(mode){
    if(!this.ctx) return;
    if(this.mode===mode) return;
    this.mode=mode;
    this.step=0;
    this.nextT=this.ctx.currentTime+0.1;
    if(this.timer) clearInterval(this.timer);
    this.timer=setInterval(()=>this._sched(),40);
  },
  stop(){ this.mode='off'; if(this.timer){clearInterval(this.timer); this.timer=null;} },
  _sched(){
    if(!this.ctx||this.mode==='off') return;
    const spb=60/this.bpm/4; // 16分音符
    while(this.nextT < this.ctx.currentTime+0.15){
      this._stepNote(this.step, this.nextT, spb);
      this.step++;
      this.nextT+=spb;
    }
  },
  _stepNote(s,t,spb){
    const bar=Math.floor(s/16)%4, st=s%16;
    const game=this.mode==='game';
    const inten=this.intensity||0;
    // 和弦进行: Am F Dm E
    const roots=[110.00, 87.31, 73.42, 82.41];
    const arps=[
      [220,261.63,329.63,440],[174.61,220,261.63,349.23],
      [146.83,174.61,220,293.66],[164.81,207.65,246.94,329.63],
    ];
    const root=roots[bar], arp=arps[bar];
    const M=this.musG;
    // 贝斯
    if(game && (st%4===0)){
      const f=(st===8)? root*1.5 : root;
      this.tone({type:'sawtooth',f,f2:f*0.98,dur:spb*3.4,v:0.16,atk:0.01,bus:M});
    }
    // 底鼓/军鼓
    if(game){
      if(st===0||st===8) this.tone({type:'sine',f:130,f2:38,dur:0.13,v:0.32,bus:M});
      if(st===4||st===12) this.noise({hp:1200,dur:0.09,v:inten>=1?0.15:0.09,bus:M});
      if(st%2===0) this.noise({hp:6000,dur:0.02,v:inten>=1?0.05:0.035,bus:M});
      if(inten>=1&&st%4===2) this.noise({hp:7000,dur:0.02,v:0.032,bus:M});
      if(inten>=2&&[0,3,6,8,11,14].includes(st)){
        const mel=[0,2,1,3,2,4][Math.floor(s/16)%6];
        this.tone({type:'triangle',f:arp[mel%4]*2,dur:spb*1.8,v:0.05,echo:true,bus:M});
      }
    }
    // 琶音
    const pat = game? [0,3,6,10,12,14] : [0,6,12];
    if(pat.includes(st)){
      const idx=(s*7+bar*3)%4;
      const f=arp[idx]*( (s%16>=8 && Math.random()<0.5)?2:1 );
      this.tone({type:'square',f,dur:spb*2.2,v:game?0.05:0.045,echo:true,bus:M});
    }
    // 长音铺底
    if(st===0){
      this.tone({type:'sawtooth',f:root/2,dur:spb*15,v:0.05,atk:0.4,bus:M});
      this.tone({type:'sawtooth',f:root/2*1.005,dur:spb*15,v:0.05,atk:0.4,bus:M});
    }
  },
};
try{ AudioSys.muted = localStorage.getItem('bms_muted')==='1'; }catch(e){}
