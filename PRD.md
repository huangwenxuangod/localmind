# MiniClaw PRD：诚实可执行的本地生活 Agent Demo

## 1. 产品定位

MiniClaw 是一个面向美团/本地生活平台的 C 端 Agent Demo。

它不是“AI 攻略生成器”，而是一个：

> 基于用户当前位置、生活场景、平台供给、路线约束、天气风险、商家状态和二次校验机制，生成诚实、可解释、可执行本地生活方案的 Agent。

产品体验上的目标是：

> 像私人生活助理一样，替用户做规划和推荐，但所有推荐都必须是真的、能解释、能被平台数据校验。

产品核心主张：

> AI 负责理解用户想怎么过这一段时间，平台负责判断这件事能不能真实发生。

更直接地说：

> 不生成漂亮但不负责的攻略，只生成有证据、有风险提示、能被二次校验的本地生活方案。

## 2. 背景问题

通用 AI 做旅行/本地生活规划时，最大问题不是不聪明，而是：

> 它经常把未经实时验证的推测包装成确定可执行的安排。

典型问题包括：

- 路线顺序错误：不知道景区真实动线、入口、出口、观光车规则。
- 距离判断错误：把高负担步行说成“很近”。
- 营业信息错误：餐厅关闭、景区闭园、交通停运仍被推荐。
- 交通细节错误：班车时间、站点位置、施工限行、车辆是否可进入等信息不可靠。
- 安全风险缺失：夜间偏僻、野外风险、雨天湿滑、儿童水边风险、暴晒等未提示。
- 本地细节缺失：石板路拖箱困难、电动车限行、园区无树荫、游客店风险等。
- 推荐理由编造：AI 会描述不存在的体验项目、优惠、路线便利性。
- 责任错位：AI 可以快速道歉，但用户已经承担时间、金钱和安全成本。

因此，本产品必须把“诚实”作为第一原则：

> 不确定就说不确定，无法验证就标注需确认，缺少证据就不能编造。

## 3. 产品目标

### 3.1 MVP 目标

第一版 Demo 要证明：

1. 能读懂生活化长文本，提取显性需求和隐性约束。
2. 能基于用户当前位置与杭州全城 mock 供给生成一个最佳方案。
3. 每个推荐地点都来自结构化数据和规则计算，而不是 LLM 自由编造。
4. 每段路线都有距离、时间、交通方式、执行摩擦和场景适配说明。
5. 天气、饮食、亲子、排队、营业、路线、风险会影响推荐。
6. 所有最终方案必须经过二次校验。
7. 无法确定的信息必须显式标注为“需确认”。
8. 用户可以对任意行程卡“换一家”。
9. 换一家后必须重新校验路线、时间、场景、饮食、风险和评分。
10. 用户确认前，方案必须已经成功保存到 Supabase。

### 3.2 非目标

第一版不做：

- 多 Agent 架构
- 真实支付/下单/预约
- 真实美团商户接口
- 完整地图导航
- 用户登录体系
- 多城市
- 多方案对比
- 复杂旅游长线规划

### 3.3 当前产品取向

第一版优先证明“私人生活助理式规划推荐”，而不是做搜索页、攻略页或商家列表页。

系统应主动替用户做决策：

- 用户不需要自己拆需求、筛商家、比距离、看天气、猜排队。
- 系统应该读懂一句生活化输入背后的目标，并生成一个最佳方案。
- 推荐必须是真的：地点来自数据集，距离和时间来自路线估算，营业/排队/天气/优惠均标注校验状态。
- 不能瞎编：无法实时确认的信息一律用“需实时确认”表达，不包装成确定承诺。

第一版推荐排序优先级固定为：

1. 距离
2. 时间
3. 评分
4. 真实体验
5. 天气

这五个维度是当前 demo 的核心产品判断，不把“文案丰富度”或“攻略完整度”作为主要目标。

## 4. 核心原则

### 4.1 诚实优先

系统宁可给出一个较保守的方案，也不能给出未经验证的确定性承诺。

禁止输出：

```text
一定开门
很近
不会排队
适合孩子
路线顺
下雨也没问题
```

除非这些判断有数据或规则证据支撑。

推荐输出：

```text
根据 mock 营业时间，该地点当前时间段可用。
路线估算约 2.8km，打车约 12 分钟。
雨天户外体验有下降风险，建议保留室内备选。
排队数据为模拟信号，真实上线需接入平台实时排队。
```

