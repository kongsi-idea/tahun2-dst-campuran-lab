"""生成预录人声：从网页的 LAB.voice.allLines() 取出全部句子，用 edge-tts 生成 mp3 到 audio/。
用法：先开 `python3 -m http.server 8791 --bind 127.0.0.1`，再跑 `python3 gen-voice.py`。改了任何一句话，重跑这个脚本。
档名 = FNV-1a(声音|句子)，跟 js/voice.js 的 clipKey() 一致；已存在的档不重录。

角色和声音（2026-10-19；规则见 teaching-tools/agents.md「预录语音要尽量多种人声」，语速一律不低于 0%、不调 pitch）：
  X 旁白（步骤条、原因句、性质卡题目、闯关任务句、连环关提示与总结）＝ zh-CN-XiaoxiaoNeural
  Y 实验伙伴（「分开了！」「差一点！」「没分开」「对！」「再试试！」）＝ zh-CN-YunxiNeural
  Z 大挑战开场说明＝ zh-CN-YunyangNeural
溶解赛跑（race.html）的语音由另一个脚本 gen-voice-race.py 生成到 audio/race/，不在这里。"""
import asyncio, json, os
import edge_tts
from playwright.sync_api import sync_playwright

URL = os.environ.get('TARGET', 'http://127.0.0.1:8791/')
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, 'audio')
os.makedirs(AUDIO, exist_ok=True)
RATE = '+0%'

def fnv(s):
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'

with sync_playwright() as p:
    br = p.chromium.launch(); page = br.new_page()
    page.route('**/*', lambda r: r.abort() if not r.request.url.startswith(('http://127.0.0.1', 'http://localhost', 'data:')) else r.continue_())
    page.goto(URL, wait_until='domcontentloaded'); page.wait_for_function('window.__ready', timeout=20000)
    lines = page.evaluate('() => window.__debug.voice.allLines()')
    br.close()
for l in lines:
    assert fnv(l['voice'] + '|' + l['text']) == l['key'], ('档名算法不一致', l)

async def one(sem, l):
    out = os.path.join(AUDIO, l['key'] + '.mp3')
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return 'skip'
    async with sem:
        err = None
        for _ in range(3):
            try:
                await edge_tts.Communicate(l['text'], l['voice'], rate=RATE).save(out); return 'new'
            except Exception as e:
                err = e; await asyncio.sleep(1.5)
        raise err

async def main():
    sem = asyncio.Semaphore(6)
    res = await asyncio.gather(*(one(sem, l) for l in lines))
    print(f"句子 {len(lines)} 句：新录 {res.count('new')}，已存在 {res.count('skip')}")
asyncio.run(main())

keys = {l['key']: 1 for l in lines}
with open(os.path.join(AUDIO, 'manifest.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 gen-voice.py 生成，不要手改\nwindow.VOICE_CLIPS = ' + json.dumps(keys, separators=(',', ':')) + ';\n')
with open(os.path.join(AUDIO, 'lines.json'), 'w', encoding='utf-8') as f:
    json.dump(lines, f, ensure_ascii=False, indent=1)
extra = sorted(set(n[:-4] for n in os.listdir(AUDIO) if n.endswith('.mp3')) - set(keys))
if extra:
    print(f'提醒：audio/ 里有 {len(extra)} 个旧音档已不再使用（句子改过）：{extra[:5]}… 可移到 ~/Documents/待删除/')
