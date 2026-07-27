const removedSupabaseClient = () => {
  throw new Error(
    "Supabase access has been removed from the support module. Use supportApi.ts and the Spring Boot admin backend instead."
  );
};

export const supabase = new Proxy({}, { get: removedSupabaseClient });
export const supabaseAdmin = new Proxy({}, { get: removedSupabaseClient });
