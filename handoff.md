# 分离大法实验室 · 交接

## 检查点 2（实验台部分）2026-10-19
做了：12 个混合物（第 3 节 5 个＋第 11 节 7 个）、性质卡、连环分离（沙和盐、两杯找盐）、开场＋自由实验／先猜再试／闯关、预录语音。溶解赛跑（race.html、js/race.js、css/race.css、gen-voice-race.py、audio/race/）另一位做，开场第 4 张卡只连到 race.html。
- 验收脚本：`test-cp2.py combos|props|chain|cups|quest|voice|all`（本机 8791）。语音：`python3 gen-voice.py`（edge-tts）。
- 版面（2026-10-19 老师意见）：1600×900 舞台，间距 8 的倍数，上下边距 ≥32、左右 ≥48；点击区域电脑 88px，舞台缩放 < 0.6 时 JS 给 #stage 加 .sm，变 104px。
- `assets/bg-cups.jpg`：两杯找盐用的背景＝bg.jpg 把大碗和影子抹掉（按行在左右边缘取色做插值＋模糊；不是 AI 生图）。生成脚本没放进项目；要重做时：对 bg.jpg 的碗外廓（见 data.js BOWL.profile）加影子区域做逐行左右插值。
- 不确定／我自己加的句子：连环关第 3 步「加水搅一搅」用错的原因句（规格没写）＝「盐已经溶解在水里了，再加水也分不开。」；两杯找盐的「这杯已经滤过了…」「不对哦…」；两杯找盐不放第 7 张卡（规格没定义加水对水和面粉的反应）。
- 规格写「11 个混合物 × 6 工具 = 66」，实际 5＋7＝12 个、72 组合，全部照 72 跑。

### 角色和声音（预录语音，档名＝FNV-1a(声音|句子)；映射也在 gen-voice.py 顶部）
- X 旁白（步骤条、原因句、性质卡题目、闯关任务句、连环关提示与总结）＝ zh-CN-XiaoxiaoNeural
- Y 实验伙伴（分开了！／差一点！／没分开／对！／再试试！／再想想）＝ zh-CN-YunxiNeural
- Z 大挑战开场说明（沙和盐、两杯找盐）＝ zh-CN-YunyangNeural
- 语速 +0%，不调 pitch。溶解赛跑的声音由 race 页自己配。

## ⏯️ 目前做到哪
- 10-19 上线 v1.0；10-20 v1.0.1：修开场「闯关」卡片（连到不存在的模式 quest → qmap）；大、小石头用筛子改 ❌（细网筛，石头都比筛孔大，老师问「石头怎么会可以被筛出来？」）；筛子里的东西改向日葵铺满网面（`sieveSlot`，原来 40 颗挤成一串）。
- 10-20 Hub 封面换成 draw 生成的封面（老师挑 A：磁铁吸铁钉、筛子漏奶粉、滤纸、太阳晒盐），同一张存成 `og.jpg`，index.html 加 og meta，分享网址有预览图。
- 正式网址：https://tahun2-dst-campuran-lab.vercel.app/（另一页 race.html）；GitHub kongsi-idea/tahun2-dst-campuran-lab，push 到 main 自动部署。Hub 已登记 v1.0.1（`npm run check` 全过）。

## 🚦 目前状态
- 可用，等老师课堂试用（quality「待评估」）。`test-cp2.py all` 全过（quest 改成从开场卡片点进去）。
- 课本原页未核：二年级科学课本第 8 课 p.89–98，PDF 已不在电脑上，引用句来自机器转写稿。
- 没有真机／触控实测。

## ➡️ 下一步
1. 老师课堂试用，收集意见。
2. 有课本 PDF 时核对 p.89–98 引用句。

## ⚠️ 注意事项
- 本机测试：`python3 -m http.server 8791 --bind 127.0.0.1`（8765 常被 Hub 本机服务占用）。
- Hub（kongsi-idea）push 不会自动部署：要从干净 worktree `vercel --prod` ＋ `alias set`（10-20 照做）。
- 用 `python3 -I` 会读不到 PIL（装在使用者 site-packages）；Python 3.9 源码单行太长又含中文会误报 Non-UTF-8，长字串放文字档再读。

## 🕐 最后更新
2026-10-20 · Claude Opus 5.5 @ Mac · Git：✅ 已推

## 检查点 1 已知弱点（自评）
- 奶粉质感偏灰白，仍有一点像液体。
- 盐水过滤后滤纸的湿痕像淡蓝水渍。
- 放大镜不演示大沙粒被挡（只有盐水才弹出）。
- 没有真机／触控实测。
