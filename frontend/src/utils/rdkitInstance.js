let rdkitModule = null
let initPromise = null

/**
 * 初始化 RDKit WASM 模块（单例）
 * @returns {Promise<object>} RDKit 模块实例
 */
export function initRDKit() {
  if (rdkitModule) return Promise.resolve(rdkitModule)
  if (initPromise) return initPromise

  initPromise = window
    .initRDKitModule({
      locateFile: () => '/RDKit_minimal.wasm',
    })
    .then((mod) => {
      rdkitModule = mod
      console.log('RDKit WASM loaded, version:', mod.version())
      return mod
    })
    .catch((err) => {
      console.error('Failed to load RDKit WASM:', err)
      initPromise = null
      throw err
    })

  return initPromise
}

/**
 * 从 SMILES 生成 SVG 字符串
 * @param {string} smiles - SMILES 字符串
 * @param {number} width - SVG 宽度
 * @param {number} height - SVG 高度
 * @returns {Promise<{ svg: string, valid: boolean, canonical: string }>}
 */
export async function renderMoleculeSVG(smiles, width = 200, height = 150) {
  const rdkit = await initRDKit()

  const mol = rdkit.get_mol(smiles)
  if (!mol || !mol.is_valid()) {
    if (mol) mol.delete()
    return { svg: '', valid: false, canonical: '' }
  }

  const canonical = mol.get_smiles()

  const svg = mol.get_svg_with_highlights(
    JSON.stringify({
      width,
      height,
      bondLineWidth: 1.5,
      addAtomIndices: false,
      addBondIndices: false,
      addStereoAnnotation: true,
    })
  )

  mol.delete()

  return { svg, valid: true, canonical }
}
