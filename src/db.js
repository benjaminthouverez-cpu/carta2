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
    ;(cardsByCol[card.column_id] ||= []).push(card)
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
  return { groups: tree, links, positions }
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
