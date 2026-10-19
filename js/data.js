/* 分离大法实验室 · 数据：混合物、结果真值表、舞台与容器几何（全部是常数）。
   舞台 1600×900；bg.jpg 原图 1672×941，量坐标时用原图像素，经 ox()/oy() 换成舞台坐标。 */
(function () {
  'use strict';
  const LAB = window.LAB = window.LAB || {};
  const W = 1600, H = 900;
  const KX = W / 1672, KY = H / 941;
  const ox = (x) => x * KX, oy = (y) => y * KY;
  LAB.W = W; LAB.H = H; LAB.ox = ox; LAB.oy = oy;

  /* ── 六个工具（课本第 91–92 页）── */
  LAB.TOOLS = [
    { key: 'hand', name: '用手' },
    { key: 'water', name: '漂浮法' },
    { key: 'magnet', name: '磁铁' },
    { key: 'sieve', name: '筛子' },
    { key: 'funnel', name: '滤纸' },
    { key: 'sun', name: '蒸发' },
  ];

  /* ── 五个混合物（检查点 1）。
        base：底料材质（null＝没有细料，只有大块东西堆在一起）
        n：各埋入深度的个数。surf 露在表面，half 半埋（下半被底料盖住），side 贴在玻璃侧面被底料半遮，bury 完全埋住。 ── */
  /* 检查点 2 新增字段：
        layout  物件摆法：embed 埋在底料里（表面／半埋／侧面／全埋）；pile 一堆大块东西堆在碗底；floor 沉在水底
        iron    有会被磁铁吸的东西（钉子、回形针、硬币）
        sandy   沙＋水（沙沉在水底）　salty 盐溶在水里（滤纸放大镜、蒸发留盐）　mag 滤纸时弹出放大镜
        fall    筛子摇一摇时会漏下去的东西种类（小石头）
        baseName 底料中文名（吐司用） */
  LAB.MIXES = [
    { id: 'nails', name: '铁钉和沙', base: 'sand', water: null, thumb: ['items/nail-3.png', 'sand'], iron: true, layout: 'embed', baseName: '沙',
      kinds: { nail: { n: { surf: 5, half: 4, side: 3, bury: 3 } } } },
    { id: 'beans', name: '豆子和奶粉', base: 'powder', water: null, thumb: ['items/bean-1.png', 'powder'], layout: 'embed', baseName: '奶粉',
      kinds: { bean: { n: { surf: 4, half: 4, side: 3, bury: 2 } } } },
    { id: 'leafstone', name: '枯叶和碎石', base: null, water: null, thumb: ['items/leaf-1.png', 'items/stone-1.png'], layout: 'pile',
      kinds: { leaf: { n: 5 }, stone: { n: 6 } } },
    { id: 'sandwater', name: '沙和水', base: 'sand', water: 'muddy', thumb: ['sand', 'water'], sandy: true, baseName: '沙',
      kinds: {} },
    { id: 'saltwater', name: '盐水', base: null, water: 'salty', thumb: ['items/salt-1.png', 'water'], salty: true, mag: true,
      kinds: {} },
    { id: 'peanut', name: '花生和面粉', base: 'flour', water: null, thumb: ['items/peanut-1.png', 'flour'], layout: 'embed', baseName: '面粉',
      kinds: { peanut: { n: { surf: 4, half: 4, side: 3, bury: 2 } } } },
    { id: 'clips', name: '回形针和面粉', base: 'flour', water: null, thumb: ['items/clip-1.png', 'flour'], iron: true, layout: 'embed', baseName: '面粉',
      kinds: { clip: { n: { surf: 4, half: 4, side: 3, bury: 3 } } } },
    { id: 'stones', name: '大、小石头', base: null, water: null, thumb: ['items/bigstone-1.png', 'items/pebble-1.png'], layout: 'pile', fall: ['pebble'],
      kinds: { bigstone: { n: 4 }, pebble: { n: 10 } } },
    { id: 'twigcoin', name: '树枝和硬币', base: null, water: null, thumb: ['items/twig-1.png', 'items/coin-1.png'], iron: true, layout: 'pile',
      kinds: { twig: { n: 4 }, coin: { n: 5 } } },
    { id: 'buttonwater', name: '纽扣和水', base: null, water: 'clear', thumb: ['items/button-1.png', 'water'], layout: 'floor',
      kinds: { button: { n: 7 } } },
    { id: 'flourwater', name: '水和面粉', base: 'flour', water: 'milky', thumb: ['flour', 'water'], baseName: '面粉',
      kinds: {} },
    { id: 'sandsalt', name: '沙和盐', base: 'sandsalt', water: null, thumb: ['sand', 'items/salt-3.png'], baseName: '沙和盐', chainStart: true,
      kinds: {} },
  ];
  /* 连环关的中间状态（不出现在混合物卡里）：S1＝盐溶解、沙沉在碗底、水是清的；S2＝沙留在滤纸上、盐水在烧杯里（由 chain.js 接手） */
  LAB.VMIX = {
    sandsalt1: { id: 'sandsalt1', name: '沙和盐（已加水）', base: 'sand', water: 'saltclear', sandy: true, salty: true, mag: false, baseName: '沙', kinds: {}, virtual: true },
    sandsalt2: { id: 'sandsalt2', name: '盐水', base: null, water: null, salty: true, mag: false, kinds: {}, virtual: true, src: 'beaker' },
    cups: { id: 'cups', name: '两杯找盐', base: null, water: null, kinds: {}, virtual: true },
  };

  /* ── 结果真值表（SPEC 第 3 节，原因句一字不改）。ok＝✅ part＝⚠️ no＝❌ ── */
  const NOWATER = '这里没有水，滤纸用不上。';
  const NOSUN = '这里没有水，晒了也没变化。';
  LAB.TRUTH = {
    nails: {
      hand: ['part', '看得到的铁钉捡出来了，可是埋在沙里的找不到。有没有更快的方法？'],
      water: ['no', '铁钉和沙都沉下去，没有东西浮起来。'],
      magnet: ['ok', '铁钉会被磁铁吸起来，沙不会。'],
      sieve: ['ok', '沙比筛孔小，漏下去了；铁钉比较大，留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    beans: {
      hand: ['part', '豆子可以一颗一颗捡，可是好慢，奶粉也捡不干净。有没有更快的方法？'],
      water: ['no', '豆子沉下去，奶粉溶进水里，没有东西浮起来。'],
      magnet: ['no', '豆子和奶粉都不会被磁铁吸。'],
      sieve: ['ok', '奶粉很细，漏下去了；豆子比较大，留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    leafstone: {
      hand: ['ok', '枯叶和碎石样子很不一样，用手就能分开。'],
      water: ['ok', '枯叶浮上来，碎石沉下去。'],
      magnet: ['no', '枯叶和碎石都不会被磁铁吸。'],
      sieve: ['no', '枯叶和碎石都比筛孔大，全都留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    sandwater: {
      hand: ['no', '沙太细了，手抓不起来。'],
      water: ['no', '沙沉在水底，没有东西浮起来。'],
      magnet: ['no', '沙和水都不会被磁铁吸。'],
      sieve: ['no', '沙比筛孔小，跟着水一起漏下去了。'],
      funnel: ['ok', '沙不会溶解，留在滤纸上；清水流下去了。'],
      sun: ['part', '水晒干了，只剩下沙。沙分出来了，可是水不见了。'],
    },
    saltwater: {
      hand: ['no', '盐溶在水里，看不见，也抓不到。'],
      water: ['no', '盐溶在水里，没有东西浮起来。'],
      magnet: ['no', '盐和水都不会被磁铁吸。'],
      sieve: ['no', '盐溶在水里，全都漏下去了。'],
      funnel: ['no', '盐溶在水里，颗粒非常小，穿过滤纸了。滤出来的水还是咸的。'],
      sun: ['ok', '水晒干了，盐留在盘子里。'],
    },
  };
  Object.assign(LAB.TRUTH, {
    peanut: {
      hand: ['part', '花生可以一颗一颗捡，可是好慢，面粉也捡不干净。有没有更快的方法？'],
      water: ['no', '花生沉下去，面粉散开，把水弄混浊了，没有东西浮起来。'],
      magnet: ['no', '花生和面粉都不会被磁铁吸。'],
      sieve: ['ok', '面粉很细，漏下去了；花生比较大，留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    clips: {
      hand: ['part', '看得到的回形针捡出来了，可是埋在面粉里的找不到。有没有更快的方法？'],
      water: ['no', '回形针沉下去，面粉散开，把水弄混浊了，没有东西浮起来。'],
      magnet: ['ok', '回形针会被磁铁吸起来，面粉不会。'],
      sieve: ['ok', '面粉很细，漏下去了；回形针比较大，留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    stones: {
      hand: ['ok', '大石头和小石头大小差很多，用手就能分开。'],
      water: ['no', '大石头和小石头都沉下去，没有东西浮起来。'],
      magnet: ['no', '大石头和小石头都不会被磁铁吸。'],
      sieve: ['ok', '小石头比筛孔小，漏下去了；大石头比较大，留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    twigcoin: {
      hand: ['ok', '树枝和硬币样子很不一样，用手就能分开。'],
      water: ['ok', '树枝浮上来，硬币沉下去。'],
      magnet: ['ok', '硬币会被磁铁吸起来，树枝不会。'],
      sieve: ['no', '树枝和硬币都比筛孔大，全都留在筛子上。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    buttonwater: {
      hand: ['ok', '纽扣比较大，用手就能从水里捡出来。'],
      water: ['no', '纽扣沉在水底，没有东西浮起来。'],
      magnet: ['no', '纽扣和水都不会被磁铁吸。'],
      sieve: ['ok', '水从筛孔漏下去了；纽扣比较大，留在筛子上。'],
      funnel: ['ok', '纽扣留在滤纸上，水流下去了。'],
      sun: ['part', '水晒干了，只剩下纽扣。纽扣分出来了，可是水不见了。'],
    },
    flourwater: {
      hand: ['no', '面粉太细了，散在水里，手抓不起来。'],
      water: ['no', '面粉散在水里，没有东西浮起来。'],
      magnet: ['no', '面粉和水都不会被磁铁吸。'],
      sieve: ['no', '面粉比筛孔小，跟着水一起漏下去了。'],
      funnel: ['ok', '面粉不会溶解，留在滤纸上；清水流下去了。'],
      sun: ['part', '水晒干了，只剩下面粉。面粉分出来了，可是水不见了。'],
    },
    sandsalt: {
      hand: ['no', '沙和盐都太细了，手捡不出来。'],
      water: ['no', '盐溶进水里，沙沉下去，没有东西浮起来。'],
      magnet: ['no', '沙和盐都不会被磁铁吸。'],
      sieve: ['no', '沙和盐都比筛孔小，全都漏下去了。'],
      funnel: ['no', NOWATER],
      sun: ['no', NOSUN],
    },
    /* 连环关：S1（沙沉底、盐溶解）用错工具；funnel 是对的，由 chain.js 处理 */
    sandsalt1: {
      hand: ['no', '沙太细了，手抓不起来。'],
      water: ['no', '沙还是沉在水底，没有东西浮起来。'],
      magnet: ['no', '沙和盐水都不会被磁铁吸。'],
      sieve: ['no', '沙比筛孔小，跟着盐水一起漏下去了。'],
      sun: ['no', '水晒干了，沙和盐又混在一起了！'],
      addwater: ['no', '已经加过水了，盐早就溶解了。'],
    },
    /* S2（沙留在滤纸上、盐水在烧杯里）：sun 是对的 */
    sandsalt2: {
      funnel: ['no', '盐溶在水里，又穿过滤纸了。'],
      hand: ['no', '盐溶在水里，看不见，也抓不到。'],
      water: ['no', '盐溶在水里，没有东西浮起来。'],
      magnet: ['no', '盐和水都不会被磁铁吸。'],
      sieve: ['no', '盐溶在水里，全都漏下去了。'],
      addwater: ['no', '盐已经溶解在水里了，再加水也分不开。'],
    },
    /* 两杯找盐：A、B 两杯都是水和面粉 */
    cups: {
      hand: ['no', '面粉太细了，散在水里，手抓不起来。'],
      water: ['no', '面粉散在水里，没有东西浮起来。'],
      magnet: ['no', '面粉和水都不会被磁铁吸。'],
      sieve: ['no', '面粉比筛孔小，跟着水一起漏下去了。'],
      sunRaw: ['no', '水晒干了，剩下面粉，看不出有没有盐。'],
      funnelAgain: ['no', '这杯已经滤过了，滤纸上只剩面粉。'],
      wrongPick: ['no', '不对哦。看一看，哪个盘子里留下了白色的盐粒？'],
    },
  });
  LAB.KIND_LABEL = { ok: '分开了！', part: '差一点！', no: '没分开' };
  /* ✅ 时哪个容器发光 */
  LAB.GLOW = { hand: 'dish', water: 'bowl', magnet: 'dish', sieve: 'dish', funnel: 'beaker', sun: 'dish' };

  /* ── 容器几何（原图像素量得，注解里写原图坐标） ── */
  /* 大玻璃碗：碗口外椭圆 x 519–1221、顶 y≈353、前缘 y≈419，中心 (870,386)；
     内壁轮廓（原图 y → 半宽）逐点量出，其间线性内插。底 y≈722（内）／735（外） */
  const BOWL = {
    cx: ox(870), rimY: oy(386),
    rimOutRx: ox(351), rimOutRy: oy(33),      // 碗口外椭圆
    rimInRx: ox(336), rimInRy: oy(26), rimInY: oy(384),
    wall: 13 * KX,                             // 玻璃壁厚度（外轮廓 = 内轮廓 + wall）
    profile: [[386, 318], [420, 316], [450, 311], [500, 304], [550, 290], [600, 258], [650, 218], [680, 190], [700, 168], [712, 140], [718, 100], [721, 40], [722, 0]]
      .map(([y, hw]) => [oy(y), ox(hw)]),
    floorY: oy(700),                           // 碗底堆东西的高度
    bottomY: oy(722),
  };
  BOWL.hwAt = function (y) {
    const p = BOWL.profile;
    if (y <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (y <= p[i][0]) { const t = (y - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t; }
    }
    return 0;
  };
  BOWL.ratio = 0.0775;                         // 液面椭圆 ry / rx（量自碗口 26/336）
  BOWL.sandTop = 470;                          // 底料表面（舞台 y）
  BOWL.waterTop = 438;                         // 一般水面
  BOWL.mouth = { l: ox(519) + 6, r: ox(1221) - 6, y: oy(386) - 6 };   // 倒东西的碗口左右端

  /* 白瓷浅盘：外椭圆 x 75–510，顶 y≈582、前缘≈652，中心 (292,617)；内椭圆 rx≈203、ry≈27，中心 (293,616) */
  const DISH = {
    cx: ox(293), cy: oy(616), inRx: ox(203), inRy: oy(27),
    outCy: oy(617), outRx: ox(217), outRy: oy(35),
    floorCy: oy(621), floorRx: ox(168), floorRy: oy(17),   // 摆东西的盘底椭圆
  };

  /* 玻璃烧杯：外壁 x 1313–1578，内壁 x 1322–1568，口椭圆中心 (1445,384) ry≈15，内底 y≈710，外底 722；杯口左边有嘴 */
  const BEAK = {
    cx: ox(1445), rimY: oy(384), rimOutRx: ox(138), rimOutRy: oy(15), rimInRx: ox(128), rimInRy: oy(11),
    inL: ox(1322), inR: ox(1568), outL: ox(1313), outR: ox(1578),
    inBottom: oy(710), outBottom: oy(722), inCorner: 18, outCorner: 24,
  };
  BEAK.ratio = 0.09;
  LAB.GEO = { BOWL, DISH, BEAK };

  /* 其他舞台常数 */
  LAB.SKY = { p0: { x: 180, y: 372 }, c: { x: 800, y: 118 }, p1: { x: 1420, y: 372 } };   // 太阳走的天空弧线（二次贝塞尔）
  LAB.SIEVE_POS = { x: DISH.cx, y: 462 };                                                 // 筛子停在浅盘上方
  LAB.FUNNEL_TIP = { x: BEAK.cx - 6, y: 452 };                                            // 漏斗尖端落点（烧杯口内）

  /* ───────── 检查点 2 ───────── */
  LAB.TOOL_ADD = { key: 'addwater', name: '加水搅一搅' };          // 第 7 张卡：只在连环关出现
  LAB.TOOL_NAME = {}; LAB.TOOLS.concat([LAB.TOOL_ADD]).forEach((t) => { LAB.TOOL_NAME[t.key] = t.name; });

  /* 「它们哪里不一样？」性质（SPEC 第 12 节）。TOOL_PROP＝每个工具利用的性质；MIX_PROPS＝每个混合物「成立的性质」（干扰项不能抽到这些） */
  LAB.PROPS = { look: '样子很不一样', float: '一个会浮，一个会沉', magnet: '一个会被磁铁吸', size: '一个大，一个小', insol: '一个不会溶解在水里', sol: '一个会溶解在水里' };
  LAB.TOOL_PROP = { hand: 'look', water: 'float', magnet: 'magnet', sieve: 'size', funnel: 'insol', sun: 'sol' };
  LAB.MIX_PROPS = {
    nails: ['magnet', 'size', 'look'], beans: ['size', 'look'], leafstone: ['look', 'float'], sandwater: ['insol'], saltwater: ['sol'],
    peanut: ['size', 'look'], clips: ['magnet', 'size', 'look'], stones: ['size', 'look'], twigcoin: ['look', 'float', 'magnet'],
    buttonwater: ['size', 'look', 'insol'], flourwater: ['insol'], sandsalt: ['sol', 'insol'],
  };
  LAB.PROP_ASK = '为什么分得开？因为它们……';

  /* 闯关：4 组（SPEC 第 14 节） */
  LAB.LEVELS = [
    { g: '一看就知道', items: [{ id: 'leafstone' }, { id: 'twigcoin' }, { id: 'stones' }] },
    { g: '混在里面', items: [{ id: 'nails' }, { id: 'clips' }, { id: 'beans' }, { id: 'peanut' }] },
    { g: '有水的', items: [{ id: 'sandwater' }, { id: 'flourwater' }, { id: 'buttonwater' }, { id: 'saltwater' }] },
    { g: '大挑战', items: [{ id: 'sandsalt', chain: 'sandsalt' }, { id: 'cups', chain: 'cups', name: '两杯找盐' }] },
  ];
  LAB.levelName = (lv) => lv.name || LAB.MIXES.find((m) => m.id === lv.id).name;
  LAB.levelTask = (lv) => (lv.id === 'cups' ? '找出哪一杯有盐！' : `把${LAB.levelName(lv)}分开！`);

  /* 连环分离的文字（SPEC 第 13 节）。错误原因句在 TRUTH.sandsalt1 / sandsalt2 / cups。 */
  LAB.CHAIN = {
    sandsalt: {
      name: '沙和盐', steps: 3, doneTitle: '都分出来了！',
      intro: '大挑战！沙和盐混在一起，一个工具分不开。要用好几个工具，一步一步来。',
      hints: ['沙和盐混在一起，一个工具分不开。想一想，盐遇到水会怎么样？', '盐溶解了，沙沉在碗底。接下来，用哪个工具把沙留下来？', '沙留在滤纸上了，盐水在烧杯里。怎么把盐找回来？'],
      stepDone: ['第 1 步完成：盐溶解了，沙沉在碗底。', '第 2 步完成：沙留在滤纸上，盐水流进了烧杯。', '第 3 步完成：盐留在浅盘里了。'],
      summary: '先加水，盐溶解了；再用滤纸把沙留下；最后把盐水晒干，就得到盐。',
    },
    cups: {
      name: '两杯找盐', doneTitle: '找到了！',
      intro: '大挑战！A、B 两杯都是水和面粉，看起来一模一样，其中一杯加了盐。想一想，怎么找出来？',
      hints: ['把工具拖到 A 杯或 B 杯上，试一试。', '看起来都一样，怎么知道哪杯有盐？'],
      ask: '两杯都晒完了。哪一杯有盐？',
      sameLook: '看起来都一样，怎么知道哪杯有盐？',
      summary: '先用滤纸把面粉分出来，再把滤出来的水晒干，看哪个盘子里有盐。',
    },
  };
  LAB.PHRASE = {
    ok: '对！', retry: '再试试！', again: '再来一次', next: '下一关', tryOther: '再试别的工具',
    freeHint: '一个工具分不开。要不要试试「连环分离」？', freeGo: '去试试',
  };
})();
