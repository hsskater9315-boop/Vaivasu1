import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vpugfmifigpkhsayasxo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HeOuDOkbb9qnt6E19ZD11Q_LoWg5Mvj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
