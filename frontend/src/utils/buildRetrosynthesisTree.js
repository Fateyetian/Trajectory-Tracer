/**
 * 从逆合成路径构建树结构
 * @param {string} targetMolecule - 目标分子 SMILES
 * @param {string[]} finalPathway - 反应路径数组，格式 "产物>>反应物1.反应物2"
 * @returns {{ smiles: string, children: Array }} 树根节点
 */
export function buildRetrosynthesisTree(targetMolecule, finalPathway) {
  // 构建 reactionMap: 产物 → 反应物列表
  const reactionMap = {}

  for (const reaction of finalPathway) {
    const parts = reaction.split('>>')
    if (parts.length !== 2) continue
    const product = parts[0].trim()
    const reactantsStr = parts[1].trim()
    const reactants = reactantsStr.split('.').map(s => s.trim()).filter(Boolean)
    reactionMap[product] = reactants
  }

  // 递归构建树
  const visited = new Set()

  function buildNode(smiles) {
    // 防止循环引用
    if (visited.has(smiles)) {
      return { smiles, children: [] }
    }
    visited.add(smiles)

    if (reactionMap[smiles]) {
      const children = reactionMap[smiles].map(buildNode)
      return { smiles, children }
    }
    return { smiles, children: [] }
  }

  return buildNode(targetMolecule)
}
