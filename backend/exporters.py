"""
Trajectory Exporters - 支持 Markdown、Prompt JSON、PDF 三种格式导出
"""
import json
from typing import Dict, Any


class MarkdownExporter:
    """将轨迹导出为 Markdown 文档"""

    @staticmethod
    def generate(trajectory: Dict[str, Any]) -> str:
        t = trajectory
        metadata = t.get('metadata') or {}
        status = t.get('status', 'unknown')
        status_icon = '✅' if status == 'success' else '❌' if status == 'failed' else '❓'
        is_retrosynthesis = t.get('task_type', '').startswith('retrosynthesis')

        lines = []

        # 标题
        lines.append(f"# 轨迹报告：{t.get('id', '')}")
        lines.append("")

        # 基本信息表
        lines.append("| 字段 | 值 |")
        lines.append("|------|-----|")
        lines.append(f"| ID | `{t.get('id', '')}` |")
        lines.append(f"| 状态 | {status_icon} {status} |")
        lines.append(f"| 任务类型 | {t.get('task_type', '')} |")
        lines.append(f"| 总步数 | {t.get('steps', 0)} |")
        if is_retrosynthesis:
            lines.append(f"| 总奖励 | {metadata.get('total_reward', 0):.4f} |")
            lines.append(f"| 有效步数 | {metadata.get('valid_steps', 0)} |")
            if status == 'success':
                lines.append(f"| 路径长度 | {metadata.get('pathway_length', 0)} |")
        lines.append("")

        # 任务描述
        lines.append("## 任务描述")
        lines.append("")
        lines.append(t.get('task', ''))
        lines.append("")

        # 目标分子（逆合成专有）
        if is_retrosynthesis and metadata.get('target_molecule'):
            lines.append("## 目标分子（SMILES）")
            lines.append("")
            lines.append("```")
            lines.append(metadata['target_molecule'])
            lines.append("```")
            lines.append("")

        # 对话轨迹
        lines.append("## 对话轨迹")
        lines.append("")

        messages = t.get('messages', [])
        current_step = None

        for msg in messages:
            role = msg.get('role', '')
            content = msg.get('content', '')
            thought = msg.get('thought')
            action = msg.get('action')
            msg_meta = msg.get('metadata') or {}
            step_num = msg_meta.get('step', '')
            tool_name = msg_meta.get('tool_name', '')
            reward = msg_meta.get('reward')
            is_valid = msg_meta.get('is_valid_action')
            msg_type = msg_meta.get('type', '')

            if role == 'human' and msg_type == 'tool_response':
                # 环境反馈消息
                header = f"**[Environment"
                if tool_name:
                    header += f" - {tool_name}"
                if step_num != '':
                    header += f" | Step #{step_num}"
                header += "]**"
                lines.append(header)
                lines.append("")
                lines.append("```")
                lines.append(str(content))
                lines.append("```")
                lines.append("")

            elif role == 'agent' and msg_type == 'agent_action':
                # Agent 动作消息
                if step_num != current_step:
                    current_step = step_num
                    lines.append(f"### Step {step_num}")
                    lines.append("")

                # Agent 动作标题行
                agent_header_parts = []
                if tool_name:
                    agent_header_parts.append(f"工具: `{tool_name}`")
                if reward is not None:
                    agent_header_parts.append(f"奖励: `{reward:.4f}`")
                if is_valid is not None:
                    valid_tag = "✅ 有效" if is_valid else "❌ 无效"
                    agent_header_parts.append(valid_tag)

                if agent_header_parts:
                    lines.append(f"**[Agent]** {' | '.join(agent_header_parts)}")
                    lines.append("")

                # 思考内容（blockquote）
                if thought:
                    for line in thought.split('\n'):
                        lines.append(f"> {line}")
                    lines.append("")

                # 动作内容
                if action:
                    lines.append("```")
                    lines.append(str(action))
                    lines.append("```")
                    lines.append("")

            else:
                # 其他消息（如初始人类消息）
                lines.append(f"**[{role}]**")
                lines.append("")
                lines.append(str(content))
                lines.append("")

        # 最终合成路径（逆合成成功轨迹）
        final_pathway = metadata.get('final_pathway', [])
        if is_retrosynthesis and status == 'success' and final_pathway:
            lines.append("## 最终合成路径")
            lines.append("")
            for i, step in enumerate(final_pathway, 1):
                lines.append(f"{i}. `{step}`")
            lines.append("")

        # 元数据
        lines.append("## 元数据")
        lines.append("")
        # 过滤掉大型数组字段以保持可读性
        meta_display = {k: v for k, v in metadata.items()
                        if k not in ('anchor_states', 'final_pathway') and not isinstance(v, list)}
        # 单独显示 final_pathway 摘要
        if final_pathway:
            meta_display['final_pathway_steps'] = len(final_pathway)
        lines.append("```json")
        lines.append(json.dumps(meta_display, ensure_ascii=False, indent=2))
        lines.append("```")
        lines.append("")

        return '\n'.join(lines)


