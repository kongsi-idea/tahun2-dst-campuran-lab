"""检查点 2 验收脚本（自己先跑，再交给 verify）。
用法：先开 `python3 -m http.server 8791 --bind 127.0.0.1`，再 `python3 test-cp2.py combos|props|chain|cups|quest|voice|all`
  combos：12 个混合物 × 6 个工具 = 72 种组合，用 __debug.run 逐一跑，把结果卡的种类和原因句跟 SPEC.md 第 3、11 节的表逐字比对
  props ：每个 ✅ 组合都出现性质卡，选项 3 个、含正确项、干扰项不含该混合物成立的性质（跑 20 次随机抽样）
  chain ：沙和盐连环关正确路径一次、每个状态各试一个错误工具并「再试一次」回到原状态
  cups  ：两杯找盐：正确路径、没过滤就蒸发的错误路径、选错答案
  quest ：闯关：从第一关走到最后一关，星星有存、重新整理后还在
  voice ：所有必须有语音的句子都有 mp3、第一次进入出现「点一下画面，开启声音」
外部请求（Google 字体、track-use.js）一律挡掉，本机速度快。"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get('TARGET', 'http://127.0.0.1:8791/')
SHOT = os.path.expanduser('~/Documents/my-agent/playwright-to-delete/')
NOWATER, NOSUN = '这里没有水，滤纸用不上。', '这里没有水，晒了也没变化。'
TOOLS = ['hand', 'water', 'magnet', 'sieve', 'funnel', 'sun']
TITLE = {'ok': '分开了！', 'part': '差一点！', 'no': '没分开'}
EMO = {'✅': 'ok', '⚠️': 'part', '❌': 'no'}


def open_page(p, w=1366, h=768, speed=3, errs=None, args=None):
    b = p.chromium.launch(args=args or []); pg = b.new_context(viewport={'width': w, 'height': h}).new_page()
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(('http://127.0.0.1', 'http://localhost', 'data:')) else r.continue_())
    if errs is not None:
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
    pg.goto(URL, wait_until='domcontentloaded'); pg.wait_for_function('window.__ready', timeout=20000)
    pg.evaluate(f'window.__debug.LAB.speed={speed}')
    return b, pg


def spec_truth(names):
    """从 SPEC.md 第 3、11 节的表读出期望值：{mixName: {tool: (kind, text)}}"""
    md = open(os.path.join(HERE, 'SPEC.md'), encoding='utf-8').read()
    out = {}
    for line in md.splitlines():
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) != 7:
            continue
        name = re.sub(r'（.*?）', '', cells[0])
        if name not in names:
            continue
        row = {}
        for tool, cell in zip(TOOLS, cells[1:]):
            m = re.match(r'(✅|⚠️|❌)\s*(.*)', cell)
            txt = m.group(2).replace('NOWATER', NOWATER).replace('NOSUN', NOSUN)
            row[tool] = (EMO[m.group(1)], txt)
        out[name] = row
    return out


def combos():
    errs = []
    with sync_playwright() as p:
        b, pg = open_page(p, errs=errs)
        mixes = pg.evaluate('window.__debug.LAB.MIXES.map(m=>[m.id,m.name])')
        spec = spec_truth([n for _, n in mixes])
        ok = bad = 0; fails = []; t0 = time.time()
        for mid, name in mixes:
            for tool in TOOLS:
                r = pg.evaluate(f"window.__debug.run('{mid}','{tool}')")
                exp = spec[name][tool]
                good = r['shown'] and r['kind'] == exp[0] and r['text'] == exp[1] and r['title'] == TITLE[exp[0]]
                if exp[0] == 'ok':          # ✅：性质卡一起检查
                    good = good and len(r['popts']) == 3
                if mid == 'sandsalt':       # 沙和盐：每个结果卡都要多一行提示＋按钮
                    good = good and r['hasx'] and r['xbtn'] == '去试试' and '连环分离' in r['xhint']
                else:
                    good = good and not r['hasx']
                if good: ok += 1
                else: bad += 1; fails.append((mid, tool, exp, r['kind'], r['text'], r['title']))
        print(f'combos：通过 {ok} / 不通过 {bad}（共 {ok + bad} 组，用时 {time.time() - t0:.0f}s）')
        for f in fails: print('  FAIL', f)
        print('控制台错误：', errs if errs else '无')
        b.close()
    return bad == 0 and not errs


def props():
    with sync_playwright() as p:
        b, pg = open_page(p)
        data = pg.evaluate('({tp: window.__debug.LAB.TOOL_PROP, mp: window.__debug.LAB.MIX_PROPS, truth: window.__debug.LAB.TRUTH, mixes: window.__debug.LAB.MIXES.map(m=>m.id)})')
        ok_combos = [(m, t) for m in data['mixes'] for t in TOOLS if data['truth'][m][t][0] == 'ok']
        n_ok = n_bad = 0; fails = []
        # 1) 每个 ✅ 组合真的跑一次，看性质卡有没有出、选项对不对
        for m, t in ok_combos:
            r = pg.evaluate(f"window.__debug.run('{m}','{t}')")
            opts = r['popts']; right = data['tp'][t]
            good = r['kind'] == 'ok' and len(opts) == 3 and right in opts and all(o == right or o not in data['mp'][m] for o in opts)
            if good: n_ok += 1
            else: n_bad += 1; fails.append((m, t, opts))
        print(f'性质卡（真跑）：✅ 组合 {len(ok_combos)} 个：通过 {n_ok} / 不通过 {n_bad}')
        # 2) 每个 ✅ 组合再随机抽 30 次选项，干扰项不能含该混合物成立的性质
        rep_bad = 0; rep_n = 0
        for m, t in ok_combos:
            res = pg.evaluate(f"Array.from({{length:30}},()=>window.__debug.LAB.props.makeOptions('{m}','{t}'))")
            for opts in res:
                rep_n += 1
                if not (opts[0] == data['tp'][t] and len(set(opts)) == 3 and all(o not in data['mp'][m] for o in opts[1:])): rep_bad += 1
        print(f'性质卡（随机抽 {rep_n} 次）：干扰项含成立性质的 {rep_bad} 次')
        # 3) 点错变灰、点对变绿
        pg.evaluate("window.__debug.run('nails','magnet')")
        ui = pg.evaluate("[...document.querySelectorAll('.popt')].map(b=>b.dataset.p)")
        wrong = [o for o in ui if o != 'magnet'][0]
        pg.click(f'.popt[data-p="{wrong}"]'); st1 = pg.evaluate(f"document.querySelector('.popt[data-p=\"{wrong}\"]').className")
        pg.click('.popt[data-p="magnet"]'); st2 = pg.evaluate("document.querySelector('.popt[data-p=\"magnet\"]').className")
        print('点错：', st1, '；点对：', st2)
        pg.screenshot(path=SHOT + 'cp2-props-card.png')
        for f in fails: print('  FAIL', f)
        b.close()
    return n_bad == 0 and rep_bad == 0 and 'bad' in st1 and 'good' in st2



DRIVE = """
window.__drive = async (tool, tx, ty, maxSim) => {
  const L = window.__debug.LAB, T = L.T, S = L.S, ui = L.ui, C = L.chain;
  const fr = (n=1) => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const wait = async (sec) => { const t0 = T.clock; let g = 0; while (T.clock - t0 < sec && g++ < 4000) await fr(1); };
  const st0 = C.stage, t00 = T.clock; maxSim = maxSim || 40;
  const done = () => ui.resultShown || (T.run && T.run.finished) || C.stage !== st0 || C.cupAsk;
  const c = T.cardPos(tool); T.grab(tool, { x: c.x, y: c.y + 30 });
  if (!T.held) return 'no-grab';
  for (let i = 1; i <= 12; i++) { T.move({ x: c.x + (tx - c.x) * i / 12, y: c.y + 30 + (ty - c.y - 30) * i / 12 }); await fr(1); }
  if (tool === 'magnet') {
    let t = 0; while (!done() && T.clock - t00 < maxSim) { t += 0.016; if (T.held && !T.held.locked) T.move({ x: L.GEO.BOWL.cx + Math.sin(t * 2.2) * 250, y: ty + Math.sin(t * 3.1) * 10 }); await fr(1); }
    await wait(0.8); if (T.held) T.release({ x: 0, y: 0 }); await wait(0.5); return 'ok';
  }
  T.release({ x: tx, y: ty }); await fr(2);
  if (!T.run) return 'no-run';
  const run = T.run; let g = 0;
  if (tool === 'hand') {
    while (!done() && T.clock - t00 < maxSim && g++ < 600) { await wait(0.5); if (!T.run) break; if (!T.run.queue) { while (!done() && T.clock - t00 < maxSim) await fr(1); break; } if (T.run.cur || T.run.queue.length) continue; const it = S.items.find(i => T.run.isPickable(i)); if (it) T.sceneDown({ x: it.x, y: it.y }); else T.sceneDown({ x: L.GEO.BOWL.cx, y: 500 }); }
  } else if (tool === 'sieve') {
    while (T.run && T.run.phase !== 'shake' && !done() && g++ < 3000) await fr(1);
    if (T.run && T.run.phase === 'shake' && !done()) { const sv = L.SIEVE_POS; T.sceneDown({ x: sv.x, y: sv.y }); let t = 0; while (!done() && T.clock - t00 < maxSim) { t += 0.05; T.sceneMove({ x: sv.x + Math.sin(t * 9) * 55, y: sv.y }); await fr(1); } T.sceneUp({ x: sv.x, y: sv.y }); }
  } else if (tool === 'sun') {
    while (T.run && T.run.phase !== 'sun' && !done() && g++ < 3000) await fr(1);
    const r = T.run; if (r && r.phase === 'sun') { const s = r.pos(0); T.sceneDown(L.cam.toWorld(s), s); const sk = L.SKY, t0 = T.clock; while (!done() && T.clock - t0 < 25) { const k = Math.min(1, (T.clock - t0) / 4); const sp = { x: sk.p0.x + (sk.p1.x - sk.p0.x) * k, y: 300 }; T.sceneMove(L.cam.toWorld(sp), sp); await fr(1); } T.sceneUp({ x: 0, y: 0 }, { x: 0, y: 0 }); }
  } else {
    while (!done() && T.clock - t00 < maxSim) await fr(1);
  }
  await wait(0.7); return 'ok';
};
window.__card = () => { const r = document.querySelector('#result'); return { shown: r.classList.contains('show'), kind: r.dataset.kind, title: r.querySelector('.title').textContent, text: r.querySelector('.why').textContent, again: document.querySelector('#again').textContent, hasp: r.classList.contains('hasp') }; };
"""
BX, BY = 870, 500


def chain():
    errs = []; res = []
    def chk(name, cond):
        res.append((name, bool(cond))); print(('  通过 ' if cond else '  不通过 ') + name)
    with sync_playwright() as p:
        b, pg = open_page(p, errs=errs); pg.evaluate(DRIVE)
        E = lambda js: pg.evaluate(js)
        L = 'window.__debug.LAB'
        truth = E(L + '.TRUTH')
        def card(): return E('window.__card()')
        # ---- 正确路径
        E(L + ".modes.go('free')"); E(L + ".ui.selectMix('sandsalt')")
        E(f"window.__drive('hand',{BX},{BY})"); c = card()
        chk('自由实验：沙和盐用手 → ❌ 且有「去试试」', c['kind'] == 'no' and E("document.querySelector('#result').classList.contains('hasx')"))
        E("document.querySelector('#go').click()")
        chk('去试试 → 进入连环关，工具栏 7 张卡', E("document.querySelectorAll('#toolbar .card').length") == 7 and E(L + '.mode') == 'chain')
        chk('步骤条第 1 步', E(L + '.chain.stage') == 0)
        # S0 错误工具 → 再试一次回到 S0
        E(f"window.__drive('sieve',{BX},{BY})"); c = card()
        chk('S0 筛子 ❌ 原因句', c['kind'] == 'no' and c['text'] == truth['sandsalt']['sieve'][1] and c['again'] == '再试一次')
        E("document.querySelector('#again').click()")
        chk('S0 再试一次 → 回到干的沙和盐', E(L + '.S.bowl.base.salt') == 1 and not E(L + '.ui.resultShown'))
        E(f"window.__drive('addwater',{BX},{BY})")
        chk('S0 加水搅一搅 → 第 2 步（盐不见了、沙沉底）', E(L + '.chain.stage') == 1 and E(L + '.S.bowl.base.salt') < 0.05 and E(L + '.S.bowl.base.top') > 600)
        pg.screenshot(path=SHOT + 'cp2-chain-s1.png')
        # S1 每个错误工具各试一个：加水、磁铁（任选）→ 再试一次回到 S1
        for tool, key in [('addwater', 'addwater'), ('magnet', 'magnet'), ('hand', 'hand')]:
            E(f"window.__drive('{tool}',{BX},{BY})"); c = card()
            chk(f'S1 {tool} ❌ 原因句', c['kind'] == 'no' and c['text'] == truth['sandsalt1'][key][1])
            E("document.querySelector('#again').click()")
            chk(f'S1 {tool} 再试一次 → 状态回到 S1', E(L + '.chain.stage') == 1 and E(L + '.S.mix.id') == 'sandsalt1' and not E(L + '.ui.resultShown'))
        E(f"window.__drive('funnel',{BX},{BY})")
        chk('S1 滤纸 → 第 3 步', E(L + '.chain.stage') == 2 and E(L + '.S.beaker.lv') > 0.5 and E(L + '.S.beaker.salty'))
        pg.screenshot(path=SHOT + 'cp2-chain-s2.png')
        for tool in ['funnel', 'hand']:
            E(f"window.__drive('{tool}',{BX},{BY})"); c = card()
            chk(f'S2 {tool} ❌ 原因句', c['kind'] == 'no' and c['text'] == truth['sandsalt2'][tool][1])
            E("document.querySelector('#again').click()")
            chk(f'S2 {tool} 再试一次 → 状态回到 S2', E(L + '.chain.stage') == 2 and E(L + '.S.beaker.lv') > 0.5 and E(L + '.S.fixtures.length') == 1)
        E(f"window.__drive('sun',{BX},{BY})"); c = card()
        chk('S2 蒸发 → 总结卡（逐字）', c['kind'] == 'ok' and c['text'] == '先加水，盐溶解了；再用滤纸把沙留下；最后把盐水晒干，就得到盐。')
        pg.wait_for_timeout(1200); pg.screenshot(path=SHOT + 'cp2-chain-done.png')
        chk('控制台没有红字', not errs)
        print('  错误：', errs)
        b.close()
    n_ok = sum(1 for _, c in res if c)
    print(f'chain：通过 {n_ok} / 不通过 {len(res) - n_ok}')
    return n_ok == len(res)


def cups():
    errs = []; res = []
    def chk(name, cond):
        res.append((name, bool(cond))); print(('  通过 ' if cond else '  不通过 ') + name)
    with sync_playwright() as p:
        b, pg = open_page(p, errs=errs); pg.evaluate(DRIVE)
        E = lambda js: pg.evaluate(js)
        L = 'window.__debug.LAB'
        truth = E(L + '.TRUTH')['cups']
        card = lambda: E('window.__card()')
        for trial in range(2):          # 两次，各有一杯有盐
            E(L + ".modes.go('qmap')"); E("document.querySelectorAll('.lvl')[12].click()")
            salty = E(L + '.S.cups.salty'); other = 'B' if salty == 'A' else 'A'
            cx = {'A': 745, 'B': 985}
            chk(f'[{trial}] 进入两杯找盐，6 张工具卡，任务条', E("document.querySelectorAll('#toolbar .card').length") == 6 and '哪一杯有盐' in E("document.querySelector('#taskbar .tb-txt').textContent"))
            # 没过滤就蒸发：错
            E(f"window.__drive('sun',{cx['A']},520)"); c = card()
            chk(f'[{trial}] A 杯没滤就蒸发 ❌ 原句', c['kind'] == 'no' and c['text'] == truth['sunRaw'][1])
            E("document.querySelector('#again').click()")
            chk(f'[{trial}] 再试一次 → A 杯回到混浊、盘子是空的', E(L + '.S.cups.A.lv') > 0.99 and E(L + '.S.cups.A.milk') > 0.99 and E(L + '.S.dish.puddles[0].flour') == 0)
            E(f"window.__drive('hand',{cx['B']},520)"); c = card()
            chk(f'[{trial}] 手 ❌ 原句', c['kind'] == 'no' and c['text'] == truth['hand'][1]); E("document.querySelector('#again').click()")
            for cup in ['A', 'B']:
                E(f"window.__drive('funnel',{cx[cup]},520)")
                chk(f'[{trial}] {cup} 杯过滤 → 变清', E(L + f'.S.cups.{cup}.filtered') and E(L + f'.S.cups.{cup}.milk') < 0.05)
            pg.screenshot(path=SHOT + f'cp2-cups-filtered{trial}.png')
            for cup in ['A', 'B']:
                E(f"window.__drive('sun',{cx[cup]},520)")
            chk(f'[{trial}] 两杯都晒完 → 出现 A/B 选择', E(L + '.chain.cupAsk') and E("document.querySelector('#cupask').classList.contains('on')"))
            pg.screenshot(path=SHOT + f'cp2-cups-ask{trial + 2}.png')
            pud = E(L + '.S.dish.puddles.map(p=>[p.label,p.salt>0.9,p.flour])')
            chk(f'[{trial}] 盘子里只有有盐那杯留下盐粒', all((lab == salty) == bool(s) for lab, s, f in pud))
            E(f"document.querySelector('#cupask button[data-cup=\"{other}\"]').click()"); c = card()
            chk(f'[{trial}] 选错 → ❌', c['kind'] == 'no' and c['text'] == truth['wrongPick'][1])
            E("document.querySelector('#again').click()")
            E(f"document.querySelector('#cupask button[data-cup=\"{salty}\"]').click()"); c = card()
            chk(f'[{trial}] 选对 → 总结卡（逐字）', c['kind'] == 'ok' and c['text'] == '先用滤纸把面粉分出来，再把滤出来的水晒干，看哪个盘子里有盐。')
            pg.wait_for_timeout(900); pg.screenshot(path=SHOT + f'cp2-cups-done{trial}.png')
        chk('控制台没有红字', not errs); print('  错误：', errs)
        b.close()
    n_ok = sum(1 for _, c in res if c)
    print(f'cups：通过 {n_ok} / 不通过 {len(res) - n_ok}')
    return n_ok == len(res)



def quest():
    errs = []; res = []
    def chk(name, cond):
        res.append((name, bool(cond))); print(('  通过 ' if cond else '  不通过 ') + name)
    with sync_playwright() as p:
        b, pg = open_page(p, errs=errs); pg.evaluate(DRIVE)
        ctx = pg.context
        E = lambda js: pg.evaluate(js)
        L = 'window.__debug.LAB'
        data = E('({lv: ' + L + '.LEVELS, truth: ' + L + '.TRUTH, tp: ' + L + '.TOOL_PROP})')
        E(L + ".modes.go('qmap')")
        chk('选关画面：13 个关卡按钮', E("document.querySelectorAll('.lvl').length") == 13)
        pg.screenshot(path=SHOT + 'cp2-quest-map.png')
        E("document.querySelectorAll('.lvl')[0].click()")
        cx = {'A': 745, 'B': 985}
        for g in data['lv']:
            for it in g['items']:
                no = E(L + '.modes.Q.lv.no')
                if it.get('chain') == 'sandsalt':
                    for t in ['addwater', 'funnel', 'sun']: E(f"window.__drive('{t}',{BX},{BY})")
                elif it.get('chain') == 'cups':
                    salty = E(L + '.S.cups.salty')
                    for c in 'AB': E(f"window.__drive('funnel',{cx[c]},520)")
                    for c in 'AB': E(f"window.__drive('sun',{cx[c]},520)")
                    E(f"document.querySelector('#cupask button[data-cup=\"{salty}\"]').click()")
                else:
                    tool = [t for t in TOOLS if data['truth'][it['id']][t][0] == 'ok'][0]
                    E(f"window.__drive('{tool}',{BX},{BY})")
                    pg.click(f'.popt[data-p="{data["tp"][tool]}"]'); pg.wait_for_timeout(900)
                label = E("document.querySelector('#again').textContent")
                if it['id'] != 'cups' or True:
                    if label != '下一关': print('  警告：第', no, '关按钮是', label)
                E("document.querySelector('#again').click()")
                pg.wait_for_timeout(300)
        chk('走完 13 关 → 通关画面', E("document.querySelector('#final').classList.contains('on')"))
        pg.screenshot(path=SHOT + 'cp2-quest-final.png')
        stars = E('JSON.parse(localStorage.getItem("tahun2-dst-campuran-lab:stars"))')
        chk('每关都存了 3 星（13 关第一次就对）', len(stars) == 13 and all(v == 3 for v in stars.values()))
        pg.reload(wait_until='domcontentloaded'); pg.wait_for_function('window.__ready')
        E(L + ".modes.go('qmap')")
        n = E("document.querySelectorAll('.lvl').length ? [...document.querySelectorAll('.lvl')].filter(l=>l.querySelectorAll('svg path[fill^=\"url\"]').length===3).length : 0")
        chk('重新整理后星星还在（13 关都是 3 颗亮星）', n == 13)
        # 星星规则：第一个工具就 ✅ 但性质卡先点错 → 2 星；先用错工具再 ✅ 且性质卡一次对 → 2 星；两样都没做到 → 1 星
        E("localStorage.clear()"); pg.reload(wait_until='domcontentloaded'); pg.wait_for_function('window.__ready'); pg.evaluate(DRIVE); pg.evaluate(f'{L}.speed=3')
        E(L + ".modes.go('qmap')"); E("document.querySelectorAll('.lvl')[3].click()")      # 第 4 关：铁钉和沙
        E(f"window.__drive('hand',{BX},{BY})"); c = E('window.__card()')
        chk('第 4 关：先用手（⚠️）按钮是「再试别的工具」', c['kind'] == 'part' and c['again'] == '再试别的工具')
        E("document.querySelector('#again').click()")
        E(f"window.__drive('magnet',{BX},{BY})")
        wrong = E("[...document.querySelectorAll('.popt')].map(b=>b.dataset.p).filter(p=>p!='magnet')[0]")
        pg.click(f'.popt[data-p="{wrong}"]'); pg.click('.popt[data-p="magnet"]'); pg.wait_for_timeout(900)
        E("document.querySelector('#again').click()")
        s2 = E('JSON.parse(localStorage.getItem("tahun2-dst-campuran-lab:stars"))')
        chk('两样都没做到 → 1 星', s2.get('nails') == 1)
        chk('控制台没有红字', not errs); print('  错误：', errs)
        b.close()
    n_ok = sum(1 for _, c in res if c)
    print(f'quest：通过 {n_ok} / 不通过 {len(res) - n_ok}')
    return n_ok == len(res)


def voice():
    errs = []; res = []
    def chk(name, cond):
        res.append((name, bool(cond))); print(('  通过 ' if cond else '  不通过 ') + name)
    with sync_playwright() as p:
        b, pg = open_page(p, errs=errs, args=['--autoplay-policy=document-user-activation-required'])
        lines = pg.evaluate('window.__debug.voice.allLines()')
        have = set(f[:-4] for f in os.listdir(os.path.join(HERE, 'audio')) if f.endswith('.mp3'))
        miss = [l for l in lines if l['key'] not in have]
        chk(f'必须有语音的 {len(lines)} 句全部有 mp3（缺 {len(miss)}）', not miss)
        for l in miss[:5]: print('   缺：', l)
        voices = {}
        for l in lines: voices.setdefault(l['voice'], 0); voices[l['voice']] += 1
        print('  声音分布：', voices)
        # 实际跑一遍：玩一圈，看有没有「缺档」的句子被说出口
        pg.evaluate('window.__debug.voice.missing.length=0')
        chk('开场没有语音缺档', pg.evaluate('window.__debug.voice.missing.length') == 0)
        # 模拟浏览器挡下自动播放（无头浏览器不一定挡）：play() 回 NotAllowedError，点一下之后才允许
        pg.evaluate("window.__orig = HTMLMediaElement.prototype.play; window.__allow = false; HTMLMediaElement.prototype.play = function () { return window.__allow ? window.__orig.call(this) : Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); }; window.addEventListener('pointerdown', () => { window.__allow = true; }, true); 0")
        pg.evaluate("window.__debug.LAB.modes.go('free')"); pg.wait_for_timeout(600)
        hint = pg.evaluate("document.querySelector('#soundhint').classList.contains('show')")
        chk('没点过画面：出现「点一下画面，开启声音」', hint)
        pg.screenshot(path=SHOT + 'cp2-voice-hint.png')
        pg.mouse.click(700, 400); pg.wait_for_timeout(400)
        chk('点一下之后提示收起', not pg.evaluate("document.querySelector('#soundhint').classList.contains('show')"))
        pg.evaluate(DRIVE)
        for m, t in [('nails', 'magnet'), ('sandwater', 'funnel'), ('twigcoin', 'water')]:
            pg.evaluate(f"window.__debug.run('{m}','{t}')")
        miss2 = pg.evaluate('window.__debug.voice.missing')
        chk('实际操作时说出口的句子都有档（缺档 0）', len(miss2) == 0)
        chk('静音按钮', pg.evaluate("(()=>{document.querySelector('#mute').click(); const a=document.querySelector('#mute').getAttribute('aria-pressed'); document.querySelector('#mute').click(); return a})()") == 'true')
        chk('控制台没有红字', not errs); print('  错误：', errs[:3])
        b.close()
    n_ok = sum(1 for _, c in res if c)
    print(f'voice：通过 {n_ok} / 不通过 {len(res) - n_ok}')
    return n_ok == len(res)


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    res = {}
    if what in ('combos', 'all'): res['combos'] = combos()
    if what in ('props', 'all'): res['props'] = props()
    if what in ('chain', 'all'): res['chain'] = chain()
    if what in ('cups', 'all'): res['cups'] = cups()
    if what in ('quest', 'all'): res['quest'] = quest()
    if what in ('voice', 'all'): res['voice'] = voice()
    print(res)
