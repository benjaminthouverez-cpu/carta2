import { useState } from 'react'
import Card from './Card'

// Une colonne = un thème, contenant des cartes. Elle appartient à un groupe.
export default function Column({
  column,
  groupId,
  groups,
  allColumns,
  contacts,
  isVisibleCard,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
  onManageContacts,
  linkApi,
}) {
  const [newTitle, setNewTitle] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // Carte actuellement survolée pendant un glisser (repère « insérer ici »).
  const [dropTargetId, setDropTargetId] = useState(null)

  // Identifiant de la carte sous le curseur pendant un glisser-déposer.
  function cardIdAt(e) {
    const el = e.target && e.target.closest ? e.target.closest('[data-card-id]') : null
    return el ? el.getAttribute('data-card-id') : null
  }

  // Ajoute une carte à partir du champ « + ajouter un sujet ».
  function addCard() {
    const t = newTitle.trim()
    if (!t) return
    onAddCard(column.id, t)
    setNewTitle('')
  }

  // Réception d'une carte glissée-déposée dans cette colonne. Si elle est lâchée
  // sur une carte précise, on l'insère juste avant (réordonnancement) ; sinon on
  // l'ajoute à la fin.
  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    setDropTargetId(null)
    try {
      const { cardId, fromCol } = JSON.parse(e.dataTransfer.getData('text/plain'))
      const beforeId = cardIdAt(e)
      if (beforeId && beforeId !== cardId) {
        onMoveCard(cardId, fromCol, column.id, beforeId)
      } else {
        onMoveCard(cardId, fromCol, column.id)
      }
    } catch (err) {
      // Donnée de glisser-déposer invalide : on ignore.
    }
  }

  const visibleCards = column.cards.filter(isVisibleCard)

  return (
    <section
      className={`column ${dragOver ? 'drag-over' : ''}`}
      onDragOver={e => {
        e.preventDefault()
        if (!dragOver) setDragOver(true)
        const id = cardIdAt(e)
        if (id !== dropTargetId) setDropTargetId(id)
      }}
      onDragLeave={e => {
        // On ne réinitialise que si l'on quitte vraiment la colonne (pas en
        // passant d'une carte à l'autre à l'intérieur).
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setDragOver(false)
          setDropTargetId(null)
        }
      }}
      onDrop={handleDrop}
    >
      <div className="column-header">
        {editingName ? (
          <input
            className="column-name-input"
            autoFocus
            value={column.title}
            onChange={e => onRenameColumn(column.id, e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') setEditingName(false)
            }}
          />
        ) : (
          <h3
            className="column-name"
            onClick={() => setEditingName(true)}
            title="Cliquer pour renommer"
          >
            {column.title}
          </h3>
        )}
        <div className="column-meta">
          <span className="count">{visibleCards.length}</span>
          {/* Déplacer toute la colonne vers un autre groupe. */}
          {groups.length > 1 && (
            <select
              className="move-col-select"
              value=""
              onChange={e => {
                if (e.target.value) onMoveColumn(column.id, e.target.value)
              }}
              title="Déplacer cette colonne vers un autre groupe"
            >
              <option value="">↦</option>
              {groups
                .filter(g => g.id !== groupId)
                .map(g => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          )}
          <button
            className="icon-btn"
            title="Supprimer la colonne"
            onClick={() => onDeleteColumn(column.id)}
          >
            ×
          </button>
        </div>
      </div>

      <div className="cards">
        {visibleCards.map(card => (
          <Card
            key={card.id}
            card={card}
            columnId={column.id}
            columnTitle={column.title}
            columns={allColumns}
            contacts={contacts}
            isDropTarget={dropTargetId === card.id}
            onUpdate={onUpdateCard}
            onDelete={onDeleteCard}
            onMove={onMoveCard}
            onManageContacts={onManageContacts}
            linkApi={linkApi}
          />
        ))}
      </div>

      <div className="add-card">
        <input
          value={newTitle}
          placeholder="+ ajouter un sujet"
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addCard()
          }}
        />
        <button className="add-btn" onClick={addCard} title="Ajouter le sujet">
          ＋
        </button>
      </div>
    </section>
  )
}
