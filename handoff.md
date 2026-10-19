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
2026-10-19 已上线 v1.0，等老师课堂试用。
- 正式网址：https://tahun2-dst-campuran-lab.vercel.app/（入口 index.html，另一页 race.html）
- GitHub：kongsi-idea/tahun2-dst-campuran-lab（push 到 main 自动部署）；Hub 已登记（4 张缩略图、standards 8.1.1–8.1.4，主题「混合物」）。

## 🚦 目前状态
- 已上线 v1.0，等老师课堂试用
- 课本出处：二年级科学课本第 8 课，第 89–98 页。**课本原页未核**：课本 PDF 已不在电脑上，引用的课本句子来自机器转写稿，原页还没核对。
- DSKP 对照：8.1.1–8.1.4（SJKC／SK TAHUN2 截取档，未审核）；不接名单

## ➡️ 下一步
1. 老师课堂试用，收集意见；有课本原页时回头核对引用句。

## 📋 上架前要备齐（Hub 登记在 kongsi-idea/data/tools.js，规则见 teaching-tools/agents.md）
- [ ] `standards` 能解析出主题（主题标在 dskp-index.js 节点上，同一内容跨年级同一个词；综合复习等例外才用 `topicOverride`）
- [ ] `modes`（全班投影／上台对战／各自练习／回家练习，1–3 个，第一个是主要方式）
- [ ] 缩略图 4 张：封面（看得到教的内容）→ 玩法 → 答对／答错反馈 → 老师端；按 4:3 截
- [ ] 展示名带内容词，同年级套路词不重复；slug／展示名不放月份
- [ ] 复习卷：`collection`／`setLabel` 并登记 TOOL_COLLECTIONS
- [ ] 要老师后台：data/teacher/{slug}.js ＋ TEACHER_TOOLS（不再复制 *-admin.html）

## ⚠️ 注意事项
- 本机测试：`python3 -m http.server 8791 --bind 127.0.0.1`，开 http://127.0.0.1:8791（8765 常被 Hub 本机服务占用）

## 🕐 最后更新
2026-10-19

## 检查点 1 已知弱点（自评）
- 奶粉质感偏灰白，仍有一点像液体。
- 盐水过滤后滤纸的湿痕像淡蓝水渍。
- 放大镜不演示大沙粒被挡（只有盐水才弹出）。
- 没有真机／触控实测。
