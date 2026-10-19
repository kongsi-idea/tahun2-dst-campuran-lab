/* 分离大法实验室 · 「它们哪里不一样？」性质卡（SPEC 第 12 节）
   ✅ 结果出来后，结果卡里问「为什么分得开？因为它们……」，3 个大按钮：1 个对的（这个工具利用的性质），2 个干扰项。
   干扰项只从「对这个混合物来说是错的」性质里随机抽（LAB.MIX_PROPS 列出每个混合物成立的性质，不能抽到）。
   选对：按钮变绿＋弹一下＋语音「对！」；选错：轻轻抖一下、变灰，可以再选，不扣分（闯关只影响星星）。 */
(function () {
  'use strict';
  const LAB = window.LAB, { shuffle } = LAB;
  const props = LAB.props = { last: null };

  props.enabled = (mix, tool) => LAB.hooks.propsOn !== false && !!LAB.TOOL_PROP[tool] && !!LAB.MIX_PROPS[mix];

  /* 选项：返回 [对的, 干扰1, 干扰2]（已洗牌前的顺序），验收脚本也用它 */
  props.makeOptions = (mix, tool) => {
    const right = LAB.TOOL_PROP[tool], good = LAB.MIX_PROPS[mix];
    const pool = Object.keys(LAB.PROPS).filter((k) => good.indexOf(k) < 0);
    return [right].concat(shuffle(pool.slice()).slice(0, 2));
  };

  props.show = (resEl, mix, tool) => {
    const opts = props.makeOptions(mix, tool), right = opts[0];
    const ask = resEl.querySelector('.pask'), box = resEl.querySelector('.popts');
    let good = resEl.querySelector('.pgood');
    if (!good) { good = document.createElement('p'); good.className = 'pgood'; resEl.querySelector('.prop').insertBefore(good, ask.nextSibling); }
    ask.textContent = LAB.PROP_ASK; good.textContent = '';
    box.innerHTML = '';
    const st = props.last = { mix, tool, right, options: opts.slice(), mistakes: 0, done: false };
    shuffle(opts.slice()).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'popt'; b.dataset.p = k; b.textContent = LAB.PROPS[k];
      b.addEventListener('click', () => {
        if (st.done || b.classList.contains('bad')) return;
        if (k === right) {
          st.done = true; b.classList.add('good');
          good.textContent = '对！因为它们' + LAB.PROPS[k] + '。';
          setTimeout(() => LAB.ui.propDone(), 650);
          if (LAB.voice) LAB.voice.sayPartner(LAB.PHRASE.ok);
          if (LAB.hooks.onProp) LAB.hooks.onProp(true, st.mistakes, st);
        } else {
          st.mistakes++; b.classList.add('bad');
          if (LAB.voice) LAB.voice.sayPartner(LAB.PHRASE.retry);
          if (LAB.hooks.onProp) LAB.hooks.onProp(false, st.mistakes, st);
        }
      });
      box.appendChild(b);
    });
  };
})();
