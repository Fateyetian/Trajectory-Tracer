"""
Trajectory Adapters - 支持多种轨迹数据格式
提供统一的接口来处理不同来源的轨迹数据
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import re

# Check if HuggingFace datasets is available (without importing it yet)
DATASETS_AVAILABLE = False
try:
    import importlib.util
    spec = importlib.util.find_spec("datasets")
    if spec is not None:
        DATASETS_AVAILABLE = True
except (ImportError, AttributeError):
    pass

if not DATASETS_AVAILABLE:
    print("Warning: HuggingFace datasets library not available. HuggingFace format will be disabled.")


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
        if not DATASETS_AVAILABLE:
            raise RuntimeError("HuggingFace datasets library is not available. Cannot load this format.")

        # Import only when needed
        from datasets import load_from_disk
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


class RetrosynthesisJSONLAdapter(TrajectoryAdapter):
    """逆合成 JSONL 格式适配器

    支持逆合成环境的轨迹数据，格式为JSONL，每行一个轨迹。
    主要字段包括：target_molecule, success, steps 等
    """

    def load(self, path: Path) -> List[Dict[str, Any]]:
        """加载 JSONL 文件"""
        trajectories = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        trajectories.append(json.loads(line))
                    except json.JSONDecodeError as e:
                        print(f"Warning: Failed to parse line: {e}")
        return trajectories

    @staticmethod
    def _reconstruct_final_pathway(steps_data: List[Dict]) -> List[str]:
        """
        从 steps 数据重建 final_pathway。

        用于 RL 训练轨迹：这类轨迹的 final_pathway 字段为空，
        但路径信息散落在 single_step_retro 的工具响应（候选反应 SMILES）
        和 select_reaction 的调用参数（被选中的反应 ID）中。

        RL 格式示例:
          single_step_retro 响应: "Reactions for molecule 0-0 (SMILES):\n  0-0-0: R1 (available) + R2 (unavailable) ..."
          select_reaction 调用: tool_args = {"reaction": "0-0-0"}

        SFT 格式基本相同，但反应 ID 带方括号: "[0-0-0]: ..."
        """
        # Step 1: 解析所有 single_step_retro 响应，构建 reaction_id -> (product, reactants) 映射
        reaction_map: Dict[str, Dict] = {}

        for step in steps_data:
            if step.get('tool_name') != 'single_step_retro':
                continue
            if not step.get('is_valid_action'):
                continue

            tool_response = step.get('tool_response', '')
            molecule_id = step.get('tool_args', {}).get('molecule', '')
            if not tool_response or not molecule_id:
                continue

            lines = tool_response.strip().split('\n')
            if not lines:
                continue

            # 第一行格式: "Reactions for molecule X-X (SMILES):"
            m = re.match(r'Reactions for molecule [0-9-]+ \((.+)\):\s*$', lines[0].strip())
            if not m:
                continue
            product_smiles = m.group(1).strip()

            # 解析候选反应行（支持 RL 格式 "0-0-0: ..." 和 SFT 格式 "[0-0-0]: ..."）
            for line in lines[1:]:
                line = line.strip()
                if not line:
                    continue
                m_rxn = re.match(r'\[?([0-9]+-[0-9]+-[0-9]+)\]?:\s*(.+)', line)
                if not m_rxn:
                    continue
                rxn_id = m_rxn.group(1)
                reactants_str = m_rxn.group(2)

                # 从 "SMILES1 (available) + SMILES2 (unavailable) (conf: 1.00)" 中提取 SMILES
                parts = reactants_str.split(' + ')
                reactants = []
                for part in parts:
                    smiles = re.sub(r'\s*\((avail|unavail|available|unavailable|unava)[^)]*\)', '', part)
                    smiles = re.sub(r'\s*\(conf:[^)]+\)', '', smiles)
                    smiles = smiles.strip()
                    if smiles:
                        reactants.append(smiles)

                if product_smiles and reactants:
                    reaction_map[rxn_id] = {'product': product_smiles, 'reactants': reactants}

        # Step 2: 按顺序收集被选中的有效反应 ID
        selected = []
        for step in steps_data:
            if step.get('tool_name') != 'select_reaction':
                continue
            if not step.get('is_valid_action'):
                continue
            rxn_id = step.get('tool_args', {}).get('reaction', '')
            if rxn_id and rxn_id in reaction_map:
                selected.append(rxn_id)

        # Step 3: 组装 final_pathway，格式与 SFT 一致: "product>>reactant1.reactant2"
        pathway = []
        for rxn_id in selected:
            rxn = reaction_map[rxn_id]
            product = rxn['product']
            reactants = '.'.join(rxn['reactants'])
            if product and reactants:
                pathway.append(f'{product}>>{reactants}')

        return pathway

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        """解析逆合成格式的轨迹"""
        # 基本信息
        trajectory_id = raw_item.get('trajectory_id', f'retro_{idx:05d}')
        target_molecule = raw_item.get('target_molecule', '')
        success = raw_item.get('success', False)
        total_steps = raw_item.get('total_steps', 0)
        total_reward = raw_item.get('total_reward', 0.0)
        pathway_length = raw_item.get('pathway_length', 0)
        epoch = raw_item.get('epoch', 0)
        prompt_id = raw_item.get('prompt_id', 0)

        steps_data = raw_item.get('steps', [])
        anchor_states = raw_item.get('anchor_states', [])
        final_pathway = raw_item.get('final_pathway', [])
        pathway_validity = raw_item.get('pathway_validity', False)
        ground_truth_length = raw_item.get('ground_truth_length', 0)

        # RL 训练轨迹的 final_pathway 通常为空，从 steps 中重建
        if not final_pathway and success:
            final_pathway = self._reconstruct_final_pathway(steps_data)
            if final_pathway and pathway_length == 0:
                pathway_length = len(final_pathway)

        messages = []

        # 添加初始环境描述
        env_description = f"目标分子: {target_molecule}\n逆合成规划任务"

        # 解析每个步骤
        for step_data in steps_data:
            step_num = step_data.get('step', 0)
            observation = step_data.get('observation', '')
            action_text = step_data.get('action', '')
            tool_name = step_data.get('tool_name', '')
            tool_args = step_data.get('tool_args', {})
            tool_response = step_data.get('tool_response', '')
            reward = step_data.get('reward', 0.0)
            cumulative_reward = step_data.get('cumulative_reward', 0.0)
            is_valid = step_data.get('is_valid_action', False)
            action_type = step_data.get('action_type', 'unknown')

            # 解析 action 中的 THINK 和 ACTION 部分
            thought = None
            action = None

            if '[THINK]' in action_text and '[/THINK]' in action_text:
                think_start = action_text.find('[THINK]') + len('[THINK]')
                think_end = action_text.find('[/THINK]')
                thought = action_text[think_start:think_end].strip()

            if '[ACTION]' in action_text and '[/ACTION]' in action_text:
                action_start = action_text.find('[ACTION]') + len('[ACTION]')
                action_end = action_text.find('[/ACTION]')
                action = action_text[action_start:action_end].strip()
            elif tool_name:
                # 如果没有解析到 action，使用 tool_name 和 tool_args
                action = f"{tool_name}({json.dumps(tool_args, ensure_ascii=False)})"

            # 先添加 agent 的动作和思考
            if action_text or action:
                messages.append(Message(
                    role='agent',
                    content=action_text if action_text else action,
                    thought=thought,
                    action=action,
                    metadata={
                        'step': step_num,
                        'tool_name': tool_name,
                        'tool_args': tool_args,
                        'reward': reward,
                        'cumulative_reward': cumulative_reward,
                        'is_valid_action': is_valid,
                        'action_type': action_type,
                        'type': 'agent_action'
                    }
                ))

            # 再添加工具响应（环境反馈）
            if tool_response:
                messages.append(Message(
                    role='human',
                    content=tool_response,
                    metadata={
                        'step': step_num,
                        'type': 'tool_response',
                        'tool_name': tool_name
                    }
                ))

        # 确定任务类型: 根据 metadata.source 区分 SFT 和 RL 轨迹
        raw_source = raw_item.get('metadata', {}).get('source', '')
        if 'sft' in raw_source:
            task_type = 'retrosynthesis_sft'
        else:
            task_type = 'retrosynthesis'

        # 状态判断
        status = 'success' if success else 'failed'

        # 计算有效步数
        valid_steps = len([m for m in messages if m.role == 'agent' and m.metadata.get('is_valid_action', False)])

        return Trajectory(
            id=trajectory_id,
            task=f"逆合成规划: {target_molecule[:50]}..." if len(target_molecule) > 50 else f"逆合成规划: {target_molecule}",
            status=status,
            steps=total_steps,
            task_type=task_type,
            messages=messages,
            environment=env_description,
            metadata={
                'source': 'retrosynthesis',
                'target_molecule': target_molecule,
                'total_reward': total_reward,
                'pathway_length': pathway_length,
                'ground_truth_length': ground_truth_length,
                'epoch': epoch,
                'prompt_id': prompt_id,
                'valid_steps': valid_steps,
                'anchor_states': anchor_states,
                'final_pathway': final_pathway,
                'pathway_validity': pathway_validity
            }
        )


class RetrosynthesisJSONL0223Adapter(TrajectoryAdapter):
    """逆合成 JSONL 0223 格式适配器

    支持新版逆合成轨迹数据格式，与旧格式的主要差异：
    - 目标分子在顶层 "task" 字段（旧格式为 "target_molecule"）
    - 步骤以 "Step 1", "Step 2"... 作为顶层键（旧格式为 "steps" 数组）
    - 所有元数据集中在顶层 "metadata" 子对象内
    - 步骤内 think 与 action 独立字段，action 为 JSON 字符串
    - final_pathway 格式为 "A -> B + C (σ=0.xxx)"（旧格式为 "A>>B.C"）
    - final_pathway 恒有值（失败轨迹也包含最优部分路径）
    """

    def load(self, path: Path) -> List[Dict[str, Any]]:
        trajectories = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        trajectories.append(json.loads(line))
                    except json.JSONDecodeError as e:
                        print(f"Warning: Failed to parse line: {e}")
        return trajectories

    @staticmethod
    def _normalize_pathway(pathway_list: List[str]) -> List[str]:
        """将 0223 格式的 final_pathway 转换为标准的 "product>>reactant1.reactant2" 格式。

        0223 格式：  "A -> B + C (σ=0.997)"
        标准格式：   "A>>B.C"
        """
        normalized = []
        for item in pathway_list:
            if not isinstance(item, str):
                continue
            if '>>' in item:
                # 已是标准格式
                normalized.append(item)
                continue
            if ' -> ' not in item:
                continue
            product, rest = item.split(' -> ', 1)
            # 去掉置信度注释 "(σ=...)"
            rest = re.sub(r'\s*\(σ=[^)]*\)', '', rest).strip()
            reactants = '.'.join(r.strip() for r in rest.split(' + ') if r.strip())
            if product.strip() and reactants:
                normalized.append(f'{product.strip()}>>{reactants}')
        return normalized

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        meta = raw_item.get('metadata', {})

        target_molecule = raw_item.get('task', '')
        trajectory_id = meta.get('trajectory_id', f'retro_0223_{idx:05d}')
        success = meta.get('success', False)
        total_steps = meta.get('total_steps', 0)
        total_reward = meta.get('total_reward', 0.0)
        pathway_length = meta.get('pathway_length', 0)
        ground_truth_length = meta.get('ground_truth_length')
        epoch = meta.get('epoch', 0)
        prompt_id = meta.get('prompt_id', 0)
        pathway_validity = meta.get('pathway_validity', False)

        # final_pathway：成功轨迹转换为标准格式；失败轨迹不展示树
        raw_pathway = meta.get('final_pathway', []) or []
        final_pathway = self._normalize_pathway(raw_pathway) if success else []

        # 修正 pathway_length（原始值往往为 0）
        if final_pathway and pathway_length == 0:
            pathway_length = len(final_pathway)

        # 收集步骤（Step 1, Step 2, ...）
        step_keys = sorted(
            [k for k in raw_item if k.startswith('Step ')],
            key=lambda k: int(k.split(' ')[1])
        )

        messages = []
        valid_steps = 0

        for i, sk in enumerate(step_keys):
            step = raw_item[sk]
            step_num = i + 1

            obs = step.get('obs', '')
            think = step.get('think', '')
            action_str = step.get('action', '')
            reward = float(step.get('reward', 0.0))
            tool_response = step.get('tool_response', '')

            # 解析 action JSON 字符串，提取 tool_name 和 tool_args
            tool_name = ''
            tool_args = {}
            action_display = action_str
            try:
                act = json.loads(action_str)
                tool_name = act.get('action', '')
                tool_args = act.get('parameters', {})
                action_display = f"{tool_name}({json.dumps(tool_args, ensure_ascii=False)})"
            except (json.JSONDecodeError, AttributeError):
                pass

            # 有效动作：reward > 0 或工具响应不含错误信息
            is_valid = reward > 0 or (
                tool_response and
                'invalid' not in tool_response.lower() and
                'error' not in tool_response.lower() and
                'missing' not in tool_response.lower()
            )
            if is_valid:
                valid_steps += 1

            action_type = 'retro' if tool_name == 'single_step_retro' else \
                          'select' if tool_name == 'select_reaction' else 'unknown'

            # Agent 动作消息
            messages.append(Message(
                role='agent',
                content=action_str,
                thought=think or None,
                action=action_display,
                metadata={
                    'step': step_num,
                    'tool_name': tool_name,
                    'tool_args': tool_args,
                    'reward': reward,
                    'cumulative_reward': None,
                    'is_valid_action': is_valid,
                    'action_type': action_type,
                    'type': 'agent_action'
                }
            ))

            # 工具响应消息
            if tool_response:
                messages.append(Message(
                    role='human',
                    content=tool_response,
                    metadata={
                        'step': step_num,
                        'type': 'tool_response',
                        'tool_name': tool_name
                    }
                ))

        status = 'success' if success else 'failed'
        env_description = f"目标分子: {target_molecule}\n逆合成规划任务"

        return Trajectory(
            id=trajectory_id,
            task=f"逆合成规划: {target_molecule[:50]}..." if len(target_molecule) > 50 else f"逆合成规划: {target_molecule}",
            status=status,
            steps=total_steps,
            task_type='retrosynthesis',
            messages=messages,
            environment=env_description,
            metadata={
                'source': 'retrosynthesis',
                'target_molecule': target_molecule,
                'total_reward': total_reward,
                'pathway_length': pathway_length,
                'ground_truth_length': ground_truth_length,
                'epoch': epoch,
                'prompt_id': prompt_id,
                'valid_steps': valid_steps,
                'anchor_states': [],
                'final_pathway': final_pathway,
                'pathway_validity': pathway_validity,
                'difficulty': meta.get('difficulty'),
                'valid_action_rate': meta.get('valid_action_rate'),
            }
        )


class RetrosynthesisJSONLDirAdapter(TrajectoryAdapter):
    """逆合成 JSONL 目录适配器

    支持从目录中加载多个 JSONL 文件，自动检测每个文件的格式。
    """

    def __init__(self):
        self.old_adapter = RetrosynthesisJSONLAdapter()
        self.new_adapter = RetrosynthesisJSONL0223Adapter()
        self.retrov2_adapter = RetroV2JSONLAdapter()

    @staticmethod
    def _detect_file_format(path: Path) -> str:
        """通过读取第一行判断文件格式"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line:
                    obj = json.loads(first_line)
                    # Retrov2 格式特征：顶层有 "traj_id" + "target_smiles" + "steps"
                    if 'traj_id' in obj and 'target_smiles' in obj and 'steps' in obj:
                        return 'retrov2'
                    # 0223 新格式特征：顶层有 "task" + "metadata" + "Step N" 键
                    if ('task' in obj and 'metadata' in obj and
                            any(k.startswith('Step ') for k in obj)):
                        return 'new'
        except Exception:
            pass
        return 'old'

    def load(self, path: Path) -> List[Dict[str, Any]]:
        """加载目录中所有 JSONL 文件，标记来源文件名和格式"""
        all_items = []
        jsonl_files = sorted(path.glob('*.jsonl'))
        for jsonl_file in jsonl_files:
            fmt = self._detect_file_format(jsonl_file)
            if fmt == 'retrov2':
                adapter = self.retrov2_adapter
            elif fmt == 'new':
                adapter = self.new_adapter
            else:
                adapter = self.old_adapter
            items = adapter.load(jsonl_file)
            for item in items:
                item['_source_file'] = jsonl_file.name
                item['_file_format'] = fmt
            all_items.extend(items)
        return all_items

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        """根据文件格式标记选择对应适配器解析"""
        fmt = raw_item.get('_file_format', 'old')
        if fmt == 'retrov2':
            adapter = self.retrov2_adapter
        elif fmt == 'new':
            adapter = self.new_adapter
        else:
            adapter = self.old_adapter
        traj = adapter.parse(raw_item, idx)
        source_file = raw_item.get('_source_file', '')
        if source_file:
            traj.metadata['source_file'] = source_file
        return traj


