"""溶解赛跑预录人声：读 js/race-data.js 的 RACE_LINES，用 edge-tts 生成 mp3 到 audio/race/。
用法：python3 gen-voice-race.py   （改了 race-data.js 任何一句就重跑；已存在的档不重录；edge-tts 要 7.3 以上）
声音分配（跟 race-data.js 顶部一致，规格第 16 节）：
  zh-CN-YunyangNeural   ：开场说明
  zh-CN-XiaoxiaoNeural  ：提问、准备、比赛开始、小结、总结、秒表提醒
  zh-CN-YunxiNeural     ：「你猜对了！」「原来是这一杯！」短句
语速 0%（不低于 0%），不调 pitch。档名 = FNV-1a(声音|句子)，跟 race.js 的 clipKey() 同一个算法。
朗读文本：去掉「」引号，其余照原句。"""
import asyncio, json, os, re
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, 'audio', 'race')
os.makedirs(AUDIO, exist_ok=True)
VOICES = {'zh-CN-YunyangNeural': '开场说明', 'zh-CN-XiaoxiaoNeural': '提问、小结、总结、秒表提醒', 'zh-CN-YunxiNeural': '短句反馈'}
RATE = '+0%'

def fnv(s):
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'

src = open(os.path.join(HERE, 'js', 'race-data.js'), encoding='utf-8').read()
m = re.search(r'window\.RACE_LINES\s*=\s*(\{.*\})\s*;', src, re.S)
lines = json.loads(m.group(1))
seen = {}
for name, l in lines.items():
    assert l['v'] in VOICES, ('未知声音', name)
    seen.setdefault(fnv(l['v'] + '|' + l['t']), (name, l))

def tts_text(t):
    return t.replace('「', '').replace('」', '')

async def one(sem, key, name, l):
    out = os.path.join(AUDIO, key + '.mp3')
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return 'skip'
    async with sem:
        err = None
        for _ in range(4):
            try:
                await edge_tts.Communicate(tts_text(l['t']), l['v'], rate=RATE).save(out)
                return 'new'
            except Exception as e:
                err = e
                await asyncio.sleep(1.5)
        raise err

async def main():
    sem = asyncio.Semaphore(4)
    res = await asyncio.gather(*(one(sem, k, n, l) for k, (n, l) in seen.items()))
    print(f"句子 {len(seen)} 句：新录 {res.count('new')}，已存在 {res.count('skip')}")

asyncio.run(main())
keys = {k: 1 for k in seen}
with open(os.path.join(AUDIO, 'manifest.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 gen-voice-race.py 生成，不要手改\n')
    f.write('window.VOICE_CLIPS_RACE = ' + json.dumps(keys, separators=(',', ':')) + ';\n')
extra = sorted(set(n[:-4] for n in os.listdir(AUDIO) if n.endswith('.mp3')) - set(keys))
if extra:
    print('提醒：audio/race/ 里有不属于当前句子的旧档：', extra)
