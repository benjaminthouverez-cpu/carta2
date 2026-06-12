// Gestion des données : sauvegarde locale dans le navigateur (localStorage).
// Aucune connexion, aucun serveur, aucun compte.
//
// Hiérarchie : groupes  ->  colonnes (thèmes)  ->  cartes (sujets).

// Clés distinctes de Carta 1.0 : les deux apps partagent la même origine
// (github.io), donc des clés séparées évitent qu'elles s'écrasent mutuellement.
const STORAGE_KEY = 'carta2-data-v1'

// Préférence d'affichage propre à l'appareil (non synchronisée dans le cloud).
const ZOOM_KEY = 'carta2-zoom'
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.6
export const ZOOM_STEP = 0.1

// Lit le niveau de zoom sauvegardé (1 = 100 % par défaut).
export function loadZoom() {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY))
    if (!Number.isNaN(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  } catch (e) {
    // Stockage indisponible : on ignore.
  }
  return 1
}

// Enregistre le niveau de zoom.
export function saveZoom(z) {
  try {
    localStorage.setItem(ZOOM_KEY, String(z))
  } catch (e) {
    // Stockage indisponible : on ignore.
  }
}

// Génère un identifiant unique simple.
export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Crée une nouvelle carte (sujet). `due` = échéance optionnelle (AAAA-MM-JJ).
export function makeCard(title) {
  return { id: uid(), title, note: '', due: '', people: [] }
}

// Crée une nouvelle colonne (thème).
export function makeColumn(title, cards = []) {
  return { id: uid(), title, cards }
}

// Crée un nouveau groupe (regroupe plusieurs colonnes).
export function makeGroup(title, columns = []) {
  return { id: uid(), title, collapsed: false, columns }
}

// Types de liens entre cartes (clé stockée + libellé affiché).
export const LINK_TYPES = [
  { key: 'lié', label: 'lié à' },
  { key: 'dépend', label: 'dépend de' },
  { key: 'suite', label: 'suite de' },
]

// Crée un lien orienté entre deux cartes (from -> to).
export function makeLink(from, to, type = 'lié') {
  return { id: uid(), from, to, type }
}

// Groupes par défaut au tout premier lancement.
function defaultGroups() {
  return [
    makeGroup('Travail', [makeColumn('US · Dubai'), makeColumn('Europe')]),
    makeGroup('Vie perso', [makeColumn('Idées'), makeColumn('Perso')]),
  ]
}

// Lit les données sauvegardées, ou renvoie l'état par défaut.
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      // Nouvelle version : déjà structurée en groupes.
      if (data && Array.isArray(data.groups)) {
        return {
          groups: data.groups,
          contacts: data.contacts || [],
          links: data.links || [],
          positions: data.positions || {},
        }
      }
      // Ancienne version (colonnes à plat) : on les range dans un groupe
      // pour ne rien perdre.
      if (data && Array.isArray(data.columns)) {
        return {
          groups: [makeGroup('Mes thèmes', data.columns)],
          contacts: data.contacts || [],
          links: [],
          positions: {},
        }
      }
    }
  } catch (e) {
    // Données illisibles : on repart proprement.
  }
  return freshState()
}

// État neuf (tableau d'exemple) — utilisé au tout premier lancement et après
// déconnexion, pour ne pas laisser le tableau de quelqu'un d'autre à l'écran.
export function freshState() {
  return { groups: defaultGroups(), contacts: [], links: [], positions: {} }
}

// Efface le cache local (à la déconnexion sur un navigateur partagé).
export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    // Stockage indisponible : on ignore.
  }
}

// Enregistre l'état complet dans le navigateur.
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    // Stockage indisponible (mode privé strict, etc.) : on ignore.
  }
}
