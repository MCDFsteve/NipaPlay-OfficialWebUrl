/* NipaPlay Next —— 进入画面就播放；分步场景按步切换，过渡按时间走，不跟随手指的速度。 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* —— 导航背景 —— */
  const nav = $('#nav');
  // 当前读到哪一节，导航里对应的那一项亮起
  const navLinks = $$('#nav nav a').map((a) => [a, $(a.getAttribute('href'))]).filter(([, s]) => s);
  const onScrollNav = () => {
    nav.classList.toggle('solid', scrollY > 40);
    let on = null;
    for (const [a, s] of navLinks) if (s.getBoundingClientRect().top <= innerHeight * 0.4) on = a;
    for (const [a] of navLinks) a.classList.toggle('on', a === on);
  };

  /* —— 1440×900 画面按容器宽度缩放 —— */
  function fit() {
    for (const el of $$('.scaler')) {
      const holder = el.parentElement;
      const w = +el.dataset.w, h = +el.dataset.h;
      if (el.classList.contains('room-scaler')) {
        // 设备场景没有窗口框，自己占出比例高度
        const s = holder.clientWidth / w;
        holder.style.height = `${h * s}px`;
        el.style.transform = `scale(${s})`;
        el.style.transformOrigin = '0 0';
        el.style.width = `${w}px`; el.style.height = `${h}px`;
      } else {
        el.style.width = `${w}px`; el.style.height = `${h}px`;
        // 窄屏上只露出应用左侧有内容的部分，字能大一些
        const narrow = innerWidth < 860 && el.closest('#how');
        el.style.transform = `scale(${holder.clientWidth / (narrow ? 940 : w)})`;
      }
    }
  }

  /* —— 首屏标题逐字浮现；其他标题按行从遮罩里升起 —— */
  const h1 = $('h1.letters');
  if (h1) {
    let c = 0;
    for (const w of $$('.w', h1)) w.innerHTML = [...w.textContent].map((ch) => `<span class="ch" style="--c:${c++}">${ch}</span>`).join('');
    const go = () => h1.classList.add('go');
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 900))]).then(() => requestAnimationFrame(go));
  }
  for (const h of $$('h2[data-reveal], .sec-h')) {
    const parts = h.innerHTML.split(/<br\s*\/?>/i);
    h.innerHTML = parts.map((t, l) => `<span class="hl-mask"><span class="hl-in" style="--l:${l}">${t}</span></span>`).join('');
    h.classList.add('lines');
    if (!h.hasAttribute('data-reveal')) h.setAttribute('data-reveal', '');
  }

  /* —— 进入画面时出现（只触发一次） —— */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal]').forEach((el) => io.observe(el));

  /* —— 小工具：一条可取消的时间线 —— */
  function timeline() {
    let timers = [], raf = 0;
    return {
      at(ms, fn) { timers.push(setTimeout(fn, reduced ? 0 : ms)); },
      tween(ms, dur, fn) {
        this.at(ms, () => {
          if (reduced) return fn(1);
          const t0 = performance.now();
          const step = (t) => { const k = clamp((t - t0) / dur, 0, 1); fn(k); if (k < 1) raf = requestAnimationFrame(step); };
          raf = requestAnimationFrame(step);
        });
      },
      cancel() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); },
    };
  }
  const typeInto = (el, k) => { const s = el.dataset.text || ''; el.textContent = s.slice(0, Math.round(s.length * k)); };
  const on = (el, yes) => el.classList.toggle('on', !!yes);

  /* —— 工作方式：说 → 准备 → 完成 —— */
  const how = (() => {
    const app = $('#how .how-app'), win = $('#how .window');
    const ask = $('.ask-text', app), you = $('.you-bubble', app), think = $('.thinking', app), thW = $('.th-w', app), secs = $('.secs', app);
    const reply = $('.reply', app), cards = $('.cards', app), reply2 = $('.reply2', app);
    const [s1, s2, s3, s4] = $$('.prep li', app), pct = $('.pct', app), bar = $('.prep .bar', app), tasksN = $('.tasks-n', app);
    const tl = timeline();
    let secTimer = 0;
    const st = (li, s) => { li.classList.toggle('go', s === 'go'); li.classList.toggle('ok', s === 'ok'); };
    const setDl = (k) => { pct.textContent = `${Math.round(k * 100)}%`; bar.style.setProperty('--dl', `${(k * 100).toFixed(1)}%`); };
    function base() {
      tl.cancel(); clearInterval(secTimer);
      app.classList.remove('talking', 'running', 'done'); win.classList.remove('zoom');
      [you, think, reply, cards, reply2].forEach((e) => on(e, false));
      ask.textContent = ''; reply.textContent = ''; reply2.textContent = '';
      [s1, s2, s3, s4].forEach((li) => st(li, '')); setDl(0); tasksN.textContent = '4';
      thW.textContent = 'Thinking'; secs.textContent = '1s';
    }
    function sent() { app.classList.add('talking'); on(you, true); }
    function prepared() {
      sent(); on(think, true); thW.textContent = 'Worked for'; secs.textContent = '41s';
      reply.textContent = reply.dataset.text; on(reply, true); on(cards, true);
      [s1, s2, s3, s4].forEach((li) => st(li, 'ok')); setDl(1);
      reply2.textContent = reply2.dataset.text; on(reply2, true);
    }
    const steps = [
      (instant) => {
        base();
        if (instant) { ask.textContent = ask.dataset.text; return; }
        tl.tween(350, 1300, (k) => typeInto(ask, k));
        tl.at(2100, () => { ask.textContent = ''; sent(); });
        // 发出去之后她马上开始想，画面不停在半路
        tl.at(2500, () => {
          app.classList.add('running'); on(think, true);
          let n = 1; secTimer = setInterval(() => { secs.textContent = `${++n}s`; }, 1000);
        });
      },
      (instant) => {
        base(); sent();
        if (instant) return prepared();
        app.classList.add('running'); on(think, true);
        let n = 1; secTimer = setInterval(() => { secs.textContent = `${++n}s`; }, 1000);
        tl.at(500, () => on(reply, true));
        tl.tween(500, 1600, (k) => typeInto(reply, k));
        tl.at(2300, () => { on(cards, true); st(s1, 'go'); tasksN.textContent = '5'; });
        tl.at(2500, () => win.classList.add('zoom'));
        tl.at(6400, () => win.classList.remove('zoom'));
        tl.at(2700, () => { st(s1, 'ok'); st(s2, 'go'); });
        tl.tween(2700, 2600, setDl);
        tl.at(3500, () => st(s3, 'go'));
        tl.at(3900, () => st(s4, 'go'));
        tl.at(4600, () => st(s3, 'ok'));
        tl.at(5000, () => st(s4, 'ok'));
        tl.at(5300, () => { st(s2, 'ok'); tasksN.textContent = '4'; });
        tl.at(5600, () => { clearInterval(secTimer); app.classList.remove('running'); thW.textContent = 'Worked for'; secs.textContent = '41s'; on(reply2, true); });
        tl.tween(5600, 700, (k) => typeInto(reply2, k));
      },
      () => { base(); prepared(); on(you, false); on(think, false); on(reply, false); on(cards, false); on(reply2, false); app.classList.remove('talking'); app.classList.add('done'); },
    ];
    return { enter: (i, from) => steps[i](from > i) };
  })();

  /* —— 设备：组网 → 说 → 播放 —— */
  const devices = (() => {
    const sec = $('#devices'), pulse = $('.pulse', sec), phAsk = $('.pm-input em', sec);
    const trail = $$('.trail circle', sec), rMac = $('.r-mac', sec), rTv = $('.r-tv', sec), rSrv = $('.r-srv', sec);
    const pMacSrv = $('#m-mac-srv');
    const ripple = (el) => { el.classList.remove('go'); void el.getBoundingClientRect(); el.classList.add('go'); };
    let hist = [];
    const pPhMac = $('#m-ph-mac'), pMacTv = $('#m-mac-tv');
    const tl = timeline();
    const travel = (path, at, dur, end, back) => tl.tween(at, dur, (k) => {
      const e0 = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const e = back ? 1 - e0 : e0;
      const p = path.getPointAtLength(path.getTotalLength() * e);
      pulse.setAttribute('cx', p.x); pulse.setAttribute('cy', p.y);
      pulse.style.opacity = k < 1 ? 1 : 0;
      hist.push(p); if (hist.length > 14) hist.shift();
      trail.forEach((c, i) => {
        const q = hist[hist.length - 1 - (i + 1) * 2];
        if (q && k < 1) { c.setAttribute('cx', q.x); c.setAttribute('cy', q.y); c.style.opacity = (0.55 * (1 - i / trail.length)).toFixed(2); } else c.style.opacity = 0;
      });
      if (k >= 1) { hist = []; end && end(); }
    });
    function base() { tl.cancel(); sec.classList.remove('think', 'on-tv', 'busy', 'toast', 'sent'); pulse.style.opacity = 0; trail.forEach((c) => (c.style.opacity = 0)); hist = []; phAsk.textContent = ''; }
    const steps = [
      () => { base(); sec.classList.add('lit'); },
      (instant) => {
        base(); sec.classList.add('lit');
        if (instant) { sec.classList.add('sent'); return; }
        // 在手机的对话里打字、发出，消息经组网到书房的电脑
        tl.tween(300, 1200, (k) => typeInto(phAsk, k));
        tl.at(1650, () => { phAsk.textContent = ''; sec.classList.add('sent'); });
        travel(pPhMac, 1800, 1000, () => { ripple(rMac); sec.classList.add('think'); });
      },
      (instant) => {
        base(); sec.classList.add('lit', 'sent');
        if (instant) { sec.classList.add('on-tv'); return; }
        sec.classList.add('think');
        travel(pMacTv, 200, 1000, () => { ripple(rTv); sec.classList.remove('think'); sec.classList.add('on-tv'); });
      },
      (instant) => {
        base(); sec.classList.add('lit', 'on-tv', 'sent');
        if (instant) { sec.classList.add('toast'); return; }
        // 书房的梨花把下载交给服务器上的梨花，做完再回报
        sec.classList.add('think');
        travel(pMacSrv, 300, 700, () => { ripple(rSrv); sec.classList.remove('think'); sec.classList.add('busy'); });
        tl.at(2600, () => sec.classList.remove('busy'));
        travel(pMacSrv, 2700, 700, () => { ripple(rMac); sec.classList.add('toast'); }, true);
      },
    ];
    return { enter: (i, from) => steps[i](from > i) };
  })();

  /* —— 架构：能力层 → 身体 → 大脑与家 —— */
  const arch = (() => {
    const sec = $('#arch'), tl = timeline();
    const plates = { top: $('.p-top', sec), cap: $('.p-cap', sec), body: $('.p-body', sec), home: $('.p-home', sec) };
    const light = (...names) => Object.entries(plates).forEach(([k, el]) => el.classList.toggle('on', names.includes(k)));
    const steps = [
      (instant) => {
        light('top', 'cap'); sec.classList.add('lit');
        if (instant) { sec.classList.add('hit', 'hit2'); return; }
        tl.at(700, () => sec.classList.add('hit'));
        tl.at(1500, () => sec.classList.add('hit2'));
      },
      () => { light('body'); sec.classList.add('lit', 'hit2'); },
      () => { light('top', 'home'); sec.classList.add('lit'); },
    ];
    return { enter: (i, from) => { tl.cancel(); sec.classList.remove('hit', 'hit2'); steps[i](from > i); } };
  })();
  // 仓库窗格：逐行写出
  $$('#home .pane').forEach((pane) => $$('.cl', pane).forEach((ln, n) => ln.style.setProperty('--n', n)));

  /* —— 分步场景：滚到哪一步就切到哪一步 —— */
  const stepScenes = [{ el: $('#how'), ctl: how }, { el: $('#devices'), ctl: devices }, { el: $('#arch'), ctl: arch }, { el: $('#home'), ctl: { enter() {} } }].map((s) => ({ ...s, n: +s.el.dataset.steps, cur: -1 }));
  stepScenes.forEach((s) => s.el.style.setProperty('--n', s.n));
  function updateSteps() {
    const vh = innerHeight;
    for (const s of stepScenes) {
      const r = s.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const scrollable = r.height - vh;
      const p = clamp(-r.top / scrollable, 0, 0.9999);
      const i = Math.floor(p * s.n);
      if (i !== s.cur && r.top < vh * 0.35) {
        const from = s.cur; s.cur = i;
        s.el.dataset.step = i;
        const list = $('.step-list', s.el); if (list) list.style.setProperty('--prog', i / (s.n - 1));
        s.ctl.enter(i, from);
      }
    }
  }

  // 海报带：内容复制一份，循环无缝
  $$('.mq-row, .dmb-row').forEach((row) => { row.innerHTML += row.innerHTML; });

  let queued = false;
  const frame = () => { queued = false; onScrollNav(); updateSteps(); };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(frame); } }, { passive: true });
  addEventListener('resize', () => { fit(); frame(); });
  fit(); frame();
  addEventListener('load', () => { fit(); frame(); });
})();
