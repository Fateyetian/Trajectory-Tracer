/**
 * Parse retro_v2 OR retro.jsonl user_message text into structured tree state.
 *
 * Supports two formats:
 * - retro_v2: "**State ID**: S0 | **Search Depth**: 0 / 10"
 *              "**Current Retrosynthetic Backbone Path**"
 *              "**Global Leaf Nodes to Resolve**"
 *              "**Candidate Reactions at Current Focus Node**"
 *
 * - retro.jsonl: "**State ID**: S0 | **Focus Depth**: 0 / 10"
 *               "**Backbone Path (Root → Focus)**"
 *               "**All Leaf Nodes (AND — all must be resolved)**"
 *               "**Candidate Reactions**" (grouped by bond type)
 *
 * @param {string} text - The user_message content from a retro_v2 or retro.jsonl step
 * @returns {{ target, stateId, depth, maxDepth, backboneNodes, backboneRxns,
 *             focusStatus, leafNodes, candidateReactions, historyCount, isGenPhase } | null}
 */
export function parseRetroV2Obs(text) {
  if (!text) return null

  // Detect format by looking for distinguishing section names
  const isRetroJsonl = text.includes('**Focus Depth**') || text.includes('Backbone Path (Root → Focus)')
  const isRetroV2 = text.includes('**Search Depth**') || text.includes('Current Retrosynthetic Backbone Path')

  // 1. Target molecule
  const targetMatch = text.match(/\*\*Target Molecule:\*\*\s*(\S+)/)
  const target = targetMatch ? targetMatch[1] : ''

  // 2. State ID and depth (handle both "Search Depth" and "Focus Depth")
  const stateMatch = text.match(
    /\*\*State ID\*\*:\s*(\S+)\s*\|\s*\*\*(?:Search|Focus) Depth\*\*:\s*(\d+)\s*\/\s*(\d+)/
  )
  const stateId = stateMatch ? stateMatch[1] : 'S0'
  const depth = stateMatch ? parseInt(stateMatch[2], 10) : 0
  const maxDepth = stateMatch ? parseInt(stateMatch[3], 10) : 10

  // 3. Backbone path section (handle both format variations)
  let backboneSection = ''
  if (isRetroJsonl) {
    backboneSection = extractSection(text, 'Backbone Path (Root → Focus)')
  } else if (isRetroV2) {
    backboneSection = extractSection(text, 'Current Retrosynthetic Backbone Path')
  } else {
    // Fallback: try retro_v2 style first, then retro.jsonl style
    backboneSection = extractSection(text, 'Current Retrosynthetic Backbone Path') ||
                      extractSection(text, 'Backbone Path (Root → Focus)')
  }
  const { backboneNodes, backboneRxns } = parseBackbone(backboneSection)

  // 4. Focus status (from backbone section's status annotation)
  const focusStatus = extractFocusStatus(backboneSection)

  // 5. Leaf nodes (handle both format variations)
  let leafSection = ''
  if (isRetroJsonl) {
    leafSection = extractSection(text, 'All Leaf Nodes (AND — all must be resolved)')
  } else if (isRetroV2) {
    leafSection = extractSection(text, 'Global Leaf Nodes to Resolve')
  } else {
    leafSection = extractSection(text, 'Global Leaf Nodes to Resolve') ||
                  extractSection(text, 'All Leaf Nodes (AND — all must be resolved)')
  }
  const leafNodes = isRetroJsonl
    ? parseRetroJsonlLeafNodes(leafSection)
    : parseLeafNodes(leafSection)

  // 6. Candidate reactions (handle both format variations)
  let candidateSection = ''
  if (isRetroJsonl) {
    candidateSection = extractSection(text, 'Candidate Reactions')
  } else if (isRetroV2) {
    candidateSection = extractSection(text, 'Candidate Reactions at Current Focus Node')
  } else {
    candidateSection = extractSection(text, 'Candidate Reactions at Current Focus Node') ||
                       extractSection(text, 'Candidate Reactions')
  }
  const candidateReactions = isRetroJsonl
    ? parseRetroJsonlCandidates(candidateSection)
    : parseCandidateReactions(candidateSection)

  // 7. History / Failed Attempts
  let historySection = ''
  if (isRetroJsonl) {
    historySection = extractSection(text, 'Failed Attempts at Current Focus Node')
  } else {
    historySection = extractSection(text, 'Dead Ends / Exploration History')
  }
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
 * Handles two header formats:
 *   - "- **SectionName**:"   (colon after closing **)
 *   - "**SectionName**"      (no colon, section name ends the line)
 *   - "- **SectionName**"    (with leading dash)
 */
function extractSection(text, sectionName) {
  // Escape special regex chars in section name (but not parentheses which are in retro.jsonl)
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Pattern 1: "- **SectionName**:" or "**SectionName**:"
  // Match bold header (possibly with leading "- "), capture content, then closing ** and optional :
  const patterns = [
    // Pattern: bold header with dash, closing ** followed by : or end of line
    new RegExp(`-\\s*\\*\\*${escaped}\\*\\*\\s*[:\\n]`),
    // Pattern: bold header without dash, closing ** followed by : or end of line
    new RegExp(`\\*\\*${escaped}\\*\\*\\s*[:\\n]`),
    // Pattern: bold header with dash, closing ** followed by any content until newline
    new RegExp(`-\\s*\\*\\*${escaped}\\*\\*(.+?)(?=\\n\\s*-?\\s*\\*\\*[A-Z]|$)`, 's'),
    // Pattern: bold header without dash, closing ** followed by any content until newline
    new RegExp(`\\*\\*${escaped}\\*\\*(.+?)(?=\\n\\s*-?\\s*\\*\\*[A-Z]|$)`, 's'),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1] !== undefined) {
      // Content is in group 1
      return match[1].trim()
    } else if (match && match[0]) {
      // Match found but no content group - extract everything after the header
      const headerEnd = match.index + match[0].length
      // Find next section or end
      const rest = text.slice(headerEnd)
      const nextMatch = rest.match(/\n\s*-?\s*\*\*[A-Z]/)
      const end = nextMatch ? headerEnd + nextMatch.index : text.length
      return text.slice(headerEnd, end).trim()
    }
  }

  return ''
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
  const matches = sectionText.match(/abandoned|failed attempts/gi)
  return matches ? matches.length : 0
}

