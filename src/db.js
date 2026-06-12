// Couche d'accès aux données de Carta 2.0 (modèle relationnel Supabase).
//
// Hiérarchie : board → group → column → card, + links entre cartes, + membres.
// Toutes les fonctions supposent que `supabase` est configuré ET qu'une session
// est ouverte ; la sécurité réelle est assurée par les règles RLS (schema.sql).
//
// Voir supabase/schema.sql pour les tables et les politiques.

import { supabase } from './supabase'

// --------------------------------------------------------------------------
// Authentification
// --------------------------------------------------------------------------
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  })
}

// --------------------------------------------------------------------------
// Tableaux (boards)
// --------------------------------------------------------------------------

// Liste les tableaux dont l'utilisateur est membre (RLS filtre déjà).
export async function listBoards() {
  const { data, error } = await supabase
    .from('boards')
    .select('id, title, owner_id, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Renvoie le premier tableau de l'utilisateur, ou en crée un par défaut.
export async function getOrCreateDefaultBoard(userId) {
  const boards = await listBoards()
  if (boards.length > 0) return boards[0]
  const { data, error } = await supabase
    .from('boards')
    .insert({ owner_id: userId, title: 'Mon tableau' })
    .select('id, title, owner_id, created_at')
    .single()
  if (error) throw error
  return data
}

export async function createBoard(userId, title = 'Nouveau tableau') {
  const { data, error } = await supabase
    .from('boards')
    .insert({ owner_id: userId, title })
    .select('id, title, owner_id, created_at')
    .single()
  if (error) throw error
  return data
}

export async function renameBoard(boardId, title) {
  const { error } = await supabase.from('boards').update({ title }).eq('id', boardId)
  if (error) throw error
}

export async function deleteBoard(boardId) {
  const { error } = await supabase.from('boards').delete().eq('id', boardId)
  if (error) throw error
}

// Charge tout le contenu d'un tableau, assemblé en arborescence groups→columns→cards.
export async function loadBoard(boardId) {
  const [g, c, k, l] = await Promise.all([
    supabase.from('groups').select('*').eq('board_id', boardId).order('position'),
    supabase.from('columns').select('*').eq('board_id', boardId).order('position'),
    supabase.from('cards').select('*').eq('board_id', boardId).order('position'),
    supabase.from('links').select('*').eq('board_id', boardId),
  ])
  for (const r of [g, c, k, l]) if (r.error) throw r.error
  return assembleBoard(g.data, c.data, k.data, l.data)
}

// Reconstruit l'arborescence attendue par l'UI à partir des lignes à plat.
export function assembleBoard(groups, columns, cards, links) {
  const cardsByCol = {}
  for (const card of cards) {
    // `people` n'est pas (encore) en base côté 2.0 : on garantit le tableau
    // attendu par l'UI (l'attribution se fera via les membres plus tard).
    ;(cardsByCol[card.column_id] ||= []).push({ ...card, people: [] })
  }
  const colsByGroup = {}
  for (const col of columns) {
    ;(colsByGroup[col.group_id] ||= []).push({
      ...col,
      cards: cardsByCol[col.id] || [],
    })
  }
  const tree = groups.map(grp => ({
    ...grp,
    columns: colsByGroup[grp.id] || [],
  }))
  // positions mindmap : { cardId: {x, y} } pour les cartes qui en ont une.
  const positions = {}
  for (const card of cards) {
    if (card.mind_x != null && card.mind_y != null) {
      positions[card.id] = { x: card.mind_x, y: card.mind_y }
    }
  }
  // L'UI attend des liens { id, from, to, type } (la base stocke from_card/to_card).
  const uiLinks = links.map(l => ({ id: l.id, from: l.from_card, to: l.to_card, type: l.type }))
  return { groups: tree, links: uiLinks, positions }
}

// --------------------------------------------------------------------------
// Groupes
// --------------------------------------------------------------------------
export async function createGroup(boardId, title = 'Nouveau groupe', position = 0) {
  const { data, error } = await supabase
    .from('groups')
    .insert({ board_id: boardId, title, position })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function renameGroup(id, title) {
  const { error } = await supabase.from('groups').update({ title }).eq('id', id)
  if (error) throw error
}

export async function setGroupCollapsed(id, collapsed) {
  const { error } = await supabase.from('groups').update({ collapsed }).eq('id', id)
  if (error) throw error
}

export async function deleteGroup(id) {
  // ON DELETE CASCADE retire colonnes, cartes et liens associés (cf. schema.sql).
  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) throw error
}

// --------------------------------------------------------------------------
// Colonnes
// --------------------------------------------------------------------------
export async function createColumn(boardId, groupId, title = 'Nouveau thème', position = 0) {
  const { data, error } = await supabase
    .from('columns')
    .insert({ board_id: boardId, group_id: groupId, title, position })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function renameColumn(id, title) {
  const { error } = await supabase.from('columns').update({ title }).eq('id', id)
  if (error) throw error
}

export async function moveColumn(id, groupId) {
  const { error } = await supabase.from('columns').update({ group_id: groupId }).eq('id', id)
  if (error) throw error
}

export async function deleteColumn(id) {
  const { error } = await supabase.from('columns').delete().eq('id', id)
  if (error) throw error
}

// --------------------------------------------------------------------------
// Cartes
// --------------------------------------------------------------------------
export async function createCard(boardId, columnId, title, position = 0) {
  const { data, error } = await supabase
    .from('cards')
    .insert({ board_id: boardId, column_id: columnId, title, position })
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Met à jour des champs libres d'une carte (title, note, due, position…).
export async function updateCard(id, patch) {
  const { error } = await supabase
    .from('cards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function moveCard(id, columnId, position) {
  const { error } = await supabase
    .from('cards')
    .update({ column_id: columnId, position })
    .eq('id', id)
  if (error) throw error
}

export async function setCardMindPos(id, x, y) {
  const { error } = await supabase.from('cards').update({ mind_x: x, mind_y: y }).eq('id', id)
  if (error) throw error
}

export async function deleteCard(id) {
  const { error } = await supabase.from('cards').delete().eq('id', id)
  if (error) throw error
}

// --------------------------------------------------------------------------
// Liens
// --------------------------------------------------------------------------
export async function addLink(boardId, fromCard, toCard, type = 'lié') {
  const { data, error } = await supabase
    .from('links')
    .insert({ board_id: boardId, from_card: fromCard, to_card: toCard, type })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteLink(id) {
  const { error } = await supabase.from('links').delete().eq('id', id)
  if (error) throw error
}

// --------------------------------------------------------------------------
// Membres & partage
// --------------------------------------------------------------------------
export async function listMembers(boardId) {
  const { data, error } = await supabase
    .from('board_members')
    .select('user_id, role, profiles(email, full_name)')
    .eq('board_id', boardId)
  if (error) throw error
  return data
}

// Invite par e-mail : la personne doit déjà avoir un compte (un profil).
// (L'invitation de non-inscrits viendra avec un système d'invitations dédié.)
export async function addMemberByEmail(boardId, email, role = 'editor') {
  const { data: prof, error: e1 } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (e1) throw e1
  if (!prof) return { ok: false, message: "Aucun compte avec cet e-mail (la personne doit d'abord se connecter une fois)." }
  const { error: e2 } = await supabase
    .from('board_members')
    .insert({ board_id: boardId, user_id: prof.id, role })
  if (e2) throw e2
  return { ok: true }
}

export async function updateMemberRole(boardId, userId, role) {
  const { error } = await supabase
    .from('board_members')
    .update({ role })
    .eq('board_id', boardId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeMember(boardId, userId) {
  const { error } = await supabase
    .from('board_members')
    .delete()
    .eq('board_id', boardId)
    .eq('user_id', userId)
  if (error) throw error
}

// --------------------------------------------------------------------------
// Temps réel : ré-exécute `onChange` à chaque modif sur le tableau courant.
// --------------------------------------------------------------------------
export function subscribeBoard(boardId, onChange) {
  const channel = supabase.channel('board-' + boardId)
  for (const table of ['groups', 'columns', 'cards', 'links', 'board_members']) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: 'board_id=eq.' + boardId },
      onChange
    )
  }
  channel.subscribe()
  return () => supabase.removeChannel(channel)
}

// --------------------------------------------------------------------------
// Persistance par réconciliation
//
// L'UI continue de manipuler l'arborescence en mémoire (groups→columns→cards
// + links + positions). À la sauvegarde, on « met à plat » cet état en lignes,
// on les upsert (parents avant enfants), puis on supprime de la base les lignes
// qui ont disparu (enfants avant parents). La position = l'index dans le tableau.
// --------------------------------------------------------------------------

// Met l'arborescence à plat en lignes prêtes pour la base.
function flattenBoard(boardId, groups, links, positions) {
  const groupsR = []
  const columnsR = []
  const cardsR = []
  const linksR = []
  groups.forEach((g, gi) => {
    groupsR.push({ id: g.id, board_id: boardId, title: g.title, position: gi, collapsed: !!g.collapsed })
    ;(g.columns || []).forEach((col, ci) => {
      columnsR.push({ id: col.id, board_id: boardId, group_id: g.id, title: col.title, position: ci })
      ;(col.cards || []).forEach((card, ai) => {
        const p = positions[card.id]
        cardsR.push({
          id: card.id,
          board_id: boardId,
          column_id: col.id,
          title: card.title || '',
          note: card.note || '',
          due: card.due ? card.due : null,
          position: ai,
          mind_x: p ? p.x : null,
          mind_y: p ? p.y : null,
        })
      })
    })
  })
  links.forEach(l => {
    linksR.push({ id: l.id, board_id: boardId, from_card: l.from, to_card: l.to, type: l.type })
  })
  return { groupsR, columnsR, cardsR, linksR }
}

// Ensemble des identifiants présents dans l'état courant (pour le diff de suppression).
export function collectIds(groups, links) {
  const g = new Set()
  const c = new Set()
  const k = new Set()
  const l = new Set()
  for (const grp of groups) {
    g.add(grp.id)
    for (const col of grp.columns || []) {
      c.add(col.id)
      for (const card of col.cards || []) k.add(card.id)
    }
  }
  for (const link of links) l.add(link.id)
  return { groups: g, columns: c, cards: k, links: l }
}

async function upsertRows(table, rows) {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows)
  if (error) throw error
}

async function deleteRows(table, ids) {
  if (!ids.length) return
  const { error } = await supabase.from(table).delete().in('id', ids)
  if (error) throw error
}

// Synchronise tout le tableau vers la base. `prevIds` = identifiants présents au
// dernier chargement/sauvegarde (pour détecter les suppressions). Renvoie les
// nouveaux ensembles d'identifiants.
export async function persistBoard(boardId, state, prevIds) {
  const { groupsR, columnsR, cardsR, linksR } = flattenBoard(
    boardId,
    state.groups,
    state.links,
    state.positions
  )
  // Upsert parents → enfants (respecte les clés étrangères).
  await upsertRows('groups', groupsR)
  await upsertRows('columns', columnsR)
  await upsertRows('cards', cardsR)
  await upsertRows('links', linksR)

  const cur = collectIds(state.groups, state.links)
  const removed = (prev, now) => [...prev].filter(id => !now.has(id))
  // Suppressions enfants → parents (le cascade nettoie le reste sans erreur).
  await deleteRows('links', removed(prevIds.links, cur.links))
  await deleteRows('cards', removed(prevIds.cards, cur.cards))
  await deleteRows('columns', removed(prevIds.columns, cur.columns))
  await deleteRows('groups', removed(prevIds.groups, cur.groups))
  return cur
}
