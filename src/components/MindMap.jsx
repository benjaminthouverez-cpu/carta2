import { useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Construit les nœuds React Flow à partir des cartes + positions mémorisées.
function buildNodes(cards, positions) {
  return cards.map((c, i) => ({
    id: c.id,
    // Position mémorisée, sinon disposition en grille par défaut.
    position: positions[c.id] || { x: (i % 5) * 230, y: Math.floor(i / 5) * 140 },
    data: { label: c.title || 'Sans titre' },
    style: {
      background: '#f0dcc4',
      border: '1px solid #d98a3b',
      borderRadius: 10,
      padding: 8,
      fontSize: 13,
      width: 180,
      color: '#2c1f14',
    },
  }))
}

// Construit les arêtes à partir des liens (flèche pour les liens orientés).
function buildEdges(links, typeLabel) {
  return links.map(l => ({
    id: l.id,
    source: l.from,
    target: l.to,
    label: typeLabel[l.type] || l.type,
    animated: l.type === 'dépend',
    markerEnd: l.type === 'lié' ? undefined : { type: MarkerType.ArrowClosed },
    style: { stroke: '#9a5b34' },
    labelStyle: { fontSize: 11, fill: '#7a6555' },
  }))
}

// Vue carte mentale : cartes = nœuds, liens = arêtes. Glisser d'un nœud à
// l'autre crée un lien ; sélectionner une arête + Suppr la retire.
export default function MindMap({
  cards,
  links,
  positions,
  typeLabel,
  onConnect,
  onDeleteLinks,
  onMoveNode,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes(cards, positions))
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges(links, typeLabel))

  // Reconstruit les nœuds quand l'ensemble des cartes change (ajout/suppression,
  // titre) — sans réagir aux simples déplacements (gérés localement).
  const cardsKey = cards.map(c => `${c.id}:${c.title}`).join('|')
  useEffect(() => {
    setNodes(buildNodes(cards, positions))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsKey])

  const linksKey = links.map(l => `${l.id}:${l.type}`).join('|')
  useEffect(() => {
    setEdges(buildEdges(links, typeLabel))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey])

  function handleConnect(params) {
    if (params.source && params.target && params.source !== params.target) {
      onConnect(params.source, params.target)
    }
  }

  return (
    <div className="mindmap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={(_e, node) => onMoveNode(node.id, node.position)}
        onEdgesDelete={eds => onDeleteLinks(eds.map(e => e.id))}
        fitView
        minZoom={0.2}
      >
        <Background gap={18} color="#e6ddcd" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}
