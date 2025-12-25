"""
Trajectory Viewer Backend - FastAPI Service
提供轨迹数据的 REST API
支持多种轨迹数据格式
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
from pathlib import Path
from trajectory_adapters import TrajectoryLoader

app = FastAPI(title="Trajectory Viewer API", version="2.0.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境需要限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量存储轨迹数据
trajectory_loader = TrajectoryLoader()
processed_trajectories = []


class Message(BaseModel):
    """单条消息"""
    role: str  # 'human' 或 'agent'
    content: str
    thought: Optional[str] = None
    action: Optional[str] = None


class TrajectoryInfo(BaseModel):
    """轨迹基本信息"""
    id: str
    task: str
    status: str  # 'success' 或 'failed'
    steps: int
    task_type: str


class TrajectoryDetail(BaseModel):
    """轨迹详细信息"""
    id: str
    task: str
    status: str
    steps: int
    task_type: str
    messages: List[Message]
    environment: str




@app.on_event("startup")
async def load_data():
    """启动时加载数据集"""
    global processed_trajectories

    # 定义数据源路径
    base_path = Path(__file__).parent.parent
    data_sources = [
        base_path / "alfworld_expert_traj",  # HuggingFace dataset
        base_path / "alfworld_expert_traj" / "rebel_coldstart_clean.json",  # REBEL JSON
    ]

    # 加载所有可用的数据源
    for data_path in data_sources:
        if data_path.exists():
            try:
                trajectories = trajectory_loader.load(data_path)
                # 转换为字典格式以保持向后兼容
                for traj in trajectories:
                    processed_trajectories.append(traj.to_dict())
                print(f"Loaded {len(trajectories)} trajectories from {data_path.name}")
            except Exception as e:
                print(f"Warning: Failed to load {data_path}: {e}")
        else:
            print(f"Warning: Data source not found at {data_path}")

    print(f"Total processed trajectories: {len(processed_trajectories)}")


@app.get("/")
async def root():
    """健康检查"""
    return {
        "status": "ok",
        "message": "Trajectory Viewer API is running",
        "trajectories_loaded": len(processed_trajectories)
    }


@app.get("/api/trajectories", response_model=List[TrajectoryInfo])
async def get_trajectories(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, regex="^(success|failed|unknown)$"),
    task_type: Optional[str] = Query(None),
    min_steps: Optional[int] = Query(None, ge=0),
    max_steps: Optional[int] = Query(None, ge=0),
):
    """
    获取轨迹列表（支持分页和筛选）
    """
    if not processed_trajectories:
        return []

    # 筛选
    filtered = processed_trajectories

    if status:
        filtered = [t for t in filtered if t['status'] == status]

    if task_type:
        filtered = [t for t in filtered if t['task_type'] == task_type]

    if min_steps is not None:
        filtered = [t for t in filtered if t['steps'] >= min_steps]

    if max_steps is not None:
        filtered = [t for t in filtered if t['steps'] <= max_steps]

    # 分页
    total = len(filtered)
    results = filtered[skip:skip + limit]

    # 转换为响应模型
    return [
        TrajectoryInfo(
            id=t['id'],
            task=t['task'],
            status=t['status'],
            steps=t['steps'],
            task_type=t['task_type']
        )
        for t in results
    ]


@app.get("/api/trajectories/{trajectory_id}", response_model=TrajectoryDetail)
async def get_trajectory_detail(trajectory_id: str):
    """
    获取单条轨迹的详细信息
    """
    # 查找轨迹
    trajectory = next((t for t in processed_trajectories if t['id'] == trajectory_id), None)

    if not trajectory:
        raise HTTPException(status_code=404, detail="Trajectory not found")

    return TrajectoryDetail(
        id=trajectory['id'],
        task=trajectory['task'],
        status=trajectory['status'],
        steps=trajectory['steps'],
        task_type=trajectory['task_type'],
        messages=trajectory['messages'],
        environment=trajectory['environment']
    )


@app.get("/api/statistics")
async def get_statistics():
    """
    获取统计信息
    """
    if not processed_trajectories:
        return {
            "total": 0,
            "by_status": {},
            "by_task_type": {},
            "by_source": {},
            "avg_steps": 0
        }

    total = len(processed_trajectories)

    # 按状态统计
    by_status = {}
    for t in processed_trajectories:
        status = t['status']
        by_status[status] = by_status.get(status, 0) + 1

    # 按任务类型统计
    by_task_type = {}
    for t in processed_trajectories:
        task_type = t['task_type']
        by_task_type[task_type] = by_task_type.get(task_type, 0) + 1

    # 按数据源统计
    by_source = {}
    for t in processed_trajectories:
        source = t['metadata'].get('source', 'unknown')
        by_source[source] = by_source.get(source, 0) + 1

    # 平均步数
    total_steps = sum(t['steps'] for t in processed_trajectories)
    avg_steps = total_steps / total if total > 0 else 0

    return {
        "total": total,
        "by_status": by_status,
        "by_task_type": by_task_type,
        "by_source": by_source,
        "avg_steps": round(avg_steps, 2)
    }


@app.get("/api/data-sources")
async def get_data_sources():
    """
    获取已加载的数据源信息
    """
    sources = {}
    for traj in processed_trajectories:
        source = traj['metadata'].get('source', 'unknown')
        if source not in sources:
            sources[source] = {
                'count': 0,
                'format': source,
                'sample_id': traj['id']
            }
        sources[source]['count'] += 1

    return {
        'total_sources': len(sources),
        'sources': list(sources.values())
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