### 4.2 AI 有有限自由

AI 可以自由发挥的部分：

- 理解长文本
- 提取用户目标
- 识别参与人
- 推断隐性偏好
- 发现歧义
- 建议所需业态
- 解释用户需求背后的生活语境

AI 不可以自由决定的部分：

- 最终商家
- 路线距离
- 通勤时间
- 营业状态
- 排队时间
- 优惠信息
- 是否安全
- 是否适合儿童
- 是否满足饮食约束
- 最终评分
- 是否可执行

### 4.3 二次校验是强制流程

LLM 输出不能直接进入最终方案。

必须经过：

```text
LLM 草稿
↓
Schema 校验
↓
规则规范化
↓
候选召回
↓
路线计算
↓
约束校验
↓
风险校验
↓
评分
↓
持久化
↓
plan_ready
```

如果任一关键校验失败：

- 不允许进入 `plan_ready`
- 不允许用户确认
- 前端必须显示失败原因

### 4.4 平台数据接管 AI 容易瞎编的地方

AI 不擅长：

- 实时信息
- 本地细节
- 交通路线
- 营业时间
- 安全风险
- 商家体验
- 排队状态
- 节假日人流

这些必须由平台数据、mock 数据、规则引擎或实时接口接管。

### 4.5 显示证据链

每个推荐都要能回答：

- 为什么推荐？
- 哪些信息已验证？
- 哪些信息只是估算？
- 哪些地方需要用户确认？
- 替换方案的收益和代价是什么？

## 5. 目标用户与展示对象

### 5.1 C 端目标用户

第一版重点覆盖：

- 亲子家庭
- 朋友聚会
- 情侣/夫妻约会
- 有饮食约束的人群

典型需求：

```text
今天下午有空，想带孩子在附近轻松玩一下，顺便吃点清淡的。
明天下午和朋友逛街吃饭，不吃辣，别跑太远。
周末和老婆出去走走，找个环境好点的地方吃饭。
今天下雨，想找个室内亲子地方。
```

### 5.2 Demo 展示对象

面向：

- 美团/本地生活产品方
- 到店业务方
- 推荐系统/搜索策略方
- Agent/AI 应用技术方

他们真正关心：

- 是否体现平台供给价值
- 是否降低通用 AI 不可靠风险
- 是否能产生新的用户决策体验
- 是否能与交易、排队、预约、优惠、评价体系衔接

## 6. 核心场景

### 6.1 亲子轻松半日

用户输入：

```text
今天下午是空的，想带孩子在家附近轻松玩一下，最好别太累，顺便吃点清淡的
```

系统应识别：

- 时间：默认 14:00-18:00
- 参与人：成人 + 儿童
- 偏好：亲子友好、低强度、近距离、轻松不赶、清淡饮食
- 约束：避免成人向娱乐、避免长距离步行、避免高排队风险

输出要求：

- 推荐低强度地点
- 推荐清淡/不辣/儿童友好餐厅
- 展示当前位置到第一站通勤
- 展示每站之间路线
- 标注天气、排队、步行负担风险

### 6.2 朋友逛街吃饭

用户输入：

```text
明天下午2点到6点，在湖滨附近，我和朋友2个人想逛街吃晚饭，不吃辣
```

系统应识别：

- 时间明确
- 业态：shopping + restaurant
- 饮食：不辣
- 场景：朋友聚会
- 路线：先逛后吃，同商圈优先

输出要求：

- 商圈集中
- 餐厅适合聊天
- 不辣友好
- 可展示优惠/团购价值
- 换一家优先同商圈

### 6.3 情侣/夫妻轻松约会

用户输入：

```text
周末下午想和老婆出去走走，别太赶，找个环境好点的地方吃饭
```

系统应识别：

- 场景：情侣/夫妻
- 偏好：环境好、拍照友好、轻松不赶、氛围稳定
- 约束：避免过吵、避免排队过久、路线不折返

输出要求：

- 可以为高质量地点稍微跨区
- 但必须说明通勤代价
- 餐厅不能只按评分选
- 要考虑排队、噪音、聊天体验

### 6.4 天气影响

用户输入：

```text
今天下雨，下午想带5岁孩子出去玩一会儿，最好室内，晚饭清淡一点
```

