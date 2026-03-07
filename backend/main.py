"""
Trajectory Viewer Backend - FastAPI Service
提供轨迹数据的 REST API
支持多种轨迹数据格式（逆合成 / WebShop / ALFWorld）
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
import json
from pathlib import Path
from trajectory_adapters import TrajectoryLoader
from exporters import MarkdownExporter, PromptExporter, PdfExporter

app = FastAPI(title="Trajectory Viewer API", version="2.2.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 托管前端静态文件（必须在所有 API 路由注册之后挂载）
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

# 全局变量存储轨迹数据
trajectory_loader = TrajectoryLoader()
processed_trajectories = []
_loaded_data_sources = []


# ── Pydantic Models ────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str
    thought: Optional[str] = None
    action: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class TrajectoryInfo(BaseModel):
    id: str
    task: str
    status: str
    steps: int
    task_type: str


class TrajectoryDetail(BaseModel):
    id: str
    task: str
    status: str
    steps: int
    task_type: str
    messages: List[Message]
    environment: str
    metadata: Optional[Dict[str, Any]] = None


# ── Data Source Resolution ────────────────────────────────────────────────

def _resolve_data_sources() -> List[Dict[str, Any]]:
    """解析数据源配置，合并 data_sources.json 和默认内置路径"""
    base_path = Path(__file__).parent.parent
    sources = []

    # 1. 从 data_sources.json 加载
    ds_config_path = Path(__file__).parent / "data_sources.json"
    if ds_config_path.exists():
        try:
            with open(ds_config_path, 'r') as f:
                config = json.load(f)
            for src in config.get('data_sources', []):
                if not src.get('enabled', True):
                    continue
                src_path = src.get('path', '')
                fmt = src.get('type', None)
                p = Path(src_path)
                if not p.is_absolute():
                    p = base_path / src_path
                if p.is_dir():
                    direct_files = sorted(p.glob('rollout_*.jsonl'))
                    if direct_files:
                        for jf in direct_files:
                            sources.append({'name': f"{p.name}/{jf.name}", 'path': jf, 'type': fmt or 'webshop_rl_jsonl'})
                    else:
                        for subdir in sorted(p.iterdir()):
                            if not subdir.is_dir():
                                continue
                            sub_files = sorted(subdir.glob('rollout_*.jsonl'))
                            if sub_files:
                                for jf in sub_files:
                                    sources.append({'name': f"{subdir.name}/{jf.name}", 'path': jf, 'type': fmt or 'webshop_rl_jsonl'})
                                print(f"Found {len(sub_files)} rollout files in {subdir.name}")
                else:
                    sources.append({'name': src.get('name', src_path), 'path': p, 'type': fmt})
        except Exception as e:
            print(f"Warning: Failed to read data_sources.json: {e}")

    # 2. 默认内置数据源（retro_traj）
    app_path = Path("/app")
    if app_path.exists() and (app_path / "retro_traj").exists():
        sources.append({'name': 'Retrosynthesis (Docker)', 'path': app_path / "retro_traj", 'type': None})
    else:
        retro_path = base_path / "retro_traj"
        if retro_path.exists():
            sources.append({'name': 'Retrosynthesis', 'path': retro_path, 'type': None})

    # 3. 环境变量额外数据源
    extra = os.environ.get('TRAJ_VIEWER_EXTRA_SOURCES', '')
    if extra:
        for ep in extra.split(','):
            ep = ep.strip()
            if ep:
                sources.append({'name': f'Extra: {Path(ep).name}', 'path': Path(ep), 'type': None})

    return sources


def _load_all_sources(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """从多个数据源加载轨迹，返回字典列表"""
    all_trajs = []
    for src in sources:
        data_path = src['path']
        fmt = src.get('type')
        if not data_path.exists():
            print(f"Warning: Data source not found: {data_path} ({src['name']})")
            continue
        try:
            trajectories = trajectory_loader.load(data_path, format_type=fmt)
            for traj in trajectories:
                all_trajs.append(traj.to_dict())
            print(f"Loaded {len(trajectories)} trajectories from {src['name']}")
        except Exception as e:
            print(f"Warning: Failed to load {src['name']} ({data_path}): {e}")
    return all_trajs


# ── Startup ───────────────────────────────────────────────────────────────

@app.on_event("startup")
async def load_data():
    global processed_trajectories, _loaded_data_sources
    _loaded_data_sources = _resolve_data_sources()
    processed_trajectories = _load_all_sources(_loaded_data_sources)
    print(f"Total processed trajectories: {len(processed_trajectories)}")


# ── Health Check ──────────────────────────────────────────────────────────

@app.get("/")
@app.get("/health")
async def root():
    return {
        "status": "ok",
        "message": "Trajectory Viewer API is running",
        "trajectories_loaded": len(processed_trajectories)
    }


# ── Trajectory List & Detail ──────────────────────────────────────────────

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
    if not processed_trajectories:
        return []

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
        filtered = [t for t in filtered if t.get('metadata', {}).get('source_file') == source_file]

    results = filtered[skip:skip + limit]
    return [
        TrajectoryInfo(id=t['id'], task=t['task'], status=t['status'], steps=t['steps'], task_type=t['task_type'])
        for t in results
    ]


@app.get("/api/trajectories/{trajectory_id}", response_model=TrajectoryDetail)
async def get_trajectory_detail(trajectory_id: str):
    trajectory = next((t for t in processed_trajectories if t['id'] == trajectory_id), None)
    if not trajectory:
        raise HTTPException(status_code=404, detail="Trajectory not found")
    return TrajectoryDetail(
        id=trajectory['id'], task=trajectory['task'], status=trajectory['status'],
        steps=trajectory['steps'], task_type=trajectory['task_type'],
        messages=trajectory['messages'], environment=trajectory['environment'],
        metadata=trajectory.get('metadata')
    )


# ── Statistics ────────────────────────────────────────────────────────────

@app.get("/api/statistics")
async def get_statistics():
    if not processed_trajectories:
        return {"total": 0, "by_status": {}, "by_task_type": {}, "by_source": {}, "avg_steps": 0, "by_task_type_detail": {}}

    total = len(processed_trajectories)
    by_status = {}
    for t in processed_trajectories:
        by_status[t['status']] = by_status.get(t['status'], 0) + 1

    by_task_type = {}
    for t in processed_trajectories:
        by_task_type[t['task_type']] = by_task_type.get(t['task_type'], 0) + 1

    by_source = {}
    for t in processed_trajectories:
        source = t['metadata'].get('source', 'unknown')
        by_source[source] = by_source.get(source, 0) + 1

    avg_steps = sum(t['steps'] for t in processed_trajectories) / total

    # 按 task_type 分组的详细统计（逆合成专用字段）
    by_task_type_detail = {}
    groups: Dict[str, list] = {}
    for t in processed_trajectories:
        groups.setdefault(t['task_type'], []).append(t)

    for tt, trajs in groups.items():
        count = len(trajs)
        success_count = sum(1 for t in trajs if t['status'] == 'success')
        steps_list = [t['steps'] for t in trajs]
        avg_s = sum(steps_list) / count if count > 0 else 0
        steps_dist = {"2-4": 0, "5-8": 0, "9-12": 0, "13+": 0}
        for s in steps_list:
            if s <= 4: steps_dist["2-4"] += 1
            elif s <= 8: steps_dist["5-8"] += 1
            elif s <= 12: steps_dist["9-12"] += 1
            else: steps_dist["13+"] += 1

        gt_lengths = [t['metadata'].get('ground_truth_length') or 0 for t in trajs]
        pathway_dist = {"1-2": 0, "3-4": 0, "5-6": 0, "7+": 0}
        for gl in gt_lengths:
            if gl <= 0: continue
            if gl <= 2: pathway_dist["1-2"] += 1
            elif gl <= 4: pathway_dist["3-4"] += 1
            elif gl <= 6: pathway_dist["5-6"] += 1
            else: pathway_dist["7+"] += 1

        by_task_type_detail[tt] = {
            "count": count, "success_count": success_count,
            "avg_steps": round(avg_s, 2),
            "steps_distribution": steps_dist,
            "pathway_length_distribution": pathway_dist,
        }

    return {
        "total": total, "by_status": by_status, "by_task_type": by_task_type,
        "by_source": by_source, "avg_steps": round(avg_steps, 2),
        "by_task_type_detail": by_task_type_detail
    }


# ── Data Sources ──────────────────────────────────────────────────────────

@app.get("/api/data-sources")
async def get_data_sources():
    sources = {}
    for traj in processed_trajectories:
        source = traj['metadata'].get('source', 'unknown')
        if source not in sources:
            sources[source] = {'count': 0, 'format': source, 'sample_id': traj['id']}
        sources[source]['count'] += 1
    return {'total_sources': len(sources), 'sources': list(sources.values())}


@app.get("/api/source-files")
async def get_source_files():
    """获取所有已加载轨迹的来源文件列表（用于按文件筛选）"""
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


# ── Retrosynthesis: Molecule Comparison ───────────────────────────────────

@app.get("/api/molecules")
async def get_target_molecules():
    """获取所有目标分子及其轨迹数量（逆合成专用）"""
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
        {'target_molecule': mol, 'count': info['count'], 'success_count': info['success_count']}
        for mol, info in sorted(molecule_map.items(), key=lambda x: x[1]['count'], reverse=True)
    ]


@app.get("/api/molecules/compare")
async def compare_trajectories(target_molecule: str = Query(...)):
    """获取同一目标分子的所有轨迹，用于多轨迹对比展示"""
    matching = [
        t for t in processed_trajectories
        if t['task_type'].startswith('retrosynthesis')
        and t['metadata'].get('target_molecule') == target_molecule
    ]
    result = []
    for traj in matching:
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
            'id': traj['id'], 'status': traj['status'],
            'total_reward': traj['metadata'].get('total_reward', 0),
            'total_steps': traj['steps'],
            'pathway_length': traj['metadata'].get('pathway_length', 0),
            'final_pathway': traj['metadata'].get('final_pathway', []),
            'steps': steps,
        })
    result.sort(key=lambda x: (-int(x['status'] == 'success'), -x['total_reward']))
    return {'target_molecule': target_molecule, 'trajectories': result}


# ── Hot Reload ────────────────────────────────────────────────────────────

@app.post("/api/reload")
async def reload_data():
    """重新加载所有数据源（不重启服务）"""
    global processed_trajectories, _loaded_data_sources
    old_count = len(processed_trajectories)
    _loaded_data_sources = _resolve_data_sources()
    processed_trajectories = _load_all_sources(_loaded_data_sources)
    new_count = len(processed_trajectories)
    return {'status': 'ok', 'previous_count': old_count, 'current_count': new_count, 'delta': new_count - old_count}


@app.post("/api/add-source")
async def add_data_source(path: str = Query(..., description="数据源路径")):
    """动态添加一个数据源并立即加载"""
    global processed_trajectories, _loaded_data_sources
    data_path = Path(path)
    if not data_path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")
    src = {'name': f'Dynamic: {data_path.name}', 'path': data_path, 'type': None}
    _loaded_data_sources.append(src)
    try:
        new_trajs = _load_all_sources([src])
        processed_trajectories.extend(new_trajs)
        return {'status': 'ok', 'added': len(new_trajs), 'total': len(processed_trajectories)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Trajectory Groups (WebShop RL) ────────────────────────────────────────

@app.get("/api/trajectory-groups")
async def get_trajectory_groups(
    source: Optional[str] = Query(None, description="按数据源过滤，如 webshop_rl"),
):
    """按任务(group_id)分组返回轨迹，分析同一任务下不同轨迹的差异"""
    from collections import defaultdict
    groups = defaultdict(list)
    for traj in processed_trajectories:
        meta = traj.get('metadata', {})
        traj_source = meta.get('source', 'unknown')
        if source and traj_source != source:
            continue
        group_id = meta.get('group_id', traj.get('task', '')[:60])
        actions, step_rewards = [], []
        for msg in traj.get('messages', []):
            if msg.get('role') == 'agent' and msg.get('action'):
                actions.append(msg['action'])
                step_rewards.append(msg.get('metadata', {}).get('reward', 0.0))
        groups[group_id].append({
            'id': traj['id'], 'task': traj['task'], 'status': traj['status'],
            'steps': traj['steps'], 'total_reward': meta.get('total_reward', 0.0),
            'traj_index': meta.get('traj_index', 0), 'source': traj_source,
            'exp_tag': meta.get('exp_tag', ''), 'actions': actions, 'step_rewards': step_rewards,
        })

    group_list = []
    for group_id, trajs in groups.items():
        rewards = [t['total_reward'] for t in trajs]
        avg_r = sum(rewards) / len(rewards) if rewards else 0.0
        std_r = (sum((r - avg_r) ** 2 for r in rewards) / len(rewards)) ** 0.5 if len(rewards) > 1 else 0.0
        group_list.append({
            'group_id': group_id, 'task': trajs[0]['task'] if trajs else '',
            'count': len(trajs), 'reward_mean': avg_r,
            'reward_max': max(rewards) if rewards else 0.0,
            'reward_min': min(rewards) if rewards else 0.0,
            'reward_std': std_r,
            'success_count': sum(1 for t in trajs if t['status'] == 'success'),
            'trajectories': sorted(trajs, key=lambda x: x['total_reward'], reverse=True),
        })
    group_list.sort(key=lambda x: x['reward_mean'], reverse=True)
    return {'total_groups': len(group_list), 'groups': group_list}


# ── Training Metrics ──────────────────────────────────────────────────────

@app.get("/api/training-metrics")
async def get_training_metrics(
    metrics_path: Optional[str] = Query(None, description="训练指标JSON文件路径"),
):
    """返回训练过程中的 step-level 指标（奖励曲线、valid_action_ratio 等）"""
    if not metrics_path:
        default = Path("/root/testttt/RLVMR/Trajectory-Tracer/webshop_rl_traj/rl_trajectories_metrics.json")
        if default.exists():
            metrics_path = str(default)
        else:
            return {'steps': [], 'message': 'No metrics file found'}
    p = Path(metrics_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Metrics file not found: {metrics_path}")
    with open(p, 'r') as f:
        metrics = json.load(f)
    return {'steps': metrics, 'total_steps': len(metrics)}


# ── Prompt Catalog ────────────────────────────────────────────────────────

@app.get("/api/prompts")
async def get_prompts():
    """返回所有 Prompt 模板的结构化目录（含元数据分析）"""
    from prompt_catalog import build_prompt_catalog
    return build_prompt_catalog()


# ── Export ────────────────────────────────────────────────────────────────

@app.get("/api/trajectories/{trajectory_id}/export")
async def export_trajectory(
    trajectory_id: str,
    format: str = Query("markdown", pattern="^(markdown|prompt|pdf)$")
):
    """导出轨迹为指定格式（markdown / prompt / pdf）"""
    trajectory = next((t for t in processed_trajectories if t['id'] == trajectory_id), None)
    if not trajectory:
        raise HTTPException(status_code=404, detail="Trajectory not found")
    safe_id = trajectory_id.replace('/', '_').replace('\\', '_')

    if format == "markdown":
        content = MarkdownExporter.generate(trajectory)
        return Response(content=content.encode('utf-8'), media_type="text/markdown",
                        headers={"Content-Disposition": f'attachment; filename="trajectory_{safe_id}.md"'})
    elif format == "prompt":
        content = PromptExporter.generate(trajectory)
        return Response(content=json.dumps(content, ensure_ascii=False, indent=2).encode('utf-8'),
                        media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="trajectory_{safe_id}_prompt.json"'})
    elif format == "pdf":
        pdf_bytes = PdfExporter.generate(trajectory)
        return Response(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="trajectory_{safe_id}.pdf"'})


# ── Frontend Static Files (SPA) ───────────────────────────────────────────
# 必须放在所有 API 路由之后

if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """对所有非 /api 路径返回 index.html（SPA 路由支持）"""
        return FileResponse(str(_FRONTEND_DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
