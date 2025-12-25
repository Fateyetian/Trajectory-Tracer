"""
Trajectory Adapters - 支持多种轨迹数据格式
提供统一的接口来处理不同来源的轨迹数据
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
from datasets import load_from_disk


class Message:
    """统一的消息格式"""
    def __init__(self, role: str, content: str, thought: Optional[str] = None,
                 action: Optional[str] = None, metadata: Optional[Dict] = None):
        self.role = role  # 'human' 或 'agent'
        self.content = content
        self.thought = thought
        self.action = action
        self.metadata = metadata or {}

    def to_dict(self):
        return {
            'role': self.role,
            'content': self.content,
            'thought': self.thought,
            'action': self.action,
            'metadata': self.metadata
        }


class Trajectory:
    """统一的轨迹格式"""
    def __init__(self, id: str, task: str, status: str, steps: int,
                 task_type: str, messages: List[Message], environment: str = "",
                 metadata: Optional[Dict] = None):
        self.id = id
        self.task = task
        self.status = status  # 'success', 'failed', 'unknown'
        self.steps = steps
        self.task_type = task_type
        self.messages = messages
        self.environment = environment
        self.metadata = metadata or {}

    def to_dict(self):
        return {
            'id': self.id,
            'task': self.task,
            'status': self.status,
            'steps': self.steps,
            'task_type': self.task_type,
            'messages': [m.to_dict() for m in self.messages],
            'environment': self.environment,
            'metadata': self.metadata
        }


class TrajectoryAdapter(ABC):
    """轨迹适配器基类"""

    @abstractmethod
    def load(self, path: Path) -> List[Dict[str, Any]]:
        """加载原始数据"""
        pass

    @abstractmethod
    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        """将原始数据转换为统一的 Trajectory 格式"""
        pass

    def load_and_parse(self, path: Path) -> List[Trajectory]:
        """加载并解析所有轨迹"""
        raw_data = self.load(path)
        trajectories = []
        for idx, item in enumerate(raw_data):
            try:
                trajectory = self.parse(item, idx)
                trajectories.append(trajectory)
            except Exception as e:
                print(f"Warning: Failed to parse trajectory {idx}: {e}")
        return trajectories


class HuggingFaceDatasetAdapter(TrajectoryAdapter):
    """HuggingFace datasets 格式适配器"""

    def load(self, path: Path) -> List[Dict[str, Any]]:
        """加载 HuggingFace dataset"""
        dataset = load_from_disk(str(path))
        return list(dataset)

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        """解析 HuggingFace 格式的轨迹"""
        conversations = raw_item.get('conversations', [])
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

                # 提取任务类型
                first_word = task.split()[0].lower() if task else 'unknown'
                if first_word in ['put', 'clean', 'heat', 'cool', 'find', 'examine', 'use']:
                    task_type = first_word
                else:
                    task_type = 'other'

                # 提取环境描述
                env_end = value.find('Your task is to:')
                environment = value[:env_end].strip() if env_end > 0 else ""

            # 解析 agent 的思考和动作
            thought = None
            action = None
            if role == 'agent':
                if 'Thought:' in value:
                    parts = value.split('Action:')
                    thought = parts[0].replace('Thought:', '').strip()
                    action = parts[1].strip() if len(parts) > 1 else ""
                elif 'Action:' in value:
                    action = value.replace('Action:', '').strip()

            messages.append(Message(role, value, thought, action))

        # 判断是否成功
        last_message = conversations[-1]['value'].lower() if conversations else ""
        status = 'success' if any(word in last_message for word in
                                 ['succeed', 'success', 'task completed', 'congratulations']) else 'unknown'

        # 计算步数
        steps = len([m for m in messages if m.role == 'agent' and m.action])

        return Trajectory(
            id=f"hf_traj_{idx:05d}",
            task=task,
            status=status,
            steps=steps,
            task_type=task_type,
            messages=messages,
            environment=environment,
            metadata={'item_id': raw_item.get('item_id', ''), 'source': 'huggingface'}
        )


class REBELJSONAdapter(TrajectoryAdapter):
    """REBEL JSON 格式适配器"""

    def load(self, path: Path) -> List[Dict[str, Any]]:
        """加载 JSON 文件"""
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        """解析 REBEL 格式的轨迹"""
        task = raw_item.get('task', '')
        done = raw_item.get('done', 'False')
        data = raw_item.get('data', [])

        messages = []

        # 解析每个步骤
        for step_data in data:
            step_num = step_data.get('step', 0)
            obs = step_data.get('obs', '')
            response = step_data.get('response', '')

            # 添加观察（环境反馈）
            if obs:
                messages.append(Message(
                    role='human',
                    content=obs,
                    metadata={'step': step_num, 'type': 'observation'}
                ))

            # 解析 agent 响应
            if response:
                thought = None
                action = None
                belief = None
                reasoning = None

                # 尝试解析结构化响应
                if '<belief>' in response and '</belief>' in response:
                    belief_start = response.find('<belief>') + len('<belief>')
                    belief_end = response.find('</belief>')
                    belief = response[belief_start:belief_end].strip()

                if '<reasoning>' in response and '</reasoning>' in response:
                    reasoning_start = response.find('<reasoning>') + len('<reasoning>')
                    reasoning_end = response.find('</reasoning>')
                    reasoning = response[reasoning_start:reasoning_end].strip()
                    thought = reasoning  # 使用 reasoning 作为 thought

                if '<action>' in response and '</action>' in response:
                    action_start = response.find('<action>') + len('<action>')
                    action_end = response.find('</action>')
                    action = response[action_start:action_end].strip()

                messages.append(Message(
                    role='agent',
                    content=response,
                    thought=thought,
                    action=action,
                    metadata={
                        'step': step_num,
                        'belief': belief,
                        'type': 'agent_response'
                    }
                ))

        # 提取任务类型
        task_type = 'unknown'
        if task:
            first_word = task.split()[0].lower()
            if first_word in ['put', 'clean', 'heat', 'cool', 'find', 'examine', 'use']:
                task_type = first_word
            else:
                task_type = 'other'

        # 状态判断
        status = 'success' if done == 'True' else 'failed' if done == 'False' else 'unknown'

        # 计算步数
        steps = len([m for m in messages if m.role == 'agent' and m.action])

        # 环境信息（从第一个观察中提取）
        environment = ""
        if data and data[0].get('obs'):
            first_obs = data[0]['obs']
            if 'You are in the middle of a room' in first_obs:
                env_end = first_obs.find('\nYour task is to:')
                if env_end > 0:
                    environment = first_obs[:env_end].strip()

        return Trajectory(
            id=f"rebel_traj_{idx:05d}",
            task=task,
            status=status,
            steps=steps,
            task_type=task_type,
            messages=messages,
            environment=environment,
            metadata={'source': 'rebel', 'done': done}
        )


class TrajectoryLoader:
    """轨迹加载器 - 自动检测并使用合适的适配器"""

    def __init__(self):
        self.adapters = {
            'huggingface': HuggingFaceDatasetAdapter(),
            'rebel_json': REBELJSONAdapter(),
        }

    def detect_format(self, path: Path) -> Optional[str]:
        """自动检测轨迹格式"""
        if path.is_dir():
            # 检查是否是 HuggingFace dataset
            if (path / 'dataset_info.json').exists() and (path / 'state.json').exists():
                return 'huggingface'
        elif path.is_file():
            # 检查文件扩展名
            if path.suffix == '.json':
                # 尝试读取文件内容判断格式
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list) and len(data) > 0:
                            first_item = data[0]
                            # 检查是否是 REBEL 格式
                            if 'task' in first_item and 'done' in first_item and 'data' in first_item:
                                return 'rebel_json'
                except Exception:
                    pass
        return None

    def load(self, path: Path, format_type: Optional[str] = None) -> List[Trajectory]:
        """
        加载轨迹数据

        Args:
            path: 数据路径
            format_type: 格式类型，如果为 None 则自动检测

        Returns:
            轨迹列表
        """
        if format_type is None:
            format_type = self.detect_format(path)
            if format_type is None:
                raise ValueError(f"Cannot detect format for path: {path}")

        if format_type not in self.adapters:
            raise ValueError(f"Unsupported format: {format_type}")

        adapter = self.adapters[format_type]
        print(f"Loading trajectories from {path} using {format_type} adapter...")
        trajectories = adapter.load_and_parse(path)
        print(f"Loaded {len(trajectories)} trajectories")

        return trajectories

    def load_multiple(self, paths: List[Path]) -> List[Trajectory]:
        """加载多个数据源"""
        all_trajectories = []
        for path in paths:
            try:
                trajectories = self.load(path)
                all_trajectories.extend(trajectories)
            except Exception as e:
                print(f"Warning: Failed to load {path}: {e}")
        return all_trajectories
