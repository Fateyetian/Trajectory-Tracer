"""
Prompt Catalog - Parse and serve all prompt templates from the RLVMR codebase.
Reads Python source files and extracts string variable assignments.
"""
import ast
import re
from pathlib import Path
from typing import List, Dict, Any


# Source directory containing all prompt files
PROMPTS_DIR = Path(__file__).parent.parent.parent / "RLVMR" / "code" / "agent_system" / "environments" / "prompts"

# Metadata rules: how to classify prompts by name pattern
def _classify_prompt(name: str, file_stem: str = '') -> Dict[str, Any]:
    """Classify a prompt by its variable name and source file stem."""
    name_lower = name.lower()
    fname = file_stem.lower()  # filename stem for file-level classification

    # Environment: check filename first (more reliable), then variable name
    if 'alfworld' in fname or 'alfworld' in name_lower:
        env = 'alfworld'
    elif 'webshop' in fname or 'webshop' in name_lower:
        env = 'webshop'
    elif 'sciworld' in fname or 'sciworld' in name_lower:
        env = 'sciworld'
    elif 'retro' in fname or 'retro' in name_lower:
        env = 'retro'
    else:
        env = 'general'

    # File-level phase overrides: files that don't follow naming conventions
    # retro.py contains RL/SFT training prompts (same format for both phases)
    FILE_PHASE_OVERRIDES = {'retro': 'rl'}

    # Phase: check filename first, then variable name
    if fname in FILE_PHASE_OVERRIDES:
        phase = FILE_PHASE_OVERRIDES[fname]
    elif 'tagging' in fname or 'tagging' in name_lower:
        phase = 'annotation'
    elif '_cs' in fname or 'cold_start' in fname or '_cs' in name_lower or 'cold_start' in name_lower:
        phase = 'sft'
    elif '_rl' in fname or '_rl' in name_lower:
        phase = 'rl'
    elif 'rebel' in fname or 'rebel' in name_lower:
        phase = 'rebel'
    else:
        phase = 'basic'

    # Has history
    has_history = 'no_his' not in name_lower and ('template' in name_lower or 'rebel' in name_lower)
    # Refine: if NO_HIS is in name, definitely no history
    if 'no_his' in name_lower or 'no_history' in name_lower:
        has_history = False

    # Variant
    variant = None
    for v in ['bdrs', 'nothink', 'mc', 'think']:
        if v in name_lower:
            variant = v
            break

    return {
        'env': env,
        'phase': phase,
        'has_history': has_history,
        'variant': variant,
    }


def _extract_placeholders(text: str) -> List[str]:
    """Extract all {placeholder} names from a template string."""
    # Match {word} but not {{word}} (escaped braces)
    raw = re.findall(r'(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})', text)
    return sorted(set(raw))


def _parse_prompt_file(filepath: Path) -> List[Dict[str, Any]]:
    """Parse a Python source file and extract all string variable assignments."""
    try:
        source = filepath.read_text(encoding='utf-8')
        tree = ast.parse(source)
    except Exception as e:
        print(f"Warning: Failed to parse {filepath}: {e}")
        return []

    prompts = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if not isinstance(target, ast.Name):
                continue
            name = target.id
            # Only capture UPPER_CASE variables (convention for templates)
            if not name.isupper():
                continue
            # Only string constants (Constant or JoinedStr)
            if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                content = node.value.value
            else:
                continue

            if len(content) < 20:  # Skip trivially short strings
                continue

            meta = _classify_prompt(name, filepath.stem)
            placeholders = _extract_placeholders(content)

            prompts.append({
                'id': f"{filepath.stem}::{name}",
                'name': name,
                'file': filepath.name,
                'env': meta['env'],
                'phase': meta['phase'],
                'has_history': meta['has_history'],
                'variant': meta['variant'],
                'content': content,
                'placeholders': placeholders,
                'char_count': len(content),
                'line_count': content.count('\n') + 1,
            })

    return prompts


def load_all_prompts() -> List[Dict[str, Any]]:
    """Load all prompts from all prompt files in the prompts directory."""
    if not PROMPTS_DIR.exists():
        print(f"Warning: Prompts directory not found: {PROMPTS_DIR}")
        return []

    all_prompts = []
    # Process files in a consistent order
    priority_files = ['alfworld.py', 'rebel_prompts.py', 'webshop.py', 'webshop_rebel_prompts.py',
                      'cold_start.py', 'sciworld.py']

    processed = set()
    for fname in priority_files:
        fpath = PROMPTS_DIR / fname
        if fpath.exists():
            all_prompts.extend(_parse_prompt_file(fpath))
            processed.add(fname)

    # Any remaining .py files
    for fpath in sorted(PROMPTS_DIR.glob('*.py')):
        if fpath.name not in processed and fpath.name != '__init__.py':
            all_prompts.extend(_parse_prompt_file(fpath))

    return all_prompts


def build_prompt_catalog() -> Dict[str, Any]:
    """Build the full prompt catalog with summary statistics."""
    prompts = load_all_prompts()

    # Group by env and phase for navigation
    by_env: Dict[str, List] = {}
    by_phase: Dict[str, List] = {}
    for p in prompts:
        by_env.setdefault(p['env'], []).append(p['id'])
        by_phase.setdefault(p['phase'], []).append(p['id'])

    # Highlight known issues
    issues = []
    for p in prompts:
        issue_list = []
        # Check for missing action format in RL templates
        if p['phase'] == 'rl' and '<action>' not in p['content']:
            issue_list.append('missing_action_format')
        # Check for RL history template without {action_history} placeholder
        # (annotation templates use {traj} instead — exclude them)
        if p['phase'] == 'rl' and p['has_history'] and 'action_history' not in p['placeholders']:
            issue_list.append('missing_action_history_placeholder')
        # Check for inconsistency: name says no_his but has history placeholder
        if not p['has_history'] and 'action_history' in p['placeholders']:
            issue_list.append('unexpected_action_history')
        if issue_list:
            issues.append({'id': p['id'], 'issues': issue_list})
        p['issues'] = issue_list

    return {
        'prompts': prompts,
        'total': len(prompts),
        'by_env': by_env,
        'by_phase': by_phase,
        'known_issues': issues,
    }
