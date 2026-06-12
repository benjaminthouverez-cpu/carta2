import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// On coupe la synchro cloud pour isoler le comportement de l'interface.
vi.mock('./supabase', () => ({ supabase: null }))

import App from './App.jsx'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

const groupHeading = name => screen.getByRole('heading', { level: 2, name })
const allGroupHeadings = () =>
  screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
const addGroupBtn = () => screen.getByRole('button', { name: '＋ Groupe' })

describe('Groupes (interface, sans synchro)', () => {
  it('renommer puis ajouter ne vole pas le nom', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(groupHeading('Travail'))
    const input = screen.getByDisplayValue('Travail')
    await user.clear(input)
    await user.type(input, 'PROJETS')
    await user.keyboard('{Enter}')
    await user.click(addGroupBtn())
    expect(allGroupHeadings()).toEqual(['PROJETS', 'Vie perso', 'Nouveau groupe'])
  })

  it('ajouter en plein milieu d’une édition (sans valider) ne vole pas le nom', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(groupHeading('Travail'))
    const input = screen.getByDisplayValue('Travail')
    await user.clear(input)
    await user.type(input, 'PROJETS') // on NE valide PAS (pas d'Entrée)
    await user.click(addGroupBtn()) // le clic provoque le blur de l'input
    expect(allGroupHeadings()).toEqual(['PROJETS', 'Vie perso', 'Nouveau groupe'])
  })

  it('ajouter deux groupes à la suite', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(addGroupBtn())
    await user.click(addGroupBtn())
    expect(allGroupHeadings()).toEqual([
      'Travail',
      'Vie perso',
      'Nouveau groupe',
      'Nouveau groupe',
    ])
  })
})
