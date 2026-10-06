// Elige el backend: Supabase si está configurado, si no, modo local (IndexedDB).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const useSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const api = (useSupabase
  ? await import('./backend-supabase.js')
  : await import('./backend-local.js')).default;
