# Trajectory Tracer

> 多类型智能体轨迹可视化工具，支持 ALFWorld、逆合成规划等多种轨迹格式

一个美观、高效的 Web 应用，用于可视化和分析大规模智能体轨迹数据，将复杂的对话式轨迹、化学逆合成路径转化为易于理解的交互界面。

## ✨ 特性

- 🎯 **对话式展示**: 左右对话气泡形式，清晰展示智能体思考和环境反馈
- 🧪 **逆合成树可视化**: 交互式树形图展示逆合成路径，支持展开/折叠节点
- ⚗️ **分子结构渲染**: 基于 RDKit.js WASM，在浏览器端实时渲染 SMILES 分子结构图
- 🔄 **轨迹对比**: 并排对比多条轨迹的合成路径与搜索过程
- 🔍 **高级筛选**: 支持按状态、任务类型、步数范围等多维度筛选
- 📊 **统计面板**: 实时展示成功率、平均步数、奖励分布等统计信息
- 🎨 **精美 UI**: 基于 TailwindCSS，现代化设计，响应式布局
- ⚡ **高性能**: 虚拟滚动技术，轻松处理数万条轨迹
- 🐳 **一键部署**: Docker Compose 快速部署到服务器
- 🔌 **多格式支持**: 适配器模式支持 HuggingFace、REBEL JSON、逆合成 JSONL 等多种格式

## 🏗️ 技术栈

### 后端
- **FastAPI**: 高性能 Python Web 框架
- **Uvicorn**: ASGI 服务器
- **Datasets**: HuggingFace 数据集处理（可选）

### 前端
- **React 18**: UI 框架
- **Zustand**: 轻量级状态管理
- **TailwindCSS**: 原子化 CSS 框架
- **Vite**: 快速构建工具
- **RDKit.js**: WebAssembly 化学信息学库，用于分子结构渲染

### 部署
- **Docker**: 容器化
- **Nginx**: 反向代理和静态文件服务

## 📦 项目结构

```
Trajectory-Tracer/
├── backend/                         # 后端服务
│   ├── main.py                      # FastAPI 主应用
│   ├── trajectory_adapters.py       # 轨迹格式适配器（含逆合成适配器）
│   ├── data_sources.json            # 数据源配置
│   ├── requirements.txt             # Python 依赖
│   └── Dockerfile                   # 后端 Docker 配置
├── frontend/                        # 前端应用
│   ├── public/
│   │   ├── RDKit_minimal.js         # RDKit WASM 包装器
│   │   └── RDKit_minimal.wasm       # RDKit WebAssembly 模块
│   └── src/
│       ├── components/
│       │   ├── Header.jsx
│       │   ├── FilterPanel.jsx
│       │   ├── TrajectoryList.jsx
│       │   ├── TrajectoryViewer.jsx
│       │   ├── MessageBubble.jsx
│       │   ├── StatsPanel.jsx       # 统计面板
│       │   └── retrosynthesis/      # 逆合成专用组件
│       │       ├── RetrosynthesisTree.jsx      # 交互式合成路径树
│       │       ├── MoleculeRenderer.jsx        # 分子结构渲染
│       │       └── TrajectoryComparison.jsx    # 轨迹对比视图
│       ├── utils/
│       │   ├── buildRetrosynthesisTree.js      # 树结构构建工具
│       │   └── rdkitInstance.js                # RDKit 单例管理
│       ├── App.jsx                  # 主应用
│       ├── store.js                 # Zustand 状态管理
│       └── main.jsx                 # 入口文件
├── alfworld_expert_traj/            # ALFWorld 轨迹数据目录
├── retro_traj/                      # 逆合成轨迹数据目录
│   └── example01.jsonl              # 示例逆合成轨迹
├── docker-compose.yml               # Docker Compose 配置
├── start.sh                         # Linux/macOS 一键启动脚本
├── start.bat                        # Windows 启动脚本
├── start.ps1                        # Windows PowerShell 启动脚本
├── README.md
├── ADDING_NEW_TRAJECTORY_TYPES.md   # 添加新格式指南
└── TESTING.md                       # 测试文档
```

## 🚀 快速开始

### 方式 1: 一键启动脚本

**Linux / macOS**
```bash
chmod +x start.sh && ./start.sh
```

**Windows (PowerShell)**
```powershell
./start.ps1
```

**Windows (批处理)**
```bat
start.bat
```

### 方式 2: Docker 部署

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

访问 `http://localhost` 即可使用。

### 方式 3: 本地开发

**后端**
```bash
cd backend
pip install -r requirements.txt
python main.py
# 后端运行在 http://localhost:8000
```

**前端**
```bash
cd frontend
npm install
npm run dev
# 前端运行在 http://localhost:3000
```

## 📖 使用说明

### 浏览轨迹列表

左侧面板显示所有轨迹：
- **绿色勾**: 成功的轨迹
- **红色叉**: 失败的轨迹
- **问号**: 状态未知的轨迹

### 筛选轨迹

