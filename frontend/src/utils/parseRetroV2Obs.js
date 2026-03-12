/**
 * Parse retro_v2 user_message text into structured tree state.
 *
 * @param {string} text - The user_message content from a retro_v2 step
 * @returns {{ target, stateId, depth, maxDepth, backboneNodes, backboneRxns,
 *             focusStatus, leafNodes, candidateReactions, historyCount, isGenPhase } | null}
 */
export function parseRetroV2Obs(text) {
  if (!text) return null

  // 1. Target molecule
  const targetMatch = text.match(/\*\*Target Molecule:\*\*\s*(\S+)/)
  const target = targetMatch ? targetMatch[1] : ''

  // 2. State ID and depth
  const stateMatch = text.match(
    /\*\*State ID\*\*:\s*(\S+)\s*\|\s*\*\*Search Depth\*\*:\s*(\d+)\s*\/\s*(\d+)/
  )
  const stateId = stateMatch ? stateMatch[1] : 'S0'
  const depth = stateMatch ? parseInt(stateMatch[2], 10) : 0
  const maxDepth = stateMatch ? parseInt(stateMatch[3], 10) : 10

  // 3. Backbone path section
  const backboneSection = extractSection(text, 'Current Retrosynthetic Backbone Path')
  const { backboneNodes, backboneRxns } = parseBackbone(backboneSection)

  // 4. Focus status (from backbone section's status annotation)
  const focusStatus = extractFocusStatus(backboneSection)

  // 5. Leaf nodes
  const leafSection = extractSection(text, 'Global Leaf Nodes to Resolve')
  const leafNodes = parseLeafNodes(leafSection)

  // 6. Candidate reactions
  const candidateSection = extractSection(text, 'Candidate Reactions at Current Focus Node')
  const candidateReactions = parseCandidateReactions(candidateSection)

  // 7. History
  const historySection = extractSection(text, 'Dead Ends / Exploration History')
  const historyCount = countHistory(historySection)

  return {
    target,
    stateId,
    depth,
    maxDepth,
    backboneNodes,
    backboneRxns,
    focusStatus,
    leafNodes,
    candidateReactions,
    historyCount,
    isGenPhase: candidateReactions.length === 0,
  }
}

/**
 * Extract text of a named section between its header and the next section header (or end).
 * Handles both "- **SectionName**:" and "**SectionName**:" formats.
 */
function extractSection(text, sectionName) {
  // Escape special regex chars in section name
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match the bold header (possibly after "- ")
  const startRegex = new RegExp(`\\*\\*${escaped}[^*]*\\*\\*\\s*:`)
  const startMatch = text.match(startRegex)
  if (!startMatch) return ''

  const start = startMatch.index + startMatch[0].length

  // Find next section header: a line starting with "- **" or "**"
  const rest = text.slice(start)
  const nextMatch = rest.match(/\n\s*-?\s*\*\*[A-Z]/)
  const end = nextMatch ? start + nextMatch.index : text.length

  return text.slice(start, end)
}

/**
 * Parse the backbone chain from backbone section text.
 * Example line:
 *   [N0] SMILES1 → (R0) → [N2] SMILES2 ⚠ (pending expansion)
 * Or single node:
 *   [N0] SMILES ⚠ (pending expansion)
 */
function parseBackbone(sectionText) {
  const backboneNodes = []
  const backboneRxns = []
  if (!sectionText) return { backboneNodes, backboneRxns }

  // Find the line containing the backbone chain (starts with [N...)
  const lineMatch = sectionText.match(/\[N\d+\][^\n]+/)
  if (!lineMatch) return { backboneNodes, backboneRxns }

  const line = lineMatch[0].trim()

  // Split by " → " to get interleaved node/reaction segments
  const parts = line.split(/\s+→\s+/)

  for (const part of parts) {
    const trimmed = part.trim()

    // Reaction token: (R\d+)
    const rxnMatch = trimmed.match(/^\(R(\d+)\)$/)
    if (rxnMatch) {
      backboneRxns.push(`R${rxnMatch[1]}`)
      continue
    }

    // Node token: [N\d+] SMILES ...
    const nodeMatch = trimmed.match(/^\[N(\d+)\]\s+(\S+)/)
    if (nodeMatch) {
      backboneNodes.push({
        id: `N${nodeMatch[1]}`,
        smiles: nodeMatch[2],
      })
    }
  }

  return { backboneNodes, backboneRxns }
}

function extractFocusStatus(sectionText) {
  if (!sectionText) return 'unknown'
  if (/pending expansion/i.test(sectionText)) return 'pending_expansion'
  if (/pending reaction selection/i.test(sectionText)) return 'pending_selection'
  if (/commercial/i.test(sectionText)) return 'commercial'
  if (/solved/i.test(sectionText)) return 'solved'
  return 'unknown'
}

/**
 * Parse leaf nodes from the leaf section.
 * Line format: "  - [N0] CC(...)  ⚠ (pending expansion)"
 *              "  - [N1] CC(...)  ✓ (commercial)"
 */
function parseLeafNodes(sectionText) {
  const nodes = []
  if (!sectionText) return nodes

  // SMILES is non-whitespace; status symbol is ✓, ⚠, or ✗; parenthesized description follows
  const regex = /-\s+\[(N\d+)\]\s+(\S+)\s+(✓|⚠|✗)\s+\(([^)]+)\)/g
  let m
  while ((m = regex.exec(sectionText)) !== null) {
    const symbol = m[3]
    const desc = m[4].toLowerCase()
    let status = 'pending'
    if (symbol === '✓') {
      status = 'commercial'
    } else if (symbol === '✗') {
      status = 'failed'
    } else if (desc.includes('selection')) {
      status = 'pending_selection'
    } else {
      status = 'pending'
    }
    nodes.push({ id: m[1], smiles: m[2], status })
  }

  return nodes
}

/**
 * Parse candidate reactions.
 * Line format: "  - [R0] Precursors: CC(...) ✓ + COC(...) ✗"
 */
function parseCandidateReactions(sectionText) {
  const reactions = []
  if (!sectionText) return reactions

  const regex = /-\s+\[(R\d+)\]\s+Precursors?:\s+(.+)/g
  let m
  while ((m = regex.exec(sectionText)) !== null) {
    const rxnId = m[1]
    const precursorStr = m[2].trim()

    // Split by " + " (possibly surrounded by spaces)
    const precursorParts = precursorStr.split(/\s+\+\s+/)
    const precursors = precursorParts.map(part => {
      const available = part.includes('✓') ? true : part.includes('✗') ? false : null
      // Remove availability symbol and surrounding whitespace
      const smiles = part.replace(/\s*[✓✗]\s*/g, '').trim()
      return { smiles, available }
    })

    reactions.push({ id: rxnId, precursors })
  }

  return reactions
}

function countHistory(sectionText) {
  if (!sectionText) return 0
  const matches = sectionText.match(/abandoned/gi)
  return matches ? matches.length : 0
}