系统应识别：

- 天气：雨天
- 场景：亲子
- 偏好：室内、低强度、清淡

输出要求：

- 降低户外景点权重
- 提升商场、展馆、室内亲子权重
- 路线优先打车/地铁方便
- 明确提示雨天对体验的影响

## 7. 核心流程

### 7.1 生成方案流程

```text
用户输入长文本
↓
识别/默认当前位置
↓
LLM 解析意图
↓
Zod schema guard
↓
规则系统补默认值与纠偏
↓
匹配场景规则
↓
召回候选地点
↓
路线估算
↓
营业/饮食/亲子/天气/风险校验
↓
生成候选排序
↓
组合最佳行程
↓
二次校验整份方案
↓
评分与风险披露
↓
保存 Supabase
↓
输出 plan_ready
```

### 7.2 换一家流程

```text
用户点击换一家
↓
识别当前卡片业态和上下文
↓
召回同业态候选
↓
排除当前商家和已替换商家
↓
并发校验营业/饮食/场景/排队
↓
计算与前后地点路线影响
↓
选择最优替代
↓
重算 plan validation
↓
重算 score
↓
保存 Supabase
↓
返回替换收益和代价
```

## 8. 系统架构

```text
Frontend
  ↓
/api/run
  ↓
LLM Intent Parser
  ↓
Rule Normalizer
  ↓
Local Life Data Layer
  ↓
Candidate Retriever
  ↓
Route Engine
  ↓
Constraint Validator
  ↓
Risk Validator
  ↓
Plan Scorer
  ↓
Supabase Persistence
  ↓
SSE plan_ready
```

## 9. 模块职责

### 9.1 LLM Intent Parser

负责：

- 理解生活化长文本
- 提取时间、位置、参与人
- 识别显性偏好
- 推断隐性约束
- 输出业态草稿
- 标注歧义和假设

不负责：

- 最终地点
- 最终路线
- 最终评分
- 安全判断
- 营业判断

### 9.2 Rule Normalizer

负责：

- 默认城市：杭州
- 默认当前位置：mock 位置，西湖区文三路附近
- 默认时间：“下午空的”按 14:00-18:00
- 识别场景规则
- 展开饮食约束
- 修正不合理时间
- 处理歧义

### 9.3 Local Life Data Layer

负责提供 mock 平台数据：

- 地点事实
- 商家评分
- 评论数
- 优惠价值
- 排队风险
- 本地人认可
- 游客店风险
- 亲子画像
- 饮食画像
- 天气敏感性
- 本地避坑信息
- 需实时确认字段

### 9.4 Route Engine

负责：

- 当前位置到第一站距离
- 站点之间距离
- 通勤时间
- 推荐交通方式
- 路线形态
- 步行负担
- 亲子可接受性
- 执行摩擦

### 9.5 Constraint Validator

负责：

- 时间窗口校验
- 营业时间校验
- 最晚入场/最晚返程校验
- 饮食校验
- 亲子校验
- 路线校验
- 天气校验
- 排队风险校验

### 9.6 Risk Validator

负责：

- 安全风险
- 夜间风险
- 雨天风险
- 高温暴晒
- 儿童水边风险
- 步行过长
- 施工/限行
- 节假日拥挤
- 实时数据缺失

### 9.7 Plan Scorer

建议评分维度：

- 距离顺路
- 时间可行
- 场景适配
- 商家可信
- 优惠价值
- 执行摩擦

## 10. 数据集设计

第一版使用 TS mock 数据，不急着进入 Supabase。

### 10.1 Place

地点事实。

```ts
type Place = {
  id: string;
  name: string;
  businessType: string;
  categoryL1: string;
  categoryL2: string;
  categoryL3?: string;
  city: "杭州";
  district: string;
  businessDistrict: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  avgSpendCny?: number;
  operatingStatus: "open" | "temporarily_closed" | "closed" | "unknown";
  openHours: OpenHour[];
  source: "mock" | "osm" | "manual" | "public";
  sourceConfidence: number;
};
```

### 10.2 LocalLifeMetrics

美团化决策指标。

