 

import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Supabase ENV variables missing");
  console.error("SUPABASE_URL:", supabaseUrl);
  console.error("SUPABASE_SERVICE_KEY:", supabaseServiceKey);
  process.exit(1);
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);