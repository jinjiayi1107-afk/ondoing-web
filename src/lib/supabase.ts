import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://ugpubhranolyvkjdltqy.supabase.co'
const fallbackAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncHViaHJhbm9seXZramRsdHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTE2OTUsImV4cCI6MjA5NDM4NzY5NX0.O7Ghc16f0hfTrL4JkPdAH1JZa4BeOoSywxyQXiVdT2Q'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