/**
 * Parse candidate reactions from retro.jsonl format.
 * retro.jsonl format:
 *   ▶ [C−C bond: C-C coupling/aldol/Diels-Alder]
 *     [0] COc1cccc(C=O)c1OCCC(C)C(✓) + Cc1nc2sccn2c(=O)c1-c1ccc(C(F)(F)F)cc1(?)  [score=1.000]
 *     [1] SMILES1(?) + SMILES2(✓)  [score=0.000]
 *
 * Converts to: { id: 'R0', precursors: [{ smiles: '...', available: true/false/null }, ...] }
 */
function parseRetroJsonlCandidates(sectionText) {
  const reactions = []
  if (!sectionText) return reactions

  // Split section into lines and process each candidate line (starts with [digit])
  const lines = sectionText.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('▶') || trimmed.startsWith('**') || trimmed === '') {
      continue
    }

    // Match line like: [0] ...precursors...  [score=x.xx]
    // Split on "  [" (double space before score bracket) to separate precursors from score
    const scoreSplit = trimmed.split(/\s{2}\[score=/)
    if (scoreSplit.length < 2) continue

    const idPart = scoreSplit[0].trim()
    const idMatch = idPart.match(/^\[(\d+)\]/)
    if (!idMatch) continue

    const idInt = parseInt(idMatch[1], 10)
    const rxnId = `R${idInt}`
    const precursorStr = idPart.slice(idMatch[0].length).trim()

    // Split by " + " to get individual precursors
    const precursorParts = precursorStr.split(/\s+\+\s+/)
    const precursors = precursorParts.map(part => {
      // Availability: (✓) = true, (✗) = false, (?) = null
      let available = null
      if (part.includes('(✓)') || part.includes('(available)')) {
        available = true
      } else if (part.includes('(✗)') || part.includes('(unavailable)')) {
        available = false
      }
      // Remove availability markers like (✓), (✗), (?), (available), (unavailable)
      const smiles = part
        .replace(/\s*\([✓✗?]\)\s*/g, '')
        .replace(/\s*\(available\)\s*/gi, '')
        .replace(/\s*\(unavailable\)\s*/gi, '')
        .trim()
      return { smiles, available }
    }).filter(p => p.smiles)

    reactions.push({ id: rxnId, precursors })
  }

  return reactions
}

/**
 * Parse leaf nodes from retro.jsonl format.
 * retro.jsonl format (extra space before status symbol):
 *   - [N0] SMILES  ⚠ (pending expansion)
 *   - [N1] SMILES  ✓ (commercial)
 */
function parseRetroJsonlLeafNodes(sectionText) {
  const nodes = []
  if (!sectionText) return nodes

  // Same as parseLeafNodes but allows multiple spaces before status
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
