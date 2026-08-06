# 🏄 SUP AI Coach — 桨板训练大脑

> AI 驱动的 SUP（桨板）训练助手：多模态技能评估 → 个性化训练计划 → 每日打卡点评 → 知识库支撑 → 数据可视化总屏。

![Tech](https://img.shields.io/badge/React-19-22D3EE) ![Tech](https://img.shields.io/badge/Hono-4.x-FF6B35) ![Tech](https://img.shields.io/badge/SQLite-better--sqlite3-34D399) ![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 核心功能

| 模块 | 说明 |
|------|------|
| 🧑‍🤝‍🧑 用户系统 | 注册 / 登录（bcrypt + httpOnly session cookie） |
| 📋 身体画像 | 基本信息 + 身体素质指标（身高体重、心率、VO2max、力量/耐力/柔韧/平衡/划桨技术自评） |
| 💬 AI 技能评估 | 流式对话（SSE）+ 多模态上传（图片直传视觉模型 / 视频 ffmpeg 抽帧 / 音频），输出 6 维技能雷达画像 |
| 🎯 目标与计划 | 与用户确认目标后，LLM 生成多阶段周期训练计划（技术/耐力/速度/力量/恢复） |
| ✅ 每日打卡 | 按计划记录实际训练（距离/时长/配速/RPE/感受/照片视频），AI 教练点评 + 优缺点分析 |
| 📚 知识库 | 文字 / 链接 / 图片 / 视频 多模态输入，LLM 解析为结构化知识，支撑训练大脑 |
| 📊 现状总屏 | 核心指标卡 + 技能雷达 + 训练量趋势 + 配速趋势 + 计划进度，层层下钻到每日训练/计划/点评 |
| 🔑 自管 LLM | 用户自填 API Key（OpenAI 兼容协议），AES-256-GCM 加密存储，支持 DeepSeek / Qwen / GLM / OpenAI / Kimi 等 |

## 🚀 快速开始

### 环境要求
- Node.js ≥ 20
- ffmpeg（视频抽帧解析，可选但推荐）

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 构建前端
npm run build

# 3. 启动服务（默认端口 17900，可用 PORT 环境变量覆盖）
npm start
# 或开发模式
npm run dev        # Vite 前端开发（端口 3000，代理 /api 到 8787）
npm run dev:server # tsx watch 后端热重载
```

访问 `http://localhost:17900`，注册账号后在「设置」页配置你的 LLM API Key 即可开始使用。

### 数据与存储
- 数据库：`data/sup.db`（SQLite，WAL 模式，自动建表）
- 上传文件：`data/uploads/`（图片/视频/音频附件）
- API Key 加密密钥：`data/.secret`（首次启动自动生成，请妥善备份）
- 日志：`data/server.log`

## 🧠 LLM 配置

支持任意 OpenAI 兼容接口：

| 服务商 | Base URL | 模型示例 | 视觉 |
|--------|----------|----------|------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` / `deepseek-v4-flash` | ❌ |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` / `qwen-vl-plus` | ✅ VL 系列 |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | ✅ |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | ✅ |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | ❌ |

> 💡 勾选「支持视觉」后，图片直接以 base64 传入多模态模型；视频自动抽 3 帧分析；音频暂存文件（转写为 Roadmap）。

## 🗄️ 数据模型

```
users ── sessions           # 账号与登录会话
  ├── profiles              # 身体画像（一用户一行）
  ├── assessments           # 技能评估会话
  │     └── assessment_messages   # 多轮对话（含附件）
  ├── goals                 # 训练目标
  ├── training_plans        # 训练计划（含阶段结构 phases_json）
  │     └── workouts        # 每日训练任务
  ├── checkins              # 每日打卡（实际训练 + AI 点评）
  ├── metrics               # 指标时间序列（配速/距离/时长/RPE）
  ├── knowledge             # 知识库（多模态 → 结构化 JSON）
  └── llm_settings          # 自管 LLM 配置（Key 加密）
```

## 📁 项目结构

```
server/            # Hono 后端（tsx 直跑）
  ├── index.ts     # 入口：API 路由 + 静态托管 + SPA fallback
  ├── db.ts        # SQLite schema + 迁移
  ├── auth.ts      # session 认证中间件
  ├── llm.ts       # OpenAI 兼容客户端（流式 + 多模态）
  ├── secret.ts    # API Key AES-256-GCM 加密
  ├── uploads.ts   # 文件上传 / 视频抽帧 / 音频元数据
  └── routes/      # auth / profile / assess / plan / checkin / knowledge / dashboard / settings / upload
src/               # React 19 + Vite + shadcn/ui 前端
  ├── pages/       # Login / Dashboard / Assess / Plan / Checkin / Knowledge / Profile / Settings
  └── components/  # Shell 布局（桌面侧栏 + 移动底部导航）+ shadcn/ui 组件
```

## 🧭 Roadmap

- [ ] 音频转写（Whisper 本地接入）
- [ ] 心率带 / 运动手表数据导入
- [ ] 训练计划模板市场（社区共享）
- [ ] 比赛成绩解析（PDF 成绩单导入）
- [ ] 多语言支持

## 📄 License

MIT
