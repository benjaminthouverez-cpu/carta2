import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Group from './components/Group'
import ContactBook from './components/ContactBook'
import AuthBar from './components/AuthBar'
import { supabase } from './supabase'
import {
  loadState,
  saveState,
  clearState,
  freshState,
  makeCard,
  makeColumn,
  makeGroup,
  makeLink,
  uid,
  loadZoom,
  saveZoom,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  LINK_TYPES,
} from './storage'

// Libellé affiché pour chaque type de lien.
const LINK_LABEL = Object.fromEntries(LINK_TYPES.map(t => [t.key, t.label]))

// La vue carte mentale embarque React Flow : on la charge à la demande pour
// alléger le chargement initial de l'app.
const MindMap = lazy(() => import('./components/MindMap'))

// Identifiant unique de cet onglet/appareil. Il sert à reconnaître — et donc à
// ignorer — nos PROPRES mises à jour qui nous reviennent en temps réel.
// (Supabase stocke en JSON « jsonb » et réordonne les clés : on ne peut donc
// pas se fier à une simple comparaison de texte pour repérer notre écho.)
const CLIENT_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export default function App() {
  // On charge une seule fois l'état sauvegardé localement au démarrage
  // (cache hors-ligne ; remplacé par les données du cloud après connexion).
  const initial = loadState()
  const [groups, setGroups] = useState(initial.groups)
  const [contacts, setContacts] = useState(initial.contacts)
  // Liens entre cartes, stockés à plat : { id, from, to, type }.
  const [links, setLinks] = useState(initial.links || [])
  // Positions des nœuds dans la vue carte mentale : { cardId: {x, y} }.
  const [positions, setPositions] = useState(initial.positions || {})
  // Carte survolée : sert à illuminer ses cartes liées dans tout le tableau.
  const [hoverId, setHoverId] = useState(null)
  const [search, setSearch] = useState('')
  // Filtre : n'afficher que les cartes en retard (échéance passée).
  const [dueOnly, setDueOnly] = useState(false)
  // Événement « beforeinstallprompt » mémorisé pour proposer l'installation PWA.
  const [installEvt, setInstallEvt] = useState(null)
  const [showContacts, setShowContacts] = useState(false)
  // Vue : 'tableau' (kanban) ou 'mindmap' (carte mentale).
  const [boardView, setBoardView] = useState('tableau')
  // Niveau de zoom de l'affichage (réglage local, persisté par appareil).
  const [zoom, setZoom] = useState(loadZoom)

  // Synchronisation cloud (Supabase).
  const [session, setSession] = useState(null)
  // true quand la personne revient via un lien « mot de passe oublié » et doit
  // définir un nouveau mot de passe.
  const [recovering, setRecovering] = useState(false)
  // Permet d'annuler la dernière suppression (carte/colonne/groupe).
  // undoState = { label } pendant que le toast est visible, sinon null.
  const [undoState, setUndoState] = useState(null)
  const undoSnapRef = useRef(null) // état complet capturé avant la suppression
  const undoTimerRef = useRef(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [status, setStatus] = useState('')
  const lastSyncedRef = useRef(null) // dernier contenu envoyé/reçu (anti-boucle)
  const saveTimerRef = useRef(null)
  const stateRef = useRef({ groups, contacts, links, positions })
  stateRef.current = { groups, contacts, links, positions }

  // --- Suivi de la session de connexion ---
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // --- Au login : on charge les données du cloud ---
  useEffect(() => {
    if (!supabase || !session) {
      setCloudReady(false)
      return
    }
    let cancelled = false
    async function load() {
      setCloudReady(false)
      setStatus('Chargement…')
      const { data, error } = await supabase
        .from('boards')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setStatus('Erreur de chargement')
        setCloudReady(true)
        return
      }
      if (data && data.data && Array.isArray(data.data.groups)) {
        // Le cloud fait foi : on adopte ses données (on ne garde que le contenu
        // du tableau, sans les métadonnées internes comme _writer).
        const content = {
          groups: data.data.groups,
          contacts: data.data.contacts || [],
          links: data.data.links || [],
          positions: data.data.positions || {},
        }
        lastSyncedRef.current = JSON.stringify(content)
        setGroups(content.groups)
        setContacts(content.contacts)
        setLinks(content.links)
        setPositions(content.positions)
        setStatus('Synchronisé')
      } else {
        // Aucune donnée dans le cloud : on y pousse l'état local actuel.
        await pushToCloud(session.user.id, stateRef.current)
      }
      setCloudReady(true)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session])

  // --- Mise à jour en direct depuis un autre appareil ---
  useEffect(() => {
    if (!supabase || !session) return
    const channel = supabase
      .channel('board-' + session.user.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boards',
          filter: 'user_id=eq.' + session.user.id,
        },
        payload => {
          const row = payload.new
          if (!row || !row.data || !Array.isArray(row.data.groups)) return
          // On ignore nos propres écritures (même appareil) : elles sont déjà
          // appliquées localement. On n'applique que les vraies mises à jour
          // venant d'un AUTRE appareil.
          if (row.data._writer === CLIENT_ID) return
          const content = {
            groups: row.data.groups,
            contacts: row.data.contacts || [],
            links: row.data.links || [],
            positions: row.data.positions || {},
          }
          lastSyncedRef.current = JSON.stringify(content)
          setGroups(content.groups)
          setContacts(content.contacts)
          setLinks(content.links)
          setPositions(content.positions)
          setStatus('Mis à jour depuis un autre appareil')
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  // --- Sauvegarde : locale toujours, cloud si connecté ---
  useEffect(() => {
    const payload = { groups, contacts, links, positions }
    saveState(payload) // cache local (hors-ligne)

    if (!supabase || !session) return
    if (!cloudReady) return // on attend la fin du chargement initial
    const json = JSON.stringify(payload)
    if (json === lastSyncedRef.current) return // rien de neuf

    setStatus('Sauvegarde…')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      pushToCloud(session.user.id, payload)
    }, 700)
  }, [groups, contacts, links, positions, session, cloudReady])

  // Envoie l'état complet vers le cloud.
  async function pushToCloud(userId, payload) {
    const json = JSON.stringify(payload)
    const { error } = await supabase.from('boards').upsert({
      user_id: userId,
      // On marque l'écriture avec notre identifiant d'appareil pour pouvoir
      // ignorer l'écho temps-réel qui nous reviendra.
      data: { ...payload, _writer: CLIENT_ID },
      updated_at: new Date().toISOString(),
    })
    if (error) {
      setStatus('Erreur de sauvegarde')
    } else {
      lastSyncedRef.current = json
      setStatus('Synchronisé')
    }
  }

  // Connexion par e-mail + mot de passe.
  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { ok: false, message: error.message } : { ok: true }
  }

  // Création de compte en self-service : chaque personne s'inscrit elle-même
  // et obtient son propre tableau privé.
  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { ok: false, message: error.message }
    // Si la confirmation d'e-mail est activée côté Supabase, aucune session
    // n'est ouverte tout de suite : la personne doit valider via l'e-mail reçu.
    return { ok: true, needsConfirm: !data.session }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setStatus('')
    // On vide le cache local et on revient à un tableau neuf, pour qu'un autre
    // utilisateur du même navigateur ne voie pas le tableau précédent.
    clearState()
    const fresh = freshState()
    setGroups(fresh.groups)
    setContacts(fresh.contacts)
    setLinks(fresh.links)
    setPositions(fresh.positions)
    lastSyncedRef.current = null
  }

  // Envoie un e-mail de réinitialisation. Le lien ramène vers l'app, où la
  // personne pourra définir un nouveau mot de passe.
  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href,
    })
    return error ? { ok: false, message: error.message } : { ok: true }
  }

  // Définit le nouveau mot de passe (après clic sur le lien de récupération).
  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, message: error.message }
    setRecovering(false)
    return { ok: true }
  }

  // Toutes les colonnes, tous groupes confondus (utile pour déplacer une carte).
  const allColumns = groups.flatMap(g => g.columns)

  // ---------- Annulation des suppressions ----------
  // Mémorise l'état complet AVANT une suppression et affiche un toast « Annuler »
  // pendant quelques secondes. stateRef.current reflète l'état du rendu courant
  // (les setState étant asynchrones, il contient encore les données pré-suppression).
  function captureUndo(label) {
    undoSnapRef.current = stateRef.current
    setUndoState({ label })
    clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => setUndoState(null), 6000)
  }

  // Restaure l'état capturé (la synchro cloud suivra automatiquement).
  function performUndo() {
    const snap = undoSnapRef.current
    if (!snap) return
    setGroups(snap.groups)
    setContacts(snap.contacts)
    setLinks(snap.links)
    setPositions(snap.positions)
    setUndoState(null)
    clearTimeout(undoTimerRef.current)
  }

  // ---------- Cartes (sujets) ----------
  function addCard(columnId, title) {
    setGroups(gs =>
      gs.map(g => ({
        ...g,
        columns: g.columns.map(c =>
          c.id === columnId ? { ...c, cards: [...c.cards, makeCard(title)] } : c
        ),
      }))
    )
  }

  function updateCard(updated) {
    setGroups(gs =>
      gs.map(g => ({
        ...g,
        columns: g.columns.map(c => ({
          ...c,
          cards: c.cards.map(card => (card.id === updated.id ? updated : card)),
        })),
      }))
    )
  }

  function deleteCard(cardId) {
    captureUndo('Carte supprimée')
    setGroups(gs =>
      gs.map(g => ({
        ...g,
        columns: g.columns.map(c => ({
          ...c,
          cards: c.cards.filter(card => card.id !== cardId),
        })),
      }))
    )
    // On retire aussi les liens qui touchaient cette carte, et sa position.
    setLinks(ls => ls.filter(l => l.from !== cardId && l.to !== cardId))
    setPositions(p => {
      if (!(cardId in p)) return p
      const next = { ...p }
      delete next[cardId]
      return next
    })
  }

  // ---------- Liens entre cartes ----------
  function addLink(from, to, type) {
    if (!from || !to || from === to) return
    setLinks(ls => {
      const exists = ls.some(
        l =>
          l.type === type &&
          ((l.from === from && l.to === to) ||
            // Un lien neutre « lié à » est non orienté : on évite le doublon inverse.
            (type === 'lié' && l.from === to && l.to === from))
      )
      return exists ? ls : [...ls, makeLink(from, to, type)]
    })
  }

  function deleteLink(linkId) {
    setLinks(ls => ls.filter(l => l.id !== linkId))
  }

  // Supprime plusieurs liens d'un coup (depuis la vue carte mentale).
  function deleteLinks(ids) {
    const set = new Set(ids)
    setLinks(ls => ls.filter(l => !set.has(l.id)))
  }

  // Mémorise la position d'un nœud dans la vue carte mentale.
  function setNodePosition(cardId, pos) {
    setPositions(p => ({ ...p, [cardId]: pos }))
  }

  // Retire les liens et positions associés à un ensemble de cartes (utilisé
  // quand on supprime une colonne ou un groupe entier, pour ne pas laisser de
  // liens « fantômes »).
  function cleanupCards(cards) {
    if (!cards || cards.length === 0) return
    const ids = new Set(cards.map(c => c.id))
    setLinks(ls => ls.filter(l => !ids.has(l.from) && !ids.has(l.to)))
    setPositions(p => {
      let changed = false
      const next = { ...p }
      for (const id of ids) {
        if (id in next) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : p
    })
  }

  // Déplace une carte vers une autre colonne (n'importe quel groupe) ou la
  // réordonne dans la même colonne. Si `beforeId` est fourni, la carte est
  // insérée juste AVANT cette carte ; sinon elle est ajoutée à la fin.
  function moveCard(cardId, fromCol, toCol, beforeId = null) {
    // Déposer une carte sur elle-même ne fait rien.
    if (cardId === beforeId) return
    setGroups(gs => {
      let moving = null
      const removed = gs.map(g => ({
        ...g,
        columns: g.columns.map(c => {
          if (c.id === fromCol) {
            moving = c.cards.find(card => card.id === cardId)
            return { ...c, cards: c.cards.filter(card => card.id !== cardId) }
          }
          return c
        }),
      }))
      if (!moving) return gs
      return removed.map(g => ({
        ...g,
        columns: g.columns.map(c => {
          if (c.id !== toCol) return c
          if (!beforeId) return { ...c, cards: [...c.cards, moving] }
          const idx = c.cards.findIndex(card => card.id === beforeId)
          if (idx === -1) return { ...c, cards: [...c.cards, moving] }
          const next = c.cards.slice()
          next.splice(idx, 0, moving)
          return { ...c, cards: next }
        }),
      }))
    })
  }

  // ---------- Colonnes (thèmes) ----------
  function addColumn(groupId) {
    setGroups(gs =>
      gs.map(g =>
        g.id === groupId ? { ...g, columns: [...g.columns, makeColumn('Nouveau thème')] } : g
      )
    )
  }

  function renameColumn(columnId, title) {
    setGroups(gs =>
      gs.map(g => ({
        ...g,
        columns: g.columns.map(c => (c.id === columnId ? { ...c, title } : c)),
      }))
    )
  }

  function deleteColumn(columnId) {
    const col = allColumns.find(c => c.id === columnId)
    if (
      col &&
      col.cards.length > 0 &&
      !window.confirm(`Supprimer « ${col.title} » et ses ${col.cards.length} carte(s) ?`)
    ) {
      return
    }
    captureUndo('Thème supprimé')
    setGroups(gs =>
      gs.map(g => ({ ...g, columns: g.columns.filter(c => c.id !== columnId) }))
    )
    // On retire aussi les liens et positions des cartes de la colonne supprimée.
    cleanupCards(col ? col.cards : [])
  }

  // Déplace une colonne entière vers un autre groupe.
  function moveColumn(columnId, toGroupId) {
    setGroups(gs => {
      let moving = null
      const removed = gs.map(g => {
        if (g.columns.some(c => c.id === columnId)) {
          moving = g.columns.find(c => c.id === columnId)
          return { ...g, columns: g.columns.filter(c => c.id !== columnId) }
        }
        return g
      })
      if (!moving) return gs
      return removed.map(g =>
        g.id === toGroupId ? { ...g, columns: [...g.columns, moving] } : g
      )
    })
  }

  // ---------- Groupes ----------
  function addGroup() {
    setGroups(gs => [...gs, makeGroup('Nouveau groupe')])
  }

  function renameGroup(groupId, title) {
    setGroups(gs => gs.map(g => (g.id === groupId ? { ...g, title } : g)))
  }

  function toggleGroup(groupId) {
    setGroups(gs =>
      gs.map(g => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
    )
  }

  function deleteGroup(groupId) {
    const grp = groups.find(g => g.id === groupId)
    const nbCols = grp ? grp.columns.length : 0
    if (
      nbCols > 0 &&
      !window.confirm(`Supprimer le groupe « ${grp.title} » et ses ${nbCols} colonne(s) ?`)
    ) {
      return
    }
    captureUndo('Groupe supprimé')
    setGroups(gs => gs.filter(g => g.id !== groupId))
    // On retire les liens et positions de toutes les cartes du groupe.
    cleanupCards(grp ? grp.columns.flatMap(c => c.cards) : [])
  }

  // ---------- Carnet de contacts ----------
  function addContact(name, email) {
    setContacts(cs => [...cs, { id: uid(), name, email }])
  }

  function deleteContact(contactId) {
    setContacts(cs => cs.filter(c => c.id !== contactId))
    setGroups(gs =>
      gs.map(g => ({
        ...g,
        columns: g.columns.map(c => ({
          ...c,
          cards: c.cards.map(card => ({
            ...card,
            people: card.people.filter(id => id !== contactId),
          })),
        })),
      }))
    )
  }

  // ---------- Échéances ----------
  // Date du jour au format AAAA-MM-JJ (pour comparer aux échéances des cartes).
  const todayISO = new Date().toISOString().slice(0, 10)
  function isOverdue(card) {
    return !!card.due && card.due < todayISO
  }

  // ---------- Recherche / filtre ----------
  function isVisibleCard(card) {
    if (dueOnly && !isOverdue(card)) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      card.title.toLowerCase().includes(q) ||
      (card.note || '').toLowerCase().includes(q)
    )
  }

  // ---------- Installation PWA ----------
  useEffect(() => {
    function onPrompt(e) {
      e.preventDefault()
      setInstallEvt(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  async function installApp() {
    if (!installEvt) return
    installEvt.prompt()
    await installEvt.userChoice
    setInstallEvt(null)
  }

  // ---------- Export ----------
  // Télécharge tout le tableau en JSON (sauvegarde / partage de fichier).
  function exportBoard() {
    const payload = { groups, contacts, links, positions }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'carta-' + todayISO + '.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 200)
  }

  // ---------- Zoom de l'affichage ----------
  useEffect(() => {
    saveZoom(zoom)
  }, [zoom])

  function changeZoom(delta) {
    setZoom(z => {
      const next = Math.round((z + delta) * 100) / 100
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    })
  }

  // ---------- Données dérivées pour les liens ----------
  // Liste à plat des cartes (pour le sélecteur « lier à… », le @mention et les
  // suggestions par mots-clés communs).
  const allCardsFlat = groups.flatMap(g =>
    g.columns.flatMap(c =>
      c.cards.map(card => ({
        id: card.id,
        title: card.title,
        note: card.note || '',
      }))
    )
  )
  // Ids des cartes liées à la carte survolée (pour le surlignage).
  const linkedIds = new Set()
  if (hoverId) {
    for (const l of links) {
      if (l.from === hoverId) linkedIds.add(l.to)
      else if (l.to === hoverId) linkedIds.add(l.from)
    }
  }
  // Tout ce dont une carte a besoin pour les liens, regroupé en un seul prop.
  const linkApi = {
    links,
    cards: allCardsFlat,
    hoverId,
    linkedIds,
    onHover: setHoverId,
    onAdd: addLink,
    onDelete: deleteLink,
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Carta</h1>
          <span className="tagline">vos sujets, à l'encre sur papier</span>
          <div className="brand-spacer" />
          <AuthBar
            configured={!!supabase}
            session={session}
            status={status}
            recovering={recovering}
            onSignIn={signIn}
            onSignUp={signUp}
            onResetPassword={resetPassword}
            onUpdatePassword={updatePassword}
            onSignOut={signOut}
          />
        </div>

        <div className="toolbar">
          <div className="view-toggle" role="group" aria-label="Mode d'affichage">
            <button
              className={`view-btn ${boardView === 'tableau' ? 'active' : ''}`}
              onClick={() => setBoardView('tableau')}
            >
              Tableau
            </button>
            <button
              className={`view-btn ${boardView === 'mindmap' ? 'active' : ''}`}
              onClick={() => setBoardView('mindmap')}
              title="Vue carte mentale — glissez d'une carte à l'autre pour les lier"
            >
              Carte mentale
            </button>
          </div>
          {boardView === 'tableau' && (
            <input
              className="search"
              placeholder="Rechercher un sujet…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          {boardView === 'tableau' && (
          <div className="zoom-control" role="group" aria-label="Zoom de l'affichage">
            <button
              className="zoom-btn"
              onClick={() => changeZoom(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              title="Dézoomer"
              aria-label="Dézoomer"
            >
              −
            </button>
            <button
              className="zoom-level"
              onClick={() => setZoom(1)}
              title="Réinitialiser le zoom (100 %)"
            >
              {Math.round(zoom * 100)} %
            </button>
            <button
              className="zoom-btn"
              onClick={() => changeZoom(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              title="Zoomer"
              aria-label="Zoomer"
            >
              ＋
            </button>
          </div>
          )}
          {boardView === 'tableau' && (
            <button
              className={`ghost-btn${dueOnly ? ' active' : ''}`}
              onClick={() => setDueOnly(v => !v)}
              title="N'afficher que les cartes en retard"
            >
              ⏰ En retard
            </button>
          )}
          {boardView === 'tableau' && (
            <button className="ghost-btn" onClick={addGroup}>
              ＋ Groupe
            </button>
          )}
          <button className="ghost-btn" onClick={exportBoard} title="Télécharger le tableau en JSON">
            Exporter
          </button>
          {installEvt && (
            <button className="ghost-btn" onClick={installApp} title="Installer Carta sur cet appareil">
              Installer
            </button>
          )}
        </div>
      </header>

      {boardView === 'mindmap' ? (
        <main className="board board-mindmap">
          <Suspense fallback={<p className="muted" style={{ padding: 24 }}>Chargement de la carte mentale…</p>}>
            <MindMap
              cards={allCardsFlat}
              links={links}
              positions={positions}
              typeLabel={LINK_LABEL}
              onConnect={(from, to) => addLink(from, to, 'lié')}
              onDeleteLinks={deleteLinks}
              onMoveNode={setNodePosition}
            />
          </Suspense>
        </main>
      ) : (
        <main className="board" style={{ zoom }}>
          {groups.map(group => (
            <Group
              key={group.id}
              group={group}
              groups={groups}
              allColumns={allColumns}
              contacts={contacts}
              isVisibleCard={isVisibleCard}
              onToggle={toggleGroup}
              onRenameGroup={renameGroup}
              onDeleteGroup={deleteGroup}
              onAddColumn={addColumn}
              onAddCard={addCard}
              onUpdateCard={updateCard}
              onDeleteCard={deleteCard}
              onMoveCard={moveCard}
              onRenameColumn={renameColumn}
              onDeleteColumn={deleteColumn}
              onMoveColumn={moveColumn}
              onManageContacts={() => setShowContacts(true)}
              linkApi={linkApi}
            />
          ))}
        </main>
      )}

      {showContacts && (
        <ContactBook
          contacts={contacts}
          onAdd={addContact}
          onDelete={deleteContact}
          onClose={() => setShowContacts(false)}
        />
      )}

      {undoState && (
        <div className="undo-toast" role="status">
          <span>{undoState.label}</span>
          <button className="undo-btn" onClick={performUndo}>
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}
