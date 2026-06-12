import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Faux Supabase pilotable, pour simuler la synchronisation cloud.
vi.mock('./supabase', () => {
  let realtimeCb = null
  let stored = null
  const builder = {
    select() {
      return builder
    },
    eq() {
      return builder
    },
    async maybeSingle() {
      return { data: stored ? { data: stored } : null, error: null }
    },
    async upsert(row) {
      stored = row.data
      return { error: null }
    },
  }
  const supabase = {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'u1', email: 'moi@exemple.fr' } } } }
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } }
      },
      async signOut() {},
    },
    from() {
      return builder
    },
    channel() {
      const ch = {
        on(_event, _filter, cb) {
          realtimeCb = cb
          return ch
        },
        subscribe() {
          return ch
        },
      }
      return ch
    },
    removeChannel() {},
  }
  const __mock = {
    getStored: () => stored,
    // Simule la réception d'une mise à jour temps-réel.
    fireRealtime: data => realtimeCb && realtimeCb({ new: { data } }),
    // Simule le réordonnancement des clés fait par Postgres (jsonb).
    reorder: obj => JSON.parse(JSON.stringify(obj, Object.keys(obj).reverse())),
  }
  return { supabase, __mock }
})

import App from './App.jsx'
import { __mock } from './supabase'

const groupHeading = name => screen.getByRole('heading', { level: 2, name })
const allGroupHeadings = () =>
  screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('Synchronisation cloud', () => {
  it("notre propre écho (clés réordonnées) ne doit PAS écraser une modification en cours", async () => {
    const user = userEvent.setup()
    render(<App />)

    // On attend que le chargement initial pousse l'état par défaut au cloud.
    await waitFor(() => expect(__mock.getStored()).toBeTruthy())
    const initialEcho = __mock.getStored() // contient _writer = notre appareil

    // L'utilisateur ajoute un groupe puis le renomme en "MonGroupe".
    await user.click(screen.getByRole('button', { name: '＋ Groupe' }))
    await user.click(groupHeading('Nouveau groupe')) // entre en mode édition
    const input = screen.getByDisplayValue('Nouveau groupe')
    await user.clear(input)
    await user.type(input, 'MonGroupe')
    await user.keyboard('{Enter}')
    expect(groupHeading('MonGroupe')).toBeTruthy()

    // Notre propre écriture nous revient en temps réel (état AVANT l'ajout,
    // clés réordonnées par jsonb). Cela ne doit rien écraser.
    __mock.fireRealtime(__mock.reorder(initialEcho))

    expect(groupHeading('MonGroupe')).toBeTruthy()
    expect(allGroupHeadings()).toContain('MonGroupe')
  })

  it("une vraie mise à jour d'un AUTRE appareil doit être appliquée", async () => {
    render(<App />)
    await waitFor(() => expect(__mock.getStored()).toBeTruthy())

    // Un autre appareil (writer différent) pousse un tableau tout neuf.
    __mock.fireRealtime({
      _writer: 'AUTRE-APPAREIL',
      contacts: [],
      groups: [{ id: 'gx', title: 'Depuis le téléphone', collapsed: false, columns: [] }],
    })

    await waitFor(() => expect(groupHeading('Depuis le téléphone')).toBeTruthy())
  })
})
