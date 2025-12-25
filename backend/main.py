"""
Trajectory Viewer Backend - FastAPI Service
提供轨迹数据的 REST API
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datasets import load_from_disk
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
from pathlib import Path

app = FastAPI(title="Trajectory Viewer API", version="1.0.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境需要限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量存储数据集
dataset = None
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


def parse_trajectory(item: Dict[str, Any], idx: int) -> Dict[str, Any]:
    """
    解析单条轨迹数据
    将对话格式转换为结构化数据
    """
    conversations = item['conversations']
    messages = []

    task = ""
    environment = ""
    task_type = "unknown"

    for conv in conversations:
        role = 'human' if conv['from'] == 'human' else 'agent'
        value = conv['value']

        # 提取任务信息
        if 'Your task is to:' in value:
            task_start = value.find('Your task is to:') + len('Your task is to:')
            task_end = value.find('\n', task_start) if '\n' in value[task_start:] else len(value)
            task = value[task_start:task_end].strip()

            # 提取任务类型（使用第一个单词作为类型）
            first_word = task.split()[0].lower() if task else 'unknown'
            # 支持的任务类型: put, clean, heat, cool, find, examine, use
            if first_word in ['put', 'clean', 'heat', 'cool', 'find', 'examine', 'use']:
                task_type = first_word
            else:
                task_type = 'other'

            # 提取环境描述
            env_end = value.find('Your task is to:')
            environment = value[:env_end].strip() if env_end > 0 else ""

        # 解析 agent 的思考和动作
        if role == 'agent' and 'Thought:' in value:
            parts = value.split('Action:')
            thought = parts[0].replace('Thought:', '').strip()
            action = parts[1].strip() if len(parts) > 1 else ""

            messages.append(Message(
                role=role,
                content=value,
                thought=thought,
                action=action
            ))
        elif role == 'agent' and 'Action:' in value:
            # 只有动作，没有思考
            action = value.replace('Action:', '').strip()
            messages.append(Message(
                role=role,
                content=value,
                thought=None,
                action=action
            ))
        else:
            messages.append(Message(
                role=role,
                content=value,
                thought=None,
                action=None
            ))

    # 判断是否成功（简单启发式：最后一条消息包含成功相关词汇）
    last_message = conversations[-1]['value'].lower() if conversations else ""
    status = 'success' if any(word in last_message for word in ['succeed', 'success', 'task completed', 'congratulations']) else 'unknown'

    return {
        'id': f"traj_{idx:05d}",
        'task': task,
        'status': status,
        'steps': len([m for m in messages if m.role == 'agent' and m.action]),
        'task_type': task_type,
        'messages': messages,
        'environment': environment,
        'item_id': item.get('item_id', '')
    }


@app.on_event("startup")
async def load_data():
    """启动时加载数据集"""
    global dataset, processed_trajectories

    dataset_path = Path(__file__).parent.parent / "alfworld_expert_traj"

    if not dataset_path.exists():
        print(f"Warning: Dataset not found at {dataset_path}")
        return

    print(f"Loading dataset from {dataset_path}...")
    dataset = load_from_disk(str(dataset_path))
    print(f"Dataset loaded: {len(dataset)} trajectories")

    # 预处理所有轨迹
    print("Processing trajectories...")
    for idx, item in enumerate(dataset):
        processed_trajectories.append(parse_trajectory(item, idx))

    print(f"Processed {len(processed_trajectories)} trajectories")


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

    # 平均步数
    total_steps = sum(t['steps'] for t in processed_trajectories)
    avg_steps = total_steps / total if total > 0 else 0

    return {
        "total": total,
        "by_status": by_status,
        "by_task_type": by_task_type,
        "avg_steps": round(avg_steps, 2)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
