/* 溶解赛跑的语音句子表（严格 JSON，gen-voice-race.py 直接读这个档；改了任何一句都要重跑 gen-voice-race.py）。
   声音分配（规格第 16 节）：
     zh-CN-YunyangNeural   开场说明（每场一句）
     zh-CN-XiaoxiaoNeural  提问、准备、比赛开始、小结、总结、秒表提醒
     zh-CN-YunxiNeural     「你猜对了！」「原来是这一杯！」这类短句
   语速 0%，不调 pitch。档名 = FNV-1a(声音|句子)，同一句只生一次。 */
window.RACE_LINES = {
  "intro_stir": { "v": "zh-CN-YunyangNeural", "t": "这一场比搅拌。三杯水一样多，糖也一样多，都是一茶匙。" },
  "intro_temp": { "v": "zh-CN-YunyangNeural", "t": "这一场比水的温度。三杯水一样多，糖也一样多，都是一茶匙。" },
  "intro_size": { "v": "zh-CN-YunyangNeural", "t": "这一场比糖的大小。三杯水一样多，糖也一样多，都是一茶匙。" },
  "ask": { "v": "zh-CN-XiaoxiaoNeural", "t": "猜一猜：哪一杯的糖最先溶解完？" },
  "ready": { "v": "zh-CN-XiaoxiaoNeural", "t": "你猜好了。按「放糖」，比赛开始！" },
  "go": { "v": "zh-CN-XiaoxiaoNeural", "t": "比赛开始！看看哪一杯的糖先不见了。" },
  "right": { "v": "zh-CN-YunxiNeural", "t": "你猜对了！" },
  "wrong": { "v": "zh-CN-YunxiNeural", "t": "原来是这一杯！" },
  "sum_stir": { "v": "zh-CN-XiaoxiaoNeural", "t": "搅拌能让糖更快溶解。" },
  "sum_temp": { "v": "zh-CN-XiaoxiaoNeural", "t": "水越热，糖溶解得越快。" },
  "sum_size": { "v": "zh-CN-XiaoxiaoNeural", "t": "糖的颗粒越小，溶解得越快。" },
  "final": { "v": "zh-CN-XiaoxiaoNeural", "t": "物质的体积越小，溶解得越快。搅拌或用较热的水也能让物质更快溶解。" },
  "remind": { "v": "zh-CN-XiaoxiaoNeural", "t": "这是示意动画。真的快慢，要在课室里用秒表测一测！" }
};
