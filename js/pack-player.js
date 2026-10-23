/* 语音包播放器（主页 voice.js 与 race-voice.js 共用）。
   http/https 下：页面载完后取一次 pack.mp3，用 Web Audio 按目录切出那一句播放。
   没载完／AudioContext 还没被点击唤醒／解码失败／file:// 时，PackPlayer.play 返回 false，调用方照旧用 <audio> 逐档播单档。
   用法：const pp = makePackPlayer('audio/pack.mp3', window.VOICE_PACK);  pp.play(key, onEnd, fallback) → 已接手 true／没接手 false；pp.stop()。 */
(function () {
  'use strict';
  window.makePackPlayer = function (url, pack) {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ok = !!(pack && AC && /^https?:/.test(location.protocol)), actx = null, buf = null, bytes = null, cur = null, token = 0, gestured = false;
    if (ok) { try { actx = new AC({ sampleRate: 24000 }); } catch (e) { try { actx = new AC(); } catch (e2) { ok = false; } } }
    // iPhone/iPad 的静音开关会把 Web Audio 静音（<audio> 不会）：新 Safari 把音频会话切成 playback；旧 iOS 在第一次点击里播一段循环的无声 <audio>
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let sessionDone = false, keepAlive = null;
    const setPlayback = () => { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 忽略 */ } };
    if (ok) setPlayback();
    function wake() {
      gestured = true;
      if (!sessionDone) {
        sessionDone = true; setPlayback();
        if (isIOS && !navigator.audioSession) {
          try {
            keepAlive = new Audio('data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==');
            keepAlive.loop = true; keepAlive.setAttribute('playsinline', '');
            const kp = keepAlive.play(); if (kp && kp.catch) kp.catch(() => {});
          } catch (e) { /* 忽略 */ }
        }
      }
      if (actx && actx.state !== 'running') { try { const r = actx.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 忽略 */ } }
    }
    if (ok) {
      ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, true));
      const decode = () => {
        if (!bytes || buf || !actx) return;
        const ab = bytes; bytes = null;
        const good = (b) => { buf = b; }, bad = () => { ok = false; };
        try { const r = actx.decodeAudioData(ab, good, bad); if (r && r.then) r.then(good, bad); } catch (e) { bad(); }
      };
      const load = () => {
        fetch(url).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then((ab) => { bytes = ab; decode(); }).catch(() => { ok = false; });
      };
      const kick = () => setTimeout(load, 0);          // 页面载完就取包；没好之前的句子照旧走单档
      if (document.readyState === 'complete') kick(); else window.addEventListener('load', kick);
    }
    const ready = (k) => ok && buf && actx && actx.state === 'running' && pack[k];
    function stop() {
      token++;
      if (cur) { const s = cur; cur = null; try { s.onended = null; s.stop(); } catch (e) { /* 忽略 */ } }
    }
    function start(k, onEnd, fallback) {
      const r = pack[k], src = actx.createBufferSource();
      src.buffer = buf; src.connect(actx.destination);
      src.onended = () => { if (cur === src) cur = null; onEnd(); };
      cur = src;
      try { src.start(0, r[0], r[1]); } catch (e) { cur = null; fallback(); }
    }
    /* 已接手（会自己调 onEnd）→ true；包还不能用 → false（调用方走单档）。fallback：等唤醒超时后改走单档 */
    function play(k, onEnd, fallback) {
      stop();
      if (ready(k)) { start(k, onEnd, fallback); return true; }
      // 包已解码、只是 AudioContext 刚被这一下点击叫醒还没转成 running：最多等 0.4 秒，免得第一句掉回单档
      if (ok && buf && actx && pack[k] && actx.state !== 'running' && gestured) {
        const my = ++token; let done = false;
        const go = () => {
          if (done) return; done = true;
          if (my !== token) return;
          if (ready(k)) start(k, onEnd, fallback); else fallback();
        };
        setTimeout(go, 400);
        try { const r = actx.resume(); if (r && r.then) r.then(go, go); } catch (e) { go(); }
        return true;
      }
      return false;
    }
    return { play, stop };
  };
})();
