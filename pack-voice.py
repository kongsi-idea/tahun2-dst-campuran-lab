"""把 audio/ 里的全部短 mp3 接成一个语音包 audio/pack.mp3，并生成目录 audio/pack.js。
为什么：新设备第一次打开原本要下载两百多个小档（每个都算 Vercel 一次请求），合成一个只要 1 个。
做法：ffmpeg 把每句解码成 PCM（时间点以实际解码长度为准）→ 句间留 0.3 秒静音、开头也留 0.3 秒 →
      拼成 wav → libmp3lame 固定码率 48k（跟单档同码率）（CBR）一次编码，拼接处没有杂音。
目录：window.VOICE_PACK = {key: [开始秒, 长度秒]}，app.js 在 http(s) 下用 Web Audio 取这一段播。
原单档 mp3 照留（file:// 双击打开时 fetch 被挡，走原本逐档播放）。
用法：python3 pack-voice.py   （顺序：gen-voice.py、gen-voice-race.py → pack-voice.py）
本工具两组：audio/（主页，window.VOICE_PACK）、audio/race/（race.html，window.VOICE_PACK_RACE）"""
import json, os, re, subprocess, wave

HERE = os.path.dirname(os.path.abspath(__file__))
SR, GAP = 24000, 0.3          # 单档本来就是 24kHz 单声道；句间静音 0.3 秒
BITRATE = '48k'


def decode(path):
    return subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                          check=True, capture_output=True).stdout

def pack(sub, var):
    AUDIO = os.path.join(HERE, sub)
    src = open(os.path.join(AUDIO, 'manifest.js'), encoding='utf-8').read()
    keys = sorted(json.loads(src[src.index('{'):src.rindex('}') + 1]))
    gap = b'\0\0' * int(SR * GAP)
    pcm = bytearray(gap)          # 开头先留一段静音，抵消编码器延迟的误差
    index = {}
    for k in keys:
        d = decode(os.path.join(AUDIO, k + '.mp3'))
        start = len(pcm) / 2
        index[k] = [round(start / SR, 3), round(len(d) / 2 / SR, 3)]
        pcm += d + gap
    tmp_wav = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'lab-pack.wav')
    with wave.open(tmp_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(pcm))
    out = os.path.join(AUDIO, 'pack.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp_wav, '-c:a', 'libmp3lame', '-b:a', BITRATE,
                    '-ac', '1', '-ar', str(SR), out], check=True)
    os.remove(tmp_wav)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out],
                               capture_output=True, text=True).stdout)
    with open(os.path.join(AUDIO, 'pack.js'), 'w', encoding='utf-8') as f:
        f.write('// 由 pack-voice.py 生成，不要手改\n')
        f.write('window.' + var + ' = ' + json.dumps(index, separators=(',', ':')) + ';\n')
    print(f'{sub}: {len(keys)} 句 → pack.mp3 {os.path.getsize(out)//1024} KB，{dur:.1f} 秒')

pack('audio', 'VOICE_PACK')
pack('audio/race', 'VOICE_PACK_RACE')
