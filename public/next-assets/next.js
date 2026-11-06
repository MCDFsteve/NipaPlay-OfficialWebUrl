/* NipaPlay Next · 第 1 话 —— 滚动就是拖进度。 */
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const inout = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  const EPISODE = 23 * 60 + 40;

  const set = (el, k, v) => { if (el.style.getPropertyValue(k) !== String(v)) el.style.setProperty(k, v); };
  const on = (el, yes) => el.classList.toggle('on', !!yes);
  const type = (el, t) => {
    const full = el.dataset.text || '';
    const n = reduced ? (t > 0 ? full.length : 0) : Math.round(t * full.length);
    const s = full.slice(0, n);
    if (el.textContent !== s) el.textContent = s;
  };

  /* —— 按比例摆放 1440×900 的画面 —— */
  function fit() {
    const vw = innerWidth, vh = innerHeight - 58;
    const portrait = vw / innerHeight < 0.9;
    for (const el of $$('.fit')) {
      const w = +el.dataset.w, h = +el.dataset.h;
      const room = !!el.querySelector('.room');
      let s, x, y;
      if (portrait && el.dataset.pw) {
        const pw = +el.dataset.pw, ph = +el.dataset.ph;
        el.style.width = `${pw}px`; el.style.height = `${ph}px`;
        s = Math.min(vw / pw, (vh - 20) / ph);
        x = (vw - pw * s) / 2; y = (vh - ph * s) / 2;
        el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
        el.style.left = '0'; el.style.top = '0';
        continue;
      }
      if (el.dataset.pw) { el.style.width = `${w}px`; el.style.height = `${h}px`; }
      if (!portrait) {
        s = Math.min(vw / w, vh / h);
        x = (vw - w * s) / 2; y = (vh - h * s) / 2;
      } else if (room) {
        s = Math.min(vw / (w * 0.62), vh * 0.8 / h);
        x = vw / 2 - 820 * s; y = (vh - h * s) / 2 - vh * 0.04;
      } else {
        s = Math.min(vh * 0.62 / h, vw / 760);
        x = 14 - 80 * s; y = (vh - h * s) / 2 - vh * 0.06;
      }
      el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      el.style.left = '0'; el.style.top = '0';
    }
  }

  function meshGeometry() {
    const portrait = innerWidth / innerHeight < 0.9;
    const svg = $('#b .mesh');
    if (!svg.dataset.lview) svg.dataset.lview = svg.getAttribute('viewBox');
    svg.setAttribute('viewBox', portrait ? svg.dataset.pview : svg.dataset.lview);
    for (const pa of $$('path', svg)) {
      if (!pa.dataset.ld) pa.dataset.ld = pa.getAttribute('d');
      pa.setAttribute('d', portrait ? pa.dataset.pd : pa.dataset.ld);
    }
  }
  meshGeometry();

  /* —— 场景 —— */
  const scenes = $$('[data-scene]').map((el) => ({ el, id: el.dataset.scene, p: -1, timed: $$('[data-in]', el) }));

  function timed(sc, p) {
    for (const el of sc.timed) {
      const a = +el.dataset.in, b = el.dataset.out ? +el.dataset.out : 2;
      on(el, p >= a && p < b);
    }
  }

  const cold = (() => {
    const crt = $('#cold .crt-screen'), wrap = $('#cold .crt');
    return (p) => {
      const t = seg(p, .5, .74);
      const tx = ease(seg(t, 0, .35)), ty = inout(seg(t, .35, 1));
      set(crt, '--crt-o', p >= .5 ? 1 - seg(p, .9, 1) : 0);
      set(crt, '--crt-x', tx.toFixed(4));
      set(crt, '--crt-y', (0.004 + 0.996 * ty).toFixed(4));
      set(crt, '--crt-b', (3 - 2 * seg(t, .35, 1)).toFixed(3));
      set(crt, '--crt-s', seg(t, .5, 1).toFixed(3));
      set(crt, '--crt-glow', (0.5 * (1 - seg(p, .74, .9))).toFixed(3));
      wrap.style.transform = `scale(${1 + 0.9 * ease(seg(p, .78, 1))})`;
    };
  })();

  const op = (() => {
    const imgs = $$('#op .montage img'), flash = $('#op .flash'), title = $('#op .op-title');
    const credits = $$('#op .credits li'), card = $('#op .titlecard'), parts = $$('#op .titlecard span');
    const A = .15, B = .86, N = imgs.length;
    return (p) => {
      // 片名：先在正中，再缩到左上角
      const tin = seg(p, .06, .12), k = inout(seg(p, .15, .23));
      set(title, '--to', (ease(tin) * (1 - seg(p, .84, .87))).toFixed(3));
      set(title, '--ts', `${(12 - 9.2 * k).toFixed(3)}vw`);
      set(title, '--tx', `calc(${(-50 * (1 - k)).toFixed(2)}% + ${(-44 * k).toFixed(2)}vw)`);
      set(title, '--ty', `calc(${(-50 * (1 - k)).toFixed(2)}% + ${(-38 * k).toFixed(2)}vh)`);
      title.style.filter = tin < 1 ? `blur(${(1 - ease(tin)) * 14}px)` : '';
      // 剪辑：硬切 + 每一刀的过曝
      const m = seg(p, A, B), raw = m * N, idx = p < A ? -1 : Math.min(N - 1, Math.floor(raw)), lt = raw - idx;
      imgs.forEach((im, i) => {
        on(im, i === idx && p < B + .02);
        if (i === idx && !reduced) set(im, '--kb', (1.1 - 0.1 * lt).toFixed(4));
      });
      flash.style.opacity = reduced || idx <= 0 ? 0 : (0.55 * Math.max(0, 1 - lt * 9)).toFixed(3);
      credits.forEach((li, i) => on(li, i === idx && lt > .06 && lt < .94));
      // 标题卡
      card.style.opacity = seg(p, .86, .885).toFixed(3);
      parts.forEach((s, i) => {
        const t = ease(seg(p, .885 + i * .025, .925 + i * .025));
        s.style.opacity = t.toFixed(3);
        s.style.transform = `translateY(${(1 - t) * 24}px) scaleX(.86)`;
      });
    };
  })();

  const a = (() => {
    const app = $('#a .app'), bleed = $('#a .bleed'), bdTo = $('#a .bd-to'), bdFrom = $('#a .bd-from');
    const heroFrom = $('#a .hero-from'), heroTo = $('#a .hero-to');
    const ask = $('#a .ask-text'), you = $('#a .you-bubble'), think = $('#a .thinking'), secs = $('#a .secs');
    const reply = $('#a .reply'), cards = $('#a .cards'), reply2 = $('#a .reply2');
    const [s1, s2, s3, s4] = $$('#a .prep li'), pct = $('#a .pct'), bar = $('#a .prep .bar');
    const tasks = $('#a .tasks'), tasksN = $('#a .tasks-n'), shelf = $('#a .shelf');
    const step = (li, go, ok, p) => { li.classList.toggle('go', p >= go && p < ok); li.classList.toggle('ok', p >= ok); };
    return (p) => {
      const sent = p >= .2, folded = p >= .82;
      type(ask, sent ? 0 : seg(p, .06, .19));
      app.classList.toggle('talking', sent);
      app.classList.toggle('running', sent && p < .74);
      set(bleed, '--dim', (0.7 * seg(p, .2, .26) * (1 - seg(p, .8, .86))).toFixed(3));
      on(you, sent && !folded);
      on(think, p >= .24 && !folded);
      secs.textContent = p < .72 ? `${1 + Math.floor(seg(p, .24, .7) * 40)}s` : '41s';
      think.firstChild.nextSibling.nodeValue = p < .72 ? 'Thinking ' : 'Worked for ';
      on(reply, p >= .31 && !folded); type(reply, seg(p, .31, .44));
      on(cards, p >= .46 && !folded);
      step(s1, .46, .49, p); step(s2, .5, .63, p); step(s3, .57, .65, p); step(s4, .6, .67, p);
      const dl = seg(p, .5, .63);
      pct.textContent = `${Math.round(dl * 100)}%`;
      set(bar, '--dl', `${(dl * 100).toFixed(1)}%`);
      tasksN.textContent = p >= .5 && p < .67 ? '5' : '4';
      set(tasks, '--ring', p >= .5 && p < .67 ? 1 : 0);
      on(reply2, p >= .68 && !folded); type(reply2, seg(p, .68, .73));
      const k = ease(seg(p, .82, .9));
      bdTo.style.opacity = k.toFixed(3); bdFrom.style.opacity = (1 - k).toFixed(3);
      const talk = seg(p, .2, .26);
      heroFrom.style.opacity = ((1 - k) * (1 - talk)).toFixed(3); heroFrom.style.transform = `translateY(${-12 * k}px)`;
      shelf.style.opacity = (1 - 0.65 * talk * (1 - seg(p, .82, .88))).toFixed(3);
      heroTo.style.opacity = k.toFixed(3); heroTo.style.transform = `translateY(${12 * (1 - k)}px)`;
      const k2 = ease(seg(p, .86, .95));
      set(shelf, '--shift', `${(-418 * (1 - k2)).toFixed(1)}px`);
      set(shelf, '--fresh', k2.toFixed(3));
      if (!reduced) { bdFrom.style.transform = bdTo.style.transform = `scale(${1.08 - 0.06 * p})`; }
    };
  })();

  const eye = (() => {
    const iris = $('#eye .iris'), card = $('#eye .card3d');
    return (p) => {
      const open = ease(seg(p, 0, .14)) * (1 - ease(seg(p, .88, 1)));
      set(iris, '--iris', `${(open * 75).toFixed(2)}%`);
      set(card, '--flip', `${(180 * inout(seg(p, .46, .56))).toFixed(2)}deg`);
      set(card, '--ez', reduced ? 1 : (1.07 - 0.07 * seg(p, .08, .9)).toFixed(4));
    };
  })();

  const b = (() => {
    const room = $('#b .room'), devs = { tv: $('#b .tv'), mac: $('#b .mac'), srv: $('#b .srv'), ph: $('#b .phone') };
    const tags = { tv: $('#b .t-tv'), mac: $('#b .t-mac'), srv: $('#b .t-srv'), ph: $('#b .t-ph') };
    const mesh = $('#b .mesh'), paths = $$('#b .mesh path'), pulse = $('#b .pulse');
    const phAsk = $('#b .ph-ask em'), macScr = $('#b .mac .scr'), tvOn = $('#b .tv-on');
    const pPhMac = $('#m-ph-mac'), pMacTv = $('#m-mac-tv');
    const at = (pa, t) => pa.getPointAtLength(pa.getTotalLength() * t);
    const order = [['tv', .02], ['mac', .07], ['srv', .12], ['ph', .17]];
    return (p) => {
      for (const [k, t] of order) { on(devs[k], p >= t); on(tags[k], p >= t + .03); }
      set(mesh, '--mesh', seg(p, .24, .3).toFixed(3));
      if (!reduced) for (const pa of paths) pa.style.strokeDashoffset = (-p * 900).toFixed(1);
      type(phAsk, seg(p, .35, .45));
      // 脉冲：手机 → 书房的梨花 → 电视
      let pt = null;
      if (p >= .48 && p < .55) pt = at(pPhMac, ease(seg(p, .48, .55)));
      else if (p >= .57 && p < .63) pt = at(pMacTv, ease(seg(p, .57, .63)));
      if (pt) { pulse.setAttribute('cx', pt.x); pulse.setAttribute('cy', pt.y); pulse.style.opacity = 1; } else pulse.style.opacity = 0;
      set(macScr, '--think', p >= .53 && p < .6 ? 1 : 0);
      // 电视亮起
      const t = seg(p, .62, .69);
      set(tvOn, '--tv-o', p >= .62 ? 1 : 0);
      set(devs.tv, '--tv-glow', seg(t, .5, 1).toFixed(3));
      set(tvOn, '--tv-x', ease(seg(t, 0, .35)).toFixed(4));
      set(tvOn, '--tv-y', (0.004 + 0.996 * inout(seg(t, .35, 1))).toFixed(4));
      set(tvOn, '--tv-b', (2.4 - 1.4 * seg(t, .35, 1)).toFixed(3));
      set(tvOn, '--tv-kb', (1.08 - 0.08 * seg(p, .66, 1)).toFixed(4));
      set(tvOn, '--tv-pos', `${(31 + 9 * seg(p, .66, 1)).toFixed(2)}%`);
      set(tvOn, '--tv-play', p >= .66 && !reduced ? 'running' : 'paused');
      // 镜头推近电视
      const cam = reduced ? 0 : ease(seg(p, .56, .66)) * (1 - ease(seg(p, .76, .84)));
      set(room, '--cam', (1 + 0.14 * cam).toFixed(4));
    };
  })();

  const note = (p) => {};

  const ed = (() => {
    const roll = $('#ed .roll');
    return (p) => {
      const start = innerHeight, end = -roll.offsetHeight + innerHeight * 0.3;
      set(roll, '--roll', `${(start + (end - start) * seg(p, .03, .97)).toFixed(1)}px`);
    };
  })();

  const handlers = { cold, op, a, eye, b, note, ed };

  /* —— 播放器 —— */
  const track = $('#track'), timeEl = $('#time'), marksEl = $('#marks'), heat = $('#heat path');
  const chapters = $$('[data-chapter]');
  let marks = [];
  const scrollMax = () => document.documentElement.scrollHeight - innerHeight;
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function layoutMarks() {
    const max = scrollMax();
    marks = chapters.map((el) => ({ el, at: clamp(el.offsetTop / max), name: el.dataset.chapter }));
    marksEl.innerHTML = marks.map((m) => `<li style="left:${(m.at * 100).toFixed(3)}%"><span>${m.name}</span></li>`).join('');
    // 弹幕热度：每章自己的起伏，高潮落在说完一句话、电视亮起和片尾
    const peaks = [[.02, .2], [.12, .55], [.2, .35], [.33, .75], [.42, .5], [.5, .3], [.6, .9], [.7, .4], [.82, .6], [.95, .45]];
    const W = 1000, H = 100, pts = [];
    for (let i = 0; i <= 200; i++) {
      const x = i / 200;
      let v = .12 + .05 * Math.sin(i * 1.7) + .04 * Math.sin(i * 0.43 + 1);
      for (const [c, h] of peaks) v += h * Math.exp(-Math.pow((x - c) / .028, 2));
      pts.push([x * W, H - clamp(v, 0, 1) * H]);
    }
    heat.parentNode.setAttribute('viewBox', `0 0 ${W} ${H}`);
    heat.setAttribute('d', `M0 ${H} ` + pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ` L${W} ${H} Z`);
  }

  function seek(clientX) {
    const r = track.getBoundingClientRect();
    scrollTo({ top: clamp((clientX - r.left) / r.width) * scrollMax(), behavior: reduced ? 'auto' : 'smooth' });
  }
  let dragging = false;
  track.addEventListener('pointerdown', (e) => { dragging = true; track.setPointerCapture(e.pointerId); stopAuto(); seek(e.clientX); });
  track.addEventListener('pointermove', (e) => { if (dragging) { const r = track.getBoundingClientRect(); scrollTo(0, clamp((e.clientX - r.left) / r.width) * scrollMax()); } });
  track.addEventListener('pointerup', () => { dragging = false; });

  /* —— 自动播放：按下播放，页面自己往下走 —— */
  let auto = false, lastT = 0;
  const playBtn = $('#play');
  function stopAuto() { auto = false; body.classList.remove('autoplay'); }
  function startAuto() { auto = true; body.classList.add('autoplay'); lastT = performance.now(); requestAnimationFrame(autoStep); }
  function autoStep(t) {
    if (!auto) return;
    const dt = Math.min(64, t - lastT); lastT = t;
    const speed = scrollMax() / 150; // 整页约两分半
    scrollBy(0, speed * dt / 1000);
    if (scrollY >= scrollMax() - 1) return stopAuto();
    requestAnimationFrame(autoStep);
  }
  playBtn.addEventListener('click', () => (auto ? stopAuto() : startAuto()));
  addEventListener('wheel', () => auto && stopAuto(), { passive: true });
  addEventListener('touchstart', () => auto && stopAuto(), { passive: true });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('a,button')) { e.preventDefault(); auto ? stopAuto() : startAuto(); }
    else if (auto && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.code)) stopAuto();
  });

  /* —— 弹幕 —— */
  const DM = {
    op: [['来了来了'], ['OP 不跳', 'y'], ['这片头有点东西'], ['梨花！', 'p'], ['空降成功']],
    a: [['一句话就完事了？'], ['弹幕也补好了', 'y'], ['居然认得出是哪部'], ['尼古喵喵好评', 'p']],
    eye: [['眼熟的插卡'], ['梨花好可爱', 'p'], ['B 面是线稿！', 'y']],
    b: [['电视自己开了'], ['手机当遥控器', 'y'], ['好家伙'], ['服务器在柜子里笑']],
    ed: [['ED 也好听', 'y'], ['下周见'], ['荡秋千的梨花', 'p'], ['这就完了？']],
  };
  const dmLayer = $('#danmaku'), dmBtn = $('#dm');
  let dmOn = !reduced, dmScene = null, dmIdx = 0, dmTimer = 0;
  const lanes = innerWidth < 700 ? [0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  dmBtn.classList.toggle('on', dmOn); dmBtn.setAttribute('aria-pressed', dmOn); body.classList.toggle('dm-off', !dmOn);
  dmBtn.addEventListener('click', () => {
    dmOn = !dmOn; dmBtn.classList.toggle('on', dmOn); dmBtn.setAttribute('aria-pressed', dmOn); body.classList.toggle('dm-off', !dmOn);
  });
  function spawn(text, cls) {
    const now = performance.now();
    let lane = 0; for (let i = 1; i < lanes.length; i++) if (lanes[i] < lanes[lane]) lane = i;
    if (lanes[lane] > now) return false;
    const s = document.createElement('span');
    s.textContent = text; if (cls) s.className = cls;
    const dur = 8 + text.length * 0.18;
    s.style.top = `${Math.max(110, innerHeight * 0.13) + lane * Math.max(34, innerHeight * 0.045)}px`;
    s.style.setProperty('--dur', `${dur}s`);
    s.addEventListener('animationend', () => s.remove());
    dmLayer.appendChild(s);
    lanes[lane] = now + dur * 1000 * 0.38;
    return true;
  }
  setInterval(() => {
    if (!dmOn || document.hidden || !dmScene || !DM[dmScene]) return;
    const list = DM[dmScene];
    if (dmIdx >= list.length) return;
    if (performance.now() < dmTimer) return;
    const small = innerWidth < 700;
    if (small && dmIdx % 2 === 1) { dmIdx++; return; }
    if (spawn(...list[dmIdx])) { dmIdx++; dmTimer = performance.now() + (small ? 1800 : 900) + Math.random() * 1300; }
  }, 250);

  /* —— 主循环 —— */
  let queued = false;
  function frame() {
    queued = false;
    const vh = innerHeight, max = scrollMax(), g = clamp(scrollY / max);
    let current = null;
    for (const sc of scenes) {
      const r = sc.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 1.5) continue;
      const p = clamp(-r.top / (r.height - vh));
      if (r.top <= vh * .5 && r.bottom >= vh * .5) current = sc;
      if (Math.abs(p - sc.p) < 1e-4) continue;
      sc.p = p;
      timed(sc, p);
      handlers[sc.id] && handlers[sc.id](p);
    }
    const id = current ? current.id : null;
    if (id !== dmScene) { dmScene = id; dmIdx = 0; dmTimer = performance.now() + 700; }
    body.classList.toggle('in-scene', scrollY > vh * 0.3);
    body.classList.toggle('on-paper', id === 'note');
    body.classList.toggle('at-end', $('#preview').getBoundingClientRect().top < vh * 0.6);
    // 进度条
    set(track, '--pg', `${(g * 100).toFixed(3)}%`);
    timeEl.textContent = `${mmss(g * EPISODE)} / ${mmss(EPISODE)}`;
    let cur = -1; marks.forEach((m, i) => { if (g >= m.at - 1e-3) cur = i; });
    $$('li', marksEl).forEach((li, i) => li.classList.toggle('cur', i === cur));
    // 下集预告的海报墙
    const pv = $('#preview').getBoundingClientRect();
    if (pv.top < vh) {
      const k = clamp(1 - pv.top / vh);
      $$('#preview .col').forEach((c, i) => set(c, '--wy', `${((i % 2 ? -1 : 1) * (k * 160) - (i % 2 ? 0 : 120)).toFixed(1)}px`));
    }
  }
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { meshGeometry(); fit(); layoutMarks(); scenes.forEach((s) => (s.p = -1)); request(); });

  // 下集预告的海报墙
  const posters = ['gakusei', 'yani', 'anbu', 'madoka', 'smoke', 'witch', 'changan', 'edge', 'yume', 'seraph', 'mushoku', 'chaofan', 'succession', 'bigshort', 'doctorx'];
  $$('#preview .col').forEach((c, i) => {
    const list = posters.slice(i * 2).concat(posters.slice(0, i * 2));
    c.innerHTML = list.slice(0, 7).map((n) => `<img src="/next-assets/poster-${n}.webp" alt="" loading="lazy">`).join('');
  });

  fit(); layoutMarks();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutMarks(); request(); });
  addEventListener('load', () => { layoutMarks(); request(); });
  request();
})();
