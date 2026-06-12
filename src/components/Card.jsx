import { useRef, useState } from 'react'
import { LINK_TYPES } from '../storage'

// Libellé affiché pour chaque type de lien.
const LINK_LABEL = Object.fromEntries(LINK_TYPES.map(t => [t.key, t.label]))

// Mots vides ignorés pour les suggestions de liens (FR + EN courants).
const STOPWORDS = new Set([
  'avec', 'pour', 'dans', 'les', 'des', 'une', 'un', 'le', 'la', 'de', 'du',
  'et', 'en', 'sur', 'par', 'que', 'qui', 'aux', 'ses', 'son', 'sa', 'nos',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'our',
])

// Extrait les mots-clés significatifs d'un texte (≥ 4 lettres, hors mots vides).
function keywordSet(text) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w))
  )
}

// Nombre de mots-clés communs entre deux ensembles.
function overlap(a, b) {
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n
}

// Une carte = un sujet, avec titre, note, personnes et liens.
export default function Card({
  card,
  columnId,
  columnTitle,
  columns,
  contacts,
  isDropTarget,
  onUpdate,
  onDelete,
  onMove,
  linkApi,
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [linkTarget, setLinkTarget] = useState('')
  const [linkType, setLinkType] = useState('lié')
  // @mention en cours dans la note : { query, index } ou null.
  const [mention, setMention] = useState(null)
  const noteRef = useRef(null)

  // Échéance dépassée ? (comparaison de dates au format AAAA-MM-JJ).
  const isOverdue = !!card.due && card.due < new Date().toISOString().slice(0, 10)

  // Construit le lien de composition Gmail pré-rempli (ouvre Gmail dans le
  // navigateur plutôt que l'application mail par défaut comme le ferait mailto:).
  function emailHref() {
    const assigned = contacts.filter(c => card.people.includes(c.id))
    const to = assigned.map(c => c.email).filter(Boolean).join(',')
    const lines = []
    if (card.note) lines.push(card.note)
    lines.push('', `Thème : ${columnTitle}`)
    const params = new URLSearchParams({
      view: 'cm', // mode composition
      fs: '1', // plein écran
      to,
      su: card.title,
      body: lines.join('\n'),
    })
    return `https://mail.google.com/mail/?${params.toString()}`
  }

  const assignedNames = contacts
    .filter(c => card.people.includes(c.id))
    .map(c => c.name)

  // ---------- Liens ----------
  const myLinks = linkApi.links.filter(l => l.from === card.id || l.to === card.id)
  const otherCards = linkApi.cards.filter(c => c.id !== card.id)

  // L'autre extrémité d'un lien (la carte qui n'est pas celle-ci).
  function otherEnd(l) {
    const id = l.from === card.id ? l.to : l.from
    const c = linkApi.cards.find(x => x.id === id)
    return { id, title: c ? c.title || 'Sans titre' : '(carte supprimée)' }
  }

  function submitLink() {
    if (!linkTarget) return
    linkApi.onAdd(card.id, linkTarget, linkType)
    setLinkTarget('')
  }

  // Fait défiler jusqu'à une carte liée et l'illumine brièvement.
  function jumpTo(id) {
    const el = document.getElementById('card-' + id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    linkApi.onHover(id)
    setTimeout(() => linkApi.onHover(null), 1400)
  }

  // ---------- @mention dans la note ----------
  // Détecte un « @mot » juste avant le curseur pour proposer une carte.
  function detectMention(el) {
    const before = el.value.slice(0, el.selectionStart)
    const m = before.match(/@([^\s@]*)$/)
    setMention(m ? { query: m[1], index: 0 } : null)
  }

  const mentionMatches = mention
    ? linkApi.cards
        .filter(
          c =>
            c.id !== card.id &&
            (c.title || 'Sans titre').toLowerCase().includes(mention.query.toLowerCase())
        )
        .slice(0, 6)
    : []

  // Remplace le « @query » par « @Titre » et crée le lien correspondant.
  function applyMention(target) {
    const el = noteRef.current
    const caret = el ? el.selectionStart : card.note.length
    const before = card.note.slice(0, caret)
    const after = card.note.slice(caret)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return
    const title = target.title || 'Sans titre'
    onUpdate({ ...card, note: before.slice(0, atIdx) + '@' + title + ' ' + after })
    linkApi.onAdd(card.id, target.id, 'lié')
    setMention(null)
  }

  // ---------- Suggestions de liens (mots-clés communs) ----------
  const linkedSet = new Set(myLinks.map(l => (l.from === card.id ? l.to : l.from)))
  const myWords = keywordSet((card.title || '') + ' ' + (card.note || ''))
  const suggestions =
    myWords.size === 0
      ? []
      : linkApi.cards
          .filter(c => c.id !== card.id && !linkedSet.has(c.id))
          .map(c => ({
            id: c.id,
            title: c.title,
            score: overlap(myWords, keywordSet((c.title || '') + ' ' + (c.note || ''))),
          }))
          .filter(c => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)

  // États visuels de surlignage selon la carte survolée dans tout le tableau.
  const isHover = linkApi.hoverId === card.id
  const isLinked = linkApi.linkedIds.has(card.id)
  const dim = linkApi.hoverId && !isHover && !isLinked
  const className =
    'card' +
    (isHover ? ' card-hover' : '') +
    (isLinked ? ' card-linked' : '') +
    (dim ? ' card-dim' : '') +
    (isDropTarget ? ' card-drop-before' : '')

  return (
    <article
      id={'card-' + card.id}
      className={className}
      draggable
      data-card-id={card.id}
      onMouseEnter={() => linkApi.onHover(card.id)}
      onMouseLeave={() => linkApi.onHover(null)}
      onDragStart={e => {
        e.dataTransfer.setData(
          'text/plain',
          JSON.stringify({ cardId: card.id, fromCol: columnId })
        )
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <div className="card-top">
        <input
          type="date"
          className={`due-input${isOverdue ? ' due-overdue' : ''}`}
          value={card.due || ''}
          onChange={e => onUpdate({ ...card, due: e.target.value })}
          title={isOverdue ? 'Échéance dépassée' : 'Échéance'}
        />
        <button className="icon-btn" title="Supprimer la carte" onClick={() => onDelete(card.id)}>
          ×
        </button>
      </div>

      {editingTitle ? (
        <input
          className="card-title-input"
          autoFocus
          value={card.title}
          onChange={e => onUpdate({ ...card, title: e.target.value })}
          onBlur={() => setEditingTitle(false)}
          onKeyDown={e => {
            if (e.key === 'Enter') setEditingTitle(false)
          }}
        />
      ) : (
        <h4 className="card-title" onClick={() => setEditingTitle(true)} title="Cliquer pour modifier">
          {card.title || 'Sans titre'}
        </h4>
      )}

      {editingNote ? (
        <div className="note-edit">
          <textarea
            ref={noteRef}
            className="card-note-input"
            autoFocus
            value={card.note}
            placeholder="Écrire une note… (@ pour lier une carte)"
            onChange={e => {
              onUpdate({ ...card, note: e.target.value })
              detectMention(e.target)
            }}
            onClick={e => detectMention(e.target)}
            onKeyUp={e => {
              if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
                detectMention(e.target)
              }
            }}
            onKeyDown={e => {
              if (!mention || mentionMatches.length === 0) {
                if (e.key === 'Escape') setMention(null)
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMention(m => ({ ...m, index: (m.index + 1) % mentionMatches.length }))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMention(m => ({
                  ...m,
                  index: (m.index - 1 + mentionMatches.length) % mentionMatches.length,
                }))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                applyMention(mentionMatches[mention.index] || mentionMatches[0])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
              }
            }}
            onBlur={() => setTimeout(() => setEditingNote(false), 120)}
          />
          {mention && mentionMatches.length > 0 && (
            <ul className="mention-list">
              {mentionMatches.map((c, i) => (
                <li key={c.id}>
                  <button
                    className={`mention-item${i === mention.index ? ' active' : ''}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      applyMention(c)
                    }}
                  >
                    {c.title || 'Sans titre'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p
          className={`card-note ${card.note ? '' : 'empty'}`}
          onClick={() => setEditingNote(true)}
          title="Cliquer pour modifier la note"
        >
          {card.note || 'Ajouter une note…'}
        </p>
      )}

      {assignedNames.length > 0 && (
        <div className="people-chips">
          {assignedNames.map(n => (
            <span key={n} className="chip">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="card-actions">
        <a
          className="mini-btn"
          href={emailHref()}
          target="_blank"
          rel="noopener noreferrer"
          title="Envoyer par e-mail"
        >
          ✉
        </a>
        <button
          className={`mini-btn${myLinks.length ? ' has-links' : ''}`}
          onClick={() => setShowLinks(s => !s)}
          title="Lier à d'autres cartes"
        >
          🔗{myLinks.length ? ` ${myLinks.length}` : ''}
        </button>
        {/* Menu de secours pour mobile : déplacer la carte sans glisser-déposer. */}
        <select
          className="move-select"
          value=""
          onChange={e => {
            if (e.target.value) onMove(card.id, columnId, e.target.value)
          }}
          title="Déplacer vers une autre colonne"
        >
          <option value="">↦</option>
          {columns
            .filter(c => c.id !== columnId)
            .map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
        </select>
      </div>

      {showLinks && (
        <div className="link-popover">
          {myLinks.length > 0 && (
            <ul className="link-list">
              {myLinks.map(l => {
                const o = otherEnd(l)
                const dir = l.type === 'lié' ? '↔' : l.from === card.id ? '→' : '←'
                return (
                  <li key={l.id}>
                    <button
                      className="link-jump"
                      onClick={() => jumpTo(o.id)}
                      title={`${LINK_LABEL[l.type] || l.type} · aller à la carte`}
                    >
                      <span className="link-dir">{dir}</span> {o.title}
                    </button>
                    <button
                      className="icon-btn"
                      title="Supprimer le lien"
                      onClick={() => linkApi.onDelete(l.id)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {suggestions.length > 0 && (
            <div className="link-suggestions">
              <span className="link-sug-label">Suggestions</span>
              <div className="link-sug-chips">
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    className="link-sug-chip"
                    onClick={() => linkApi.onAdd(card.id, s.id, 'lié')}
                    title="Créer un lien « lié à »"
                  >
                    ＋ {s.title || 'Sans titre'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {otherCards.length === 0 ? (
            <p className="muted">Aucune autre carte à lier.</p>
          ) : (
            <div className="link-form">
              <select value={linkType} onChange={e => setLinkType(e.target.value)}>
                {LINK_TYPES.map(t => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select value={linkTarget} onChange={e => setLinkTarget(e.target.value)}>
                <option value="">Choisir une carte…</option>
                {otherCards.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title || 'Sans titre'}
                  </option>
                ))}
              </select>
              <button className="add-btn" onClick={submitLink} title="Créer le lien">
                ＋
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
