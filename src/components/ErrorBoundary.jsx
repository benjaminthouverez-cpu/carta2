import { Component } from 'react'

// Filet de sécurité : capture les erreurs de rendu pour éviter une page blanche.
// Les données restent sauvegardées (localStorage + cloud) ; un rechargement
// suffit en général à repartir.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Erreur Carta :', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Oups…</h1>
          <p>Une erreur est survenue. Tes données sont sauvegardées.</p>
          <button className="ghost-btn" onClick={() => window.location.reload()}>
            Recharger l'application
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
