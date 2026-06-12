import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig'

// On ne crée le client que si les coordonnées ont bien été remplies.
// Sinon `supabase` vaut null et l'appli reste en mode local.
const configured =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('VOTRE_') &&
  !SUPABASE_ANON_KEY.includes('VOTRE_')

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null