class RetroV2JSONLAdapter(TrajectoryAdapter):
    """Retro-v2 JSONL 格式适配器

    对应 retro_trajectory_writer.py 生成的格式：
    {
      "traj_id": "...",
      "timestamp": "...",
      "target_smiles": "CCO",
      "is_success": false,
      "total_steps": 8,
      "total_reward": -1.0,
      "steps": [
        {
          "step": 0, "state_id": "S0",
          "user_message": "...", "model_response": "...",
          "action_type": "single_step_retro", "params": {...},
          "step_reward": 0.0, "done": false,
          "anchor_obs": "CCO", "error": null
        }, ...
      ]
    }
    """

    def load(self, path: Path) -> List[Dict[str, Any]]:
        trajectories = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        trajectories.append(json.loads(line))
                    except json.JSONDecodeError as e:
                        print(f"Warning: Failed to parse line: {e}")
        return trajectories

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        traj_id       = raw_item.get('traj_id', f'retrov2_{idx:05d}')
        target_smiles = raw_item.get('target_smiles', '')
        is_success    = raw_item.get('is_success', False)
        total_steps   = raw_item.get('total_steps', 0)
        total_reward  = raw_item.get('total_reward', 0.0)
        timestamp     = raw_item.get('timestamp', '')
        steps_data    = raw_item.get('steps', [])

        messages = []
        cumulative_reward = 0.0

        for step_data in steps_data:
            step_num      = step_data.get('step', 0)
            state_id      = step_data.get('state_id', '')
            user_message  = step_data.get('user_message', '')
            model_response = step_data.get('model_response', '')
            action_type   = step_data.get('action_type', 'unknown')
            params        = step_data.get('params', {})
            step_reward   = float(step_data.get('step_reward', 0.0))
            done          = step_data.get('done', False)
            anchor_obs    = step_data.get('anchor_obs', '')
            error         = step_data.get('error')

            cumulative_reward += step_reward

            # 用户消息（环境给出的 observation）
            if user_message:
                messages.append(Message(
                    role='human',
                    content=user_message,
                    metadata={
                        'step': step_num,
                        'state_id': state_id,
                        'type': 'observation',
                        'anchor_obs': anchor_obs,
                    }
                ))

            # 解析模型输出中的 [THINK] 和 [ACTION] 块
            thought = None
            action  = None
            if '[THINK]' in model_response and '[/THINK]' in model_response:
                ts = model_response.find('[THINK]') + len('[THINK]')
                te = model_response.find('[/THINK]')
                thought = model_response[ts:te].strip()
            if '[ACTION]' in model_response and '[/ACTION]' in model_response:
                as_ = model_response.find('[ACTION]') + len('[ACTION]')
                ae  = model_response.find('[/ACTION]')
                action = model_response[as_:ae].strip()
            elif action_type and action_type != 'unknown':
                action = f"{action_type}({json.dumps(params, ensure_ascii=False)})"

            is_valid = (action_type != 'unknown') and (error is None)

            messages.append(Message(
                role='agent',
                content=model_response,
                thought=thought,
                action=action,
                metadata={
                    'step': step_num,
                    'state_id': state_id,
                    'tool_name': action_type,
                    'tool_args': params,
                    'reward': step_reward,
                    'cumulative_reward': round(cumulative_reward, 4),
                    'is_valid_action': is_valid,
                    'action_type': action_type,
                    'done': done,
                    'error': error,
                    'type': 'agent_action',
                }
            ))

        status = 'success' if is_success else 'failed'
        task_label = (f"逆合成规划: {target_smiles[:50]}..."
                      if len(target_smiles) > 50
                      else f"逆合成规划: {target_smiles}")

        return Trajectory(
            id=traj_id,
            task=task_label,
            status=status,
            steps=total_steps,
            task_type='retrosynthesis_v2',
            messages=messages,
            environment=f"目标分子: {target_smiles}\n逆合成规划任务 (Retro-v2)",
            metadata={
                'source': 'retrov2',
                'target_molecule': target_smiles,
                'total_reward': total_reward,
                'timestamp': timestamp,
                'pathway_length': 0,
                'ground_truth_length': 0,
                'epoch': 0,
                'prompt_id': 0,
                'valid_steps': sum(
                    1 for m in messages
                    if m.role == 'agent' and m.metadata.get('is_valid_action', False)
                ),
                'anchor_states': [],
                'final_pathway': [],
                'pathway_validity': False,
            }
        )