class PromptExporter:
    """将轨迹导出为 ShareGPT JSON 格式（兼容 verl SFT pipeline）"""

    SYSTEM_PROMPT = (
        "你是一个专业的逆合成规划专家（Retrosynthesis Planning Expert）。"
        "你的任务是从给定的目标分子出发，通过选择合适的逆合成反应，逐步将其分解为可购买的起始原料，从而规划出完整的合成路径。\n\n"
        "你可以使用以下工具：\n"
        "- single_step_retro(molecule): 对指定分子进行单步逆合成，返回候选前体反应列表\n"
        "- select_reaction(reaction): 选择一个候选反应并将其加入合成路径\n"
        "- check_pathway(): 检查当前合成路径的完整性\n\n"
        "思考时使用 [THINK]...[/THINK] 标签，执行动作时使用 [ACTION]...[/ACTION] 标签。"
    )

    @staticmethod
    def generate(trajectory: Dict[str, Any]) -> Dict[str, Any]:
        t = trajectory
        metadata = t.get('metadata') or {}
        is_retrosynthesis = t.get('task_type', '').startswith('retrosynthesis')

        conversations = []

        # System prompt（逆合成专有）
        if is_retrosynthesis:
            conversations.append({
                "from": "system",
                "value": PromptExporter.SYSTEM_PROMPT
            })

        messages = t.get('messages', [])

        for msg in messages:
            role = msg.get('role', '')
            content = msg.get('content', '')
            thought = msg.get('thought')
            action = msg.get('action')
            msg_meta = msg.get('metadata') or {}
            msg_type = msg_meta.get('type', '')

            if role == 'human':
                conversations.append({
                    "from": "human",
                    "value": str(content)
                })

            elif role == 'agent':
                # 重建 gpt 消息：[THINK]...[/THINK][ACTION]...[/ACTION]
                parts = []
                if thought:
                    parts.append(f"[THINK]\n{thought}\n[/THINK]")
                if action:
                    parts.append(f"[ACTION]\n{action}\n[/ACTION]")

                if parts:
                    value = "\n".join(parts)
                elif content:
                    value = str(content)
                else:
                    continue

                conversations.append({
                    "from": "gpt",
                    "value": value
                })

        # 构建元数据摘要
        export_metadata = {
            "task_type": t.get('task_type', ''),
            "status": t.get('status', ''),
            "steps": t.get('steps', 0),
            "total_reward": metadata.get('total_reward'),
            "target_molecule": metadata.get('target_molecule'),
            "source_file": metadata.get('source_file'),
        }
        # 移除 None 值
        export_metadata = {k: v for k, v in export_metadata.items() if v is not None}

        return {
            "id": t.get('id', ''),
            "conversations": conversations,
            "metadata": export_metadata
        }


