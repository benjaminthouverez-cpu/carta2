import { useState } from 'react'

// Carnet de contacts local, saisi à la main. Aucune connexion Google.
export default function ContactBook({ contacts, onAdd, onDelete, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  function add() {
    const n = name.trim()
    if (!n) return
    onAdd(n, email.trim())
    setName('')
    setEmail('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Carnet de contacts</h2>
          <button className="icon-btn" onClick={onClose} title="Fermer">
            ×
          </button>
        </div>

        <div className="contact-form">
          <input
            placeholder="Nom"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') add()
            }}
          />
          <input
            placeholder="E-mail (optionnel)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') add()
            }}
          />
          <button className="add-btn" onClick={add} title="Ajouter le contact">
            ＋
          </button>
        </div>

        <ul className="contact-list">
          {contacts.length === 0 && (
            <li className="muted">Aucun contact pour l'instant.</li>
          )}
          {contacts.map(c => (
            <li key={c.id}>
              <span>
                <strong>{c.name}</strong>
                {c.email ? ` · ${c.email}` : ''}
              </span>
              <button
                className="icon-btn"
                onClick={() => onDelete(c.id)}
                title="Supprimer le contact"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
