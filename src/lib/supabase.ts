// src/lib/supabase.ts - Supabase Client Configuration

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Your Supabase project credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create the Supabase client with TypeScript types
export const supabase = createClient < Database > (supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
});

// Optional: Helper functions for common operations
export const getCurrentUser = async () => {
    const user = authService.getUser();
    return user;
};

export const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};

// Export types for use in components
export type { Database } from './database.types';