class PdfExporter:
    """将轨迹导出为 PDF 文档"""

    @staticmethod
    def _safe_text(text: str, max_len: int = 500) -> str:
        """截断并将非 Latin-1 字符替换为 ?（fpdf2 内置字体限制）"""
        text = str(text)[:max_len]
        return ''.join(c if ord(c) < 256 else '?' for c in text)

    @staticmethod
    def generate(trajectory: Dict[str, Any]) -> bytes:
        from fpdf import FPDF

        t = trajectory
        metadata = t.get('metadata') or {}
        status = t.get('status', 'unknown')
        is_retrosynthesis = t.get('task_type', '').startswith('retrosynthesis')
        safe = PdfExporter._safe_text

        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)

        # 标题
        pdf.set_font("Helvetica", "B", 16)
        title = safe(f"Trajectory Report: {t.get('id', '')}", 80)
        pdf.cell(0, 10, title, ln=True)
        pdf.ln(2)

        # 基本信息表（两列，灰色填充）
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(220, 220, 220)

        def info_row(label: str, value: str):
            pdf.set_fill_color(240, 240, 240)
            pdf.cell(50, 8, label, border=1, fill=True)
            pdf.set_fill_color(255, 255, 255)
            pdf.cell(0, 8, value, border=1, fill=True, ln=True)

        pdf.set_font("Helvetica", "", 9)
        info_row("ID", safe(t.get('id', ''), 60))
        status_text = f"{'SUCCESS' if status == 'success' else 'FAILED' if status == 'failed' else 'UNKNOWN'}"
        info_row("Status", status_text)
        info_row("Task Type", safe(t.get('task_type', ''), 40))
        info_row("Total Steps", str(t.get('steps', 0)))
        if is_retrosynthesis:
            info_row("Total Reward", f"{metadata.get('total_reward', 0):.4f}")
            info_row("Valid Steps", str(metadata.get('valid_steps', 0)))
            if status == 'success':
                info_row("Pathway Length", str(metadata.get('pathway_length', 0)))
        pdf.ln(4)

        # 任务描述
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Task Description", ln=True)
        pdf.set_font("Helvetica", "", 9)
        task_text = safe(t.get('task', ''), 300)
        pdf.multi_cell(0, 6, task_text)
        pdf.ln(3)

        # 目标分子（逆合成专有）
        if is_retrosynthesis and metadata.get('target_molecule'):
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "Target Molecule (SMILES)", ln=True)
            pdf.set_font("Courier", "", 8)
            mol_text = safe(metadata['target_molecule'], 200)
            pdf.multi_cell(0, 6, mol_text)
            pdf.ln(3)

        # 对话轨迹
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Conversation Trajectory", ln=True)
        pdf.ln(2)

        messages = t.get('messages', [])
        for msg in messages:
            role = msg.get('role', '')
            content = msg.get('content', '')
            thought = msg.get('thought')
            action = msg.get('action')
            msg_meta = msg.get('metadata') or {}
            step_num = msg_meta.get('step', '')
            tool_name = msg_meta.get('tool_name', '')
            reward = msg_meta.get('reward')
            is_valid = msg_meta.get('is_valid_action')
            msg_type = msg_meta.get('type', '')

            # 自动换页检查
            if pdf.get_y() > 255:
                pdf.add_page()

            if role == 'human' and msg_type == 'tool_response':
                # 环境反馈块（浅蓝背景）
                pdf.set_fill_color(230, 240, 255)
                header = f"[Environment"
                if tool_name:
                    header += f" - {safe(tool_name, 20)}"
                if step_num != '':
                    header += f" | Step #{step_num}"
                header += "]"
                pdf.set_font("Helvetica", "B", 9)
                pdf.cell(0, 7, header, border=1, fill=True, ln=True)
                pdf.set_fill_color(240, 246, 255)
                pdf.set_font("Courier", "", 7)
                content_text = safe(str(content), 600)
                pdf.multi_cell(0, 5, content_text, fill=True)
                pdf.ln(2)

            elif role == 'agent' and msg_type == 'agent_action':
                # Agent 动作块（浅绿背景）
                pdf.set_fill_color(220, 240, 220)
                header_parts = [f"[Agent | Step #{step_num}]"]
                if tool_name:
                    header_parts.append(f"Tool: {safe(tool_name, 20)}")
                if reward is not None:
                    header_parts.append(f"Reward: {reward:.4f}")
                if is_valid is not None:
                    header_parts.append("VALID" if is_valid else "INVALID")
                header = "  ".join(header_parts)
                pdf.set_font("Helvetica", "B", 9)
                pdf.cell(0, 7, safe(header, 100), border=1, fill=True, ln=True)

                pdf.set_fill_color(235, 248, 235)
                if thought:
                    pdf.set_font("Helvetica", "I", 8)
                    pdf.multi_cell(0, 5, safe(str(thought), 400), fill=True)
                if action:
                    pdf.set_font("Courier", "", 7)
                    pdf.multi_cell(0, 5, safe(str(action), 300), fill=True)
                pdf.ln(2)

        # 最终合成路径
        final_pathway = metadata.get('final_pathway', [])
        if is_retrosynthesis and status == 'success' and final_pathway:
            if pdf.get_y() > 240:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "Final Synthesis Pathway", ln=True)
            pdf.set_font("Courier", "", 8)
            for i, step in enumerate(final_pathway, 1):
                step_text = safe(f"{i}. {step}", 150)
                pdf.cell(0, 6, step_text, ln=True)
            pdf.ln(3)

        return bytes(pdf.output())