class RetroV2JSONLDirAdapter(TrajectoryAdapter):
    """从目录中加载所有 retrov2 格式 JSONL 文件"""

    def __init__(self):
        self._adapter = RetroV2JSONLAdapter()

    def load(self, path: Path) -> List[Dict[str, Any]]:
        all_items = []
        for jsonl_file in sorted(path.glob('*.jsonl')):
            items = self._adapter.load(jsonl_file)
            for item in items:
                item['_source_file'] = jsonl_file.name
            all_items.extend(items)
        return all_items

    def parse(self, raw_item: Dict[str, Any], idx: int) -> Trajectory:
        traj = self._adapter.parse(raw_item, idx)
        source_file = raw_item.get('_source_file', '')
        if source_file:
            traj.metadata['source_file'] = source_file
        return traj


class TrajectoryLoader:
    """轨迹加载器 - 自动检测并使用合适的适配器"""

    def __init__(self):
        self.adapters = {
            'rebel_json': REBELJSONAdapter(),
            'retrov2_jsonl': RetroV2JSONLAdapter(),
            'retrov2_jsonl_dir': RetroV2JSONLDirAdapter(),
            'retrosynthesis_jsonl': RetrosynthesisJSONLAdapter(),
            'retrosynthesis_jsonl_0223': RetrosynthesisJSONL0223Adapter(),
            'retrosynthesis_jsonl_dir': RetrosynthesisJSONLDirAdapter(),
        }
        # Only add HuggingFace adapter if datasets library is available
        if DATASETS_AVAILABLE:
            self.adapters['huggingface'] = HuggingFaceDatasetAdapter()

    def detect_format(self, path: Path) -> Optional[str]:
        """自动检测轨迹格式"""
        if path.is_dir():
            # 检查是否是 HuggingFace dataset
            if DATASETS_AVAILABLE and (path / 'dataset_info.json').exists() and (path / 'state.json').exists():
                return 'huggingface'
            # 检查目录中是否有 JSONL 文件（批量加载）
            jsonl_files = list(path.glob('*.jsonl'))
            if jsonl_files:
                return 'retrosynthesis_jsonl_dir'
        elif path.is_file():
            if path.suffix == '.jsonl':
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            first_item = json.loads(first_line)
                            # retrov2 格式：顶层有 traj_id 和 target_smiles
                            if 'traj_id' in first_item and 'target_smiles' in first_item:
                                return 'retrov2_jsonl'
                            # 0223 新格式：顶层有 "task" + "metadata" + "Step N" 键
                            if ('task' in first_item and 'metadata' in first_item and
                                    any(k.startswith('Step ') for k in first_item)):
                                return 'retrosynthesis_jsonl_0223'
                            # 旧格式：有 trajectory_id 或 target_molecule+steps
                            if ('trajectory_id' in first_item or
                                    ('target_molecule' in first_item and 'steps' in first_item)):
                                return 'retrosynthesis_jsonl'
                except Exception:
                    pass
            elif path.suffix == '.json':
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list) and len(data) > 0:
                            first_item = data[0]
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