- **状态**: 成功 / 失败 / 未知
- **任务类型**: ALFWorld 任务类型（put / clean / heat 等）或 retrosynthesis
- **步数范围**: 设置最小和最大步数

### 查看 ALFWorld 轨迹

点击列表中的 ALFWorld 轨迹，右侧显示对话详情：
- **任务卡片**: 任务目标、环境描述、统计信息
- **对话气泡**: 左侧为环境反馈，右侧为智能体思考和动作

### 查看逆合成轨迹

点击逆合成轨迹，右侧显示：
- **目标分子**: SMILES 结构渲染和基本信息（总步数、总奖励、路径长度等）
- **逆合成路径树**: 可交互的树形图，每个节点为分子结构，点击可展开/折叠子路径
- **轨迹对比**: 并排比较不同轨迹的搜索路径和最终合成方案

### 统计面板

顶部统计面板实时显示当前数据集的：
- 总轨迹数、成功率
- 平均步数、奖励分布
- 各数据源信息

## 🔌 API 接口

### 获取轨迹列表
```
GET /api/trajectories?skip=0&limit=50&status=success&task_type=retrosynthesis&min_steps=5&max_steps=50
```

### 获取轨迹详情
```
GET /api/trajectories/{trajectory_id}
```

### 获取统计信息
```
GET /api/statistics
```

### 获取数据源信息
```
GET /api/data-sources
```

## 📊 数据格式

本项目支持多种轨迹数据格式，通过适配器模式实现统一接口。

### 支持的格式

#### 1. HuggingFace Datasets 格式

```json
{
  "conversations": [
    { "from": "human", "value": "任务描述", "loss": false },
    { "from": "gpt",   "value": "智能体回复", "loss": true }
  ],
  "item_id": "唯一标识"
}
```

#### 2. REBEL JSON 格式

```json
{
  "task": "任务描述",
  "done": "True",
  "data": [
    {
      "step": 1,
      "obs": "环境观察",
      "response": "<belief>...</belief><reasoning>...</reasoning><action>...</action>"
    }
  ]
}
```

#### 3. 逆合成 JSONL 格式（SFT / RL 训练轨迹）

```json
{
  "trajectory_id": "uuid",
  "target_molecule": "CCc1cnc(...)o1",
  "success": true,
  "total_steps": 15,
  "total_reward": 21.46,
  "pathway_length": 3,
  "final_pathway": ["product1>>reactant1.reactant2", "..."],
  "anchor_states": [
    {
      "step": 0,
      "unsolved_molecules": ["SMILES..."],
      "state_hash": "7c122b73d903"
    }
  ],
  "steps": [
    {
      "step_index": 0,
      "role": "user",
      "content": "工具调用内容"
    }
  ]
}
```

> 同时支持 RL 训练轨迹格式（`anchor_states` + 工具调用步骤），适配器会自动从步骤数据中重建合成路径。

### 添加新格式

参考详细指南：[如何添加新的轨迹类型](./ADDING_NEW_TRAJECTORY_TYPES.md)

简要步骤：
1. 在 `backend/trajectory_adapters.py` 中创建新的适配器类，继承 `TrajectoryAdapter`
2. 实现 `load()` 和 `parse()` 方法
3. 在 `TrajectoryLoader` 中注册适配器
4. 在 `backend/data_sources.json` 中配置数据源

## 🔧 配置

### 数据源配置

编辑 `backend/data_sources.json`：
```json
[
  {
    "name": "我的数据集",
    "type": "retrosynthesis_jsonl",
    "path": "../retro_traj/my_data.jsonl"
  },
  {
    "name": "ALFWorld数据",
    "type": "rebel_json",
    "path": "../alfworld_expert_traj"
  }
]
```

支持的 `type` 值：
- `huggingface` - HuggingFace Datasets 格式
- `rebel_json` - REBEL JSON 格式
- `retrosynthesis_jsonl` - 逆合成 SFT 格式
- `retrosynthesis_jsonl_0223` - 逆合成 RL 训练格式（0223版）
- `retrosynthesis_jsonl_dir` - 逆合成 JSONL 目录（自动检测格式）

### Docker 端口配置

编辑 `docker-compose.yml`：
```yaml
services:
  frontend:
    ports:
      - "80:80"      # 修改左侧端口更改访问端口
  backend:
    ports:
      - "8000:8000"
```

## 🚀 生产部署建议

### 使用反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://localhost:80;
    }
}
```

### 启用 HTTPS

```bash
certbot --nginx -d your-domain.com
```

### 监控和日志

```bash
docker-compose ps
docker stats
docker-compose logs > app.log
```

## 🔮 后续计划

- [x] 支持多种数据格式（适配器模式）
- [x] 逆合成轨迹可视化（树形图 + 分子渲染）
- [x] 轨迹对比功能
- [x] 统计面板
- [ ] 支持导出为 PDF / 图片
- [ ] 实现轨迹播放模式（动画展示）
- [ ] 添加全文搜索功能
- [ ] 接入 Benchmark 系统
- [ ] 支持更多轨迹格式（CSV、数据库等）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License
