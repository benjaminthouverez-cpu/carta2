import { useState } from 'react'
import Column from './Column'

// Un groupe = un grand thème repliable, contenant plusieurs colonnes.
export default function Group({
  group,
  groups,
  allColumns,
  contacts,
  isVisibleCard,
  onToggle,
  onRenameGroup,
  onDeleteGroup,
  onAddColumn,
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
  const [editingName, setEditingName] = useState(false)

  // Nombre de cartes visibles (selon le filtre/recherche) dans tout le groupe.
  const visibleCount = group.columns.reduce(
    (n, col) => n + col.cards.filter(isVisibleCard).length,
    0
  )

  return (
    <section className="group">
      <div className="group-header">
        <button
          className="collapse-btn"
          onClick={() => onToggle(group.id)}
          title={group.collapsed ? 'Déplier le groupe' : 'Replier le groupe'}
        >
          {group.collapsed ? '▸' : '▾'}
        </button>

        {editingName ? (
          <input
            className="group-name-input"
            autoFocus
            value={group.title}
            onChange={e => onRenameGroup(group.id, e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') setEditingName(false)
            }}
          />
        ) : (
          <h2
            className="group-name"
            onClick={() => setEditingName(true)}
            title="Cliquer pour renommer le groupe"
          >
            {group.title}
          </h2>
        )}

        <span className="group-count">{visibleCount}</span>

        <div className="group-actions">
          <button className="ghost-btn small" onClick={() => onAddColumn(group.id)}>
            ＋ Colonne
          </button>
          <button
            className="icon-btn"
            title="Supprimer le groupe"
            onClick={() => onDeleteGroup(group.id)}
          >
            ×
          </button>
        </div>
      </div>

      {!group.collapsed && (
        <div className="group-columns">
          {group.columns.map(col => (
            <Column
              key={col.id}
              column={col}
              groupId={group.id}
              groups={groups}
              allColumns={allColumns}
              contacts={contacts}
              isVisibleCard={isVisibleCard}
              onAddCard={onAddCard}
              onUpdateCard={onUpdateCard}
              onDeleteCard={onDeleteCard}
              onMoveCard={onMoveCard}
              onRenameColumn={onRenameColumn}
              onDeleteColumn={onDeleteColumn}
              onMoveColumn={onMoveColumn}
              onManageContacts={onManageContacts}
              linkApi={linkApi}
            />
          ))}
          {group.columns.length === 0 && (
            <p className="empty-group muted">
              Aucune colonne ici. Cliquez sur « ＋ Colonne ».
            </p>
          )}
        </div>
      )}
    </section>
  )
}
