import { useState } from 'react'

// Validation basique d'une adresse e-mail (avant d'appeler Supabase).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Barre de connexion par e-mail + mot de passe + état de la synchronisation.
export default function AuthBar({
  configured,
  session,
  status,
  recovering,
  onSignIn,
  onSignUp,
  onResetPassword,
  onUpdatePassword,
  onSignOut,
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSignIn() {
    const e = email.trim()
    if (!e || !password) return
    if (!EMAIL_RE.test(e)) {
      setMessage('Adresse e-mail invalide.')
      return
    }
    setMessage('Connexion…')
    const res = await onSignIn(e, password)
    if (res.ok) {
      setPassword('')
      setMessage('')
    } else {
      setMessage(res.message || 'Échec de la connexion.')
    }
  }

  async function handleSignUp() {
    const e = email.trim()
    if (!e || !password) {
      setMessage('Saisis un e-mail et un mot de passe pour créer un compte.')
      return
    }
    if (!EMAIL_RE.test(e)) {
      setMessage('Adresse e-mail invalide.')
      return
    }
    if (password.length < 6) {
      setMessage('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    setMessage('Création du compte…')
    const res = await onSignUp(e, password)
    if (res.ok) {
      setPassword('')
      setMessage(
        res.needsConfirm
          ? 'Compte créé — vérifie tes e-mails pour confirmer, puis connecte-toi.'
          : ''
      )
    } else {
      setMessage(res.message || 'Échec de la création du compte.')
    }
  }

  async function handleReset() {
    const e = email.trim()
    if (!e) {
      setMessage('Saisis ton e-mail pour recevoir le lien de réinitialisation.')
      return
    }
    setMessage('Envoi du lien…')
    const res = await onResetPassword(e)
    setMessage(
      res.ok
        ? 'E-mail de réinitialisation envoyé — vérifie ta boîte (et les spams).'
        : res.message || "Échec de l'envoi."
    )
  }

  async function handleUpdatePassword() {
    if (!password) {
      setMessage('Saisis un nouveau mot de passe.')
      return
    }
    setMessage('Mise à jour…')
    const res = await onUpdatePassword(password)
    if (res.ok) {
      setPassword('')
      setMessage('Mot de passe mis à jour.')
    } else {
      setMessage(res.message || 'Échec de la mise à jour.')
    }
  }

  // Synchronisation pas encore configurée (avant d'avoir branché Supabase).
  if (!configured) {
    return (
      <div className="auth-bar">
        <span className="sync-state muted">Synchronisation non configurée (mode local)</span>
      </div>
    )
  }

  // Récupération : la personne est revenue via le lien « mot de passe oublié »
  // et doit choisir un nouveau mot de passe.
  if (recovering) {
    return (
      <div className="auth-bar">
        <input
          className="auth-email"
          type="password"
          placeholder="nouveau mot de passe"
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleUpdatePassword()
          }}
        />
        <button className="ghost-btn small" onClick={handleUpdatePassword}>
          Définir le mot de passe
        </button>
        {message && <span className="sync-state muted">{message}</span>}
      </div>
    )
  }

  // Connecté : on affiche l'e-mail et un bouton de déconnexion.
  if (session) {
    return (
      <div className="auth-bar">
        <span className="sync-dot" title="Synchronisé">●</span>
        <span className="sync-state">
          {session.user.email}
          {status ? ` · ${status}` : ''}
        </span>
        <button className="ghost-btn small" onClick={onSignOut}>
          Déconnexion
        </button>
      </div>
    )
  }

  // Déconnecté : e-mail + mot de passe pour se connecter.
  return (
    <div className="auth-bar">
      <input
        className="auth-email"
        type="email"
        placeholder="e-mail"
        autoComplete="username"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSignIn()
        }}
      />
      <input
        className="auth-email"
        type="password"
        placeholder="mot de passe"
        autoComplete="current-password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSignIn()
        }}
      />
      <button className="ghost-btn small" onClick={handleSignIn}>
        Se connecter
      </button>
      <button className="ghost-btn small" onClick={handleSignUp}>
        Créer un compte
      </button>
      <button className="link-btn small" onClick={handleReset}>
        Mot de passe oublié ?
      </button>
      {message && <span className="sync-state muted">{message}</span>}
    </div>
  )
}
