"""
Trajectory Viewer Backend - FastAPI Service
提供轨迹数据的 REST API
支持多种轨迹数据格式
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
from pathlib import Path
from trajectory_adapters import TrajectoryLoader
from exporters import MarkdownExporter, PromptExporter, PdfExporter

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
    metadata: Optional[Dict[str, Any]] = None


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
    metadata: Optional[Dict[str, Any]] = None




@app.on_event("startup")
async def load_data():
    """启动时加载数据集"""
    global processed_trajectories

    # 定义数据源路径（支持本地开发和 Docker 部署）
    base_path = Path(__file__).parent.parent
    app_path = Path("/app")  # Docker 容器内路径

    # 优先使用 Docker 容器内路径，否则使用本地开发路径
    if app_path.exists() and (app_path / "retro_traj").exists():
        # Docker 环境
        data_sources = [
            app_path / "retro_traj",
        ]
    else:
        # 本地开发环境
        data_sources = [
            base_path / "retro_traj",
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
    status: Optional[str] = Query(None, pattern="^(success|failed|unknown)$"),
    task_type: Optional[str] = Query(None),
    min_steps: Optional[int] = Query(None, ge=0),
    max_steps: Optional[int] = Query(None, ge=0),
    source_file: Optional[str] = Query(None),
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

    if source_file:
        filtered = [t for t in filtered if t['metadata'].get('source_file') == source_file]

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
        environment=trajectory['environment'],
        metadata=trajectory.get('metadata')
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
            "avg_steps": 0,
            "by_task_type_detail": {}
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

    # 按 task_type 分组的详细统计
    by_task_type_detail = {}
    groups = {}
    for t in processed_trajectories:
        tt = t['task_type']
        if tt not in groups:
            groups[tt] = []
        groups[tt].append(t)

    for tt, trajs in groups.items():
        count = len(trajs)
        success_count = sum(1 for t in trajs if t['status'] == 'success')
        steps_list = [t['steps'] for t in trajs]
        avg_s = sum(steps_list) / count if count > 0 else 0

        # 步数分桶
        steps_distribution = {"2-4": 0, "5-8": 0, "9-12": 0, "13+": 0}
        for s in steps_list:
            if s <= 4:
                steps_distribution["2-4"] += 1
            elif s <= 8:
                steps_distribution["5-8"] += 1
            elif s <= 12:
                steps_distribution["9-12"] += 1
            else:
                steps_distribution["13+"] += 1

        # GT 路径长度分桶 (ground_truth_length 存在 metadata 中)
        gt_lengths = [t['metadata'].get('ground_truth_length') or 0 for t in trajs]
        pathway_length_distribution = {"1-2": 0, "3-4": 0, "5-6": 0, "7+": 0}
        for gl in gt_lengths:
            if gl <= 0:
                continue  # 跳过无效值
            if gl <= 2:
                pathway_length_distribution["1-2"] += 1
            elif gl <= 4:
                pathway_length_distribution["3-4"] += 1
            elif gl <= 6:
                pathway_length_distribution["5-6"] += 1
            else:
                pathway_length_distribution["7+"] += 1

        by_task_type_detail[tt] = {
            "count": count,
            "success_count": success_count,
            "avg_steps": round(avg_s, 2),
            "steps_distribution": steps_distribution,
            "pathway_length_distribution": pathway_length_distribution,
        }

    return {
        "total": total,
        "by_status": by_status,
        "by_task_type": by_task_type,
        "by_source": by_source,
        "avg_steps": round(avg_steps, 2),
        "by_task_type_detail": by_task_type_detail
    }


@app.get("/api/molecules")
async def get_target_molecules():
    """
    获取所有目标分子及其轨迹数量（逆合成专用）
    """
    molecule_map = {}
    for traj in processed_trajectories:
        if not traj['task_type'].startswith('retrosynthesis'):
            continue
        mol = traj['metadata'].get('target_molecule', '')
        if not mol:
            continue
        if mol not in molecule_map:
            molecule_map[mol] = {'count': 0, 'success_count': 0}
        molecule_map[mol]['count'] += 1
        if traj['status'] == 'success':
            molecule_map[mol]['success_count'] += 1

    return [
        {
            'target_molecule': mol,
            'count': info['count'],
            'success_count': info['success_count'],
        }
        for mol, info in sorted(molecule_map.items(), key=lambda x: x[1]['count'], reverse=True)
    ]


@app.get("/api/molecules/compare")
async def compare_trajectories(target_molecule: str = Query(...)):
    """
    获取同一目标分子的所有轨迹，用于多轨迹对比展示
    返回每条轨迹的逐步奖励数据
    """
    matching = [
        t for t in processed_trajectories
        if t['task_type'].startswith('retrosynthesis')
        and t['metadata'].get('target_molecule') == target_molecule
    ]

    result = []
    for traj in matching:
        # 从 messages 的 metadata 中提取逐步奖励数据
        steps = []
        for msg in traj['messages']:
            if msg['role'] == 'agent' and msg.get('metadata', {}).get('type') == 'agent_action':
                meta = msg['metadata']
                steps.append({
                    'step': meta.get('step', 0),
                    'action_type': meta.get('action_type', 'unknown'),
                    'tool_name': meta.get('tool_name', ''),
                    'reward': meta.get('reward', 0.0),
                    'cumulative_reward': meta.get('cumulative_reward', 0.0),
                    'is_valid_action': meta.get('is_valid_action', False),
                })

        result.append({
            'id': traj['id'],
            'status': traj['status'],
            'total_reward': traj['metadata'].get('total_reward', 0),
            'total_steps': traj['steps'],
            'pathway_length': traj['metadata'].get('pathway_length', 0),
            'final_pathway': traj['metadata'].get('final_pathway', []),
            'steps': steps,
        })

    # 排序：成功轨迹优先，然后按总奖励降序
    result.sort(key=lambda x: (-int(x['status'] == 'success'), -x['total_reward']))

    return {
        'target_molecule': target_molecule,
        'trajectories': result,
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


@app.get("/api/source-files")
async def get_source_files():
    """
    获取所有已加载轨迹的来源文件列表（用于按文件筛选）
    """
    file_map = {}
    for traj in processed_trajectories:
        sf = traj['metadata'].get('source_file', '')
        if not sf:
            continue
        if sf not in file_map:
            file_map[sf] = {'source_file': sf, 'count': 0, 'success_count': 0}
        file_map[sf]['count'] += 1
        if traj['status'] == 'success':
            file_map[sf]['success_count'] += 1

    return sorted(file_map.values(), key=lambda x: x['source_file'])


@app.get("/api/trajectories/{trajectory_id}/export")
async def export_trajectory(
    trajectory_id: str,
    format: str = Query("markdown", pattern="^(markdown|prompt|pdf)$")
):
    """
    导出轨迹为指定格式（markdown / prompt / pdf）
    """
    trajectory = next((t for t in processed_trajectories if t['id'] == trajectory_id), None)
    if not trajectory:
        raise HTTPException(status_code=404, detail="Trajectory not found")

    safe_id = trajectory_id.replace('/', '_').replace('\\', '_')

    if format == "markdown":
        content = MarkdownExporter.generate(trajectory)
        return Response(
            content=content.encode('utf-8'),
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="trajectory_{safe_id}.md"'}
        )
    elif format == "prompt":
        import json as _json
        content = PromptExporter.generate(trajectory)
        return Response(
            content=_json.dumps(content, ensure_ascii=False, indent=2).encode('utf-8'),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="trajectory_{safe_id}_prompt.json"'}
        )
    elif format == "pdf":
        pdf_bytes = PdfExporter.generate(trajectory)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="trajectory_{safe_id}.pdf"'}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