```ts
type LocalLifeMetrics = {
  placeId: string;
  popularityScore: number;
  searchHeatScore: number;
  reviewVelocityScore: number;
  dealAttractivenessScore: number;
  conversionSignalScore: number;
  localUserApprovalScore: number;
  touristTrapRisk: number;
  aiOverrecommendedRisk: number;
  hasDeal: boolean;
  dealTags: string[];
  savedAmountCny?: number;
  reservationSupported: boolean;
  queueSupported: boolean;
  avgQueueMinByHour: Record<string, number>;
};
```

### 10.3 SceneProfile

场景画像。

```ts
type SceneProfile = {
  placeId: string;
  familyWithChildScore: number;
  friendsGatheringScore: number;
  coupleDateScore: number;
  physicalIntensity: 1 | 2 | 3 | 4 | 5;
  relaxationScore: number;
  photoFriendlyScore: number;
  conversationFriendlyScore: number;
  childSafetyScore?: number;
  strollerFriendly: boolean;
  restroomConvenience: 1 | 2 | 3 | 4 | 5;
  noiseLevel: 1 | 2 | 3 | 4 | 5;
  crowdLevelByHour: Record<string, 1 | 2 | 3 | 4 | 5>;
  bestFor: string[];
  avoidFor: string[];
};
```

### 10.4 FoodProfile

饮食画像。

```ts
type FoodProfile = {
  placeId: string;
  cuisines: string[];
  tasteProfile: {
    spicy: 0 | 1 | 2 | 3 | 4 | 5;
    oily: 0 | 1 | 2 | 3 | 4 | 5;
    sweet: 0 | 1 | 2 | 3 | 4 | 5;
    salty: 0 | 1 | 2 | 3 | 4 | 5;
    light: 0 | 1 | 2 | 3 | 4 | 5;
  };
  dietTags: string[];
  mealSuitability: {
    lunch: number;
    dinner: number;
    afternoonTea: number;
    lightMeal: number;
  };
  diningSceneTags: string[];
};
```

### 10.5 RouteProfile

路线证据。

```ts
type RouteProfile = {
  fromPlaceId: string | "user_current_location";
  toPlaceId: string;
  mode: "walk" | "bike" | "drive" | "transit" | "auto";
  distanceMeters: number;
  durationMin: number;
  routeShape:
    | "same_business_district"
    | "same_district"
    | "nearby"
    | "cross_city"
    | "detour";
  frictionLevel: 1 | 2 | 3 | 4 | 5;
  childFriendly: boolean;
  weatherSensitive: boolean;
  trafficRisk: "low" | "medium" | "high";
  explanation: string;
};
```

### 10.6 WeatherRule

天气规则。

```ts
type WeatherRule = {
  condition: "rain" | "heavy_rain" | "hot" | "cold" | "windy";
  affectedTags: string[];
  preferTags: string[];
  penalty: number;
  explanation: string;
};
```

### 10.7 PlaceExecutionDetail

执行细节与诚实机制。

```ts
type PlaceExecutionDetail = {
  placeId: string;
  accessNotes: string[];
  routeDirectionNotes: string[];
  lastEntryTime?: string;
  lastReturnTime?: string;
  localTips: string[];
  knownPitfalls: string[];
  safetyWarnings: string[];
  realTimeSensitiveFields: string[];
  verificationLevel:
    | "mock_verified"
    | "needs_realtime_check"
    | "user_should_confirm";
  confidence: {
    openingHours: number;
    route: number;
    dining: number;
    weather: number;
    safety: number;
  };
};
```

## 11. 二次校验机制

### 11.1 校验分层

每个方案必须经过三层校验。

第一层：结构校验

- LLM JSON 是否符合 schema
- 时间、人数、业态是否合法
- 是否存在明显冲突

第二层：可执行校验

- 时间窗口是否足够
- 地点是否营业
- 路线是否可达
- 通勤是否过长
- 是否有排队风险
- 是否满足饮食约束
- 是否适合儿童/朋友/约会场景

第三层：诚实校验

- 推荐理由是否都有字段来源
- 是否有编造风险
- 是否有实时敏感字段未核验
- 是否需要提示用户确认
- 是否存在安全/天气/节假日风险

### 11.2 校验结果状态

```ts
type VerificationStatus =
  | "verified"
  | "estimated"
  | "needs_realtime_check"
  | "unsafe"
  | "unknown";
```

前端必须区分展示：

```text
已验证
估算
需实时确认
风险
未知
```

## 12. 推荐决策逻辑

### 12.1 推荐排序公式

```text
FinalScore =
  场景适配 * 0.25
+ 距离顺路 * 0.20
+ 商家可信 * 0.20
+ 时间可行 * 0.15
+ 执行摩擦 * 0.10
+ 优惠价值 * 0.10
- 风险惩罚
```

### 12.2 风险惩罚

包括：

- 天气不适配
- 通勤过长
- 排队过久
- 儿童不适合
- 步行负担高
- 游客店风险高
- AI 过度推荐风险
- 节假日拥挤
- 实时数据未核验
- 营业时间置信度低

## 13. 前端体验

### 13.1 首页

展示：

- 用户长文本输入
- 当前 mock 位置
- 天气状态
- 示例输入
- 生成可执行方案按钮

核心文案：

```text
不是生成攻略，而是生成经过校验的本地生活方案
```

### 13.2 方案总览

展示：

- 用户目标
- 时间窗口
- 当前位置
- 总通勤
- 总评分
- 风险数量
- 已验证数量
- 需确认数量

### 13.3 行程卡

展示：

- 时间
- 地点
- 业态
- 地址
- 评分
- 人均
- 推荐理由
- 证据标签
- 风险提示
- 换一家

### 13.4 路线条

展示：

```text
当前位置 → 西湖风景区（断桥）
打车 3.1km · 13 分钟 · 同区移动 · 亲子可接受
```

### 13.5 风险与确认

展示：

```text
已验证：营业时间、路线距离、饮食匹配
估算：排队时间、节假日人流
需确认：真实营业状态、实时天气变化
```

## 14. Supabase 与状态

### 14.1 强规则

```text
只有 plan_ready 后前端才能展示可确认方案
Supabase 写入失败必须中断
未保存方案不能确认执行
```

### 14.2 建议 SSE 状态

```text
parsing_start
parsing_done
candidate_retrieval_start
candidate_retrieval_done
route_validation_start
route_validation_done
risk_validation_start
risk_validation_done
plan_persisted
plan_ready
error
```

## 15. MVP 验收标准

### 15.1 亲子场景

必须：

- 默认 14:00-18:00
- 识别儿童
- 推荐低强度地点
- 推荐清淡餐厅
- 展示路线距离
- 展示亲子适配
- 展示饮食适配
- 不推荐成人娱乐
- 有风险提示

### 15.2 朋友逛街吃饭

必须：

- 先 shopping 后 restaurant
- 餐厅不辣友好
- 同商圈优先
- 展示优惠/团购价值
- 换一家仍保持同商圈优先

### 15.3 情侣/夫妻约会

必须：

- 考虑环境、拍照、聊天、排队
- 可接受轻微跨区但说明代价
- 不只按评分推荐

### 15.4 天气

雨天必须：

- 降低户外权重
- 提升室内/商场/展馆/亲子乐园
- 展示天气影响理由

### 15.5 诚实机制

必须：

- 不编造商家事实
- 不编造路线事实
- 不编造体验项目
- 无法验证时明确标注
- 推荐理由必须可追溯到字段
- 最终方案必须二次校验

## 16. 实施顺序

### Phase 1：诚实数据层

- 补 `PlaceExecutionDetail`
- 补 `aiOverrecommendedRisk`
- 补 `verificationLevel`
- 补 `knownPitfalls`
- 补 `realTimeSensitiveFields`
- 扩充杭州全城 mock 数据

### Phase 2：Planner 重构

- LLM 只输出意图草稿
- 规则召回地点
- route-engine 计算路线
- validator 做二次校验
- scorer 生成美团化评分

### Phase 3：UI 重构

- 增加路线条
- 增加证据链
- 增加风险条
- 增加需确认项
- 增加换一家收益/代价对比

### Phase 4：黄金测试

建立至少 30 条测试：

- 亲子
- 朋友
- 夫妻
- 饮食
- 天气
- 跨区
- 只吃饭
- 只逛街
- 节假日
- 换一家

## 17. 最终判断

MiniClaw 的价值不是让 AI 更会写攻略，而是让 AI 在平台规则下变得诚实、可控、可执行。

最终产品形态应该是：

```text
AI 提出可能性
平台验证可行性
规则限制不确定性
数据支撑推荐理由
系统披露风险与假设
用户看到收益和代价
```

这就是本地生活平台 Agent 和通用大模型攻略生成器的本质区别。
