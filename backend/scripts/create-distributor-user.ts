import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is not defined in backend/.env');
}
if (!SUPABASE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY is not defined in backend/.env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DISTRIBUTOR_EMAIL = 'sabbpedisty@gmail.com';
const DISTRIBUTOR_PASSWORD = 'Test@123';
const DISTRIBUTOR_FULL_NAME = 'SabbPe Distributor';
const DISTRIBUTOR_MOBILE_NUMBER = '';

async function getExistingUserId(email: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    throw new Error(`Failed to list Supabase users: ${error.message}`);
  }
  const found = data?.users?.find((user: any) => user.email === email);
  return found?.id ?? null;
}

async function createAuthUser(email: string, password: string): Promise<string> {
  console.log(`Creating Supabase auth user for ${email}...`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: DISTRIBUTOR_FULL_NAME,
      mobile_number: DISTRIBUTOR_MOBILE_NUMBER,
      role: 'distributor',
    },
  });

  if (error) {
    if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
      console.log('User already exists in Supabase auth. Looking up existing user ID...');
      const existingId = await getExistingUserId(email);
      if (!existingId) {
        throw new Error('Auth user exists but could not be found with listUsers');
      }
      return existingId;
    }
    throw new Error(`Failed to create Supabase auth user: ${error.message}`);
  }

  if (!data?.user?.id) {
    throw new Error('Supabase auth createUser succeeded but returned no user ID');
  }

  return data.user.id;
}

async function ensureUserRole(userId: string): Promise<void> {
  console.log(`Ensuring user_roles entry exists for user ${userId}...`);
  const { data: existingRole, error: roleQueryError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (roleQueryError) {
    throw new Error(`Failed to query existing user_roles: ${roleQueryError.message}`);
  }

  if (existingRole?.role === 'distributor') {
    console.log('Distributor role already exists.');
    return;
  }

  if (existingRole && existingRole.role !== 'distributor') {
    console.log(`Existing role is '${existingRole.role}', not 'distributor'. Skipping role insert.`);
    return;
  }

  const { error: insertError } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role: 'distributor' });

  if (insertError) {
    throw new Error(`Failed to insert user_roles entry: ${insertError.message}`);
  }

  console.log('Distributor role created successfully.');
}

async function ensureDistributorProfile(userId: string): Promise<void> {
  console.log(`Ensuring distributor_profiles row exists for user ${userId}...`);
  const { data: existingProfile, error: profileQueryError } = await supabase
    .from('distributor_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileQueryError) {
    throw new Error(`Failed to query distributor_profiles: ${profileQueryError.message}`);
  }

  if (existingProfile) {
    console.log('Distributor profile already exists.');
    return;
  }

  const { error: insertError } = await supabase
    .from('distributor_profiles')
    .insert({
      user_id: userId,
      company_name: DISTRIBUTOR_FULL_NAME,
      contact_person: DISTRIBUTOR_FULL_NAME,
      mobile_number: DISTRIBUTOR_MOBILE_NUMBER,
      email: DISTRIBUTOR_EMAIL,
      is_active: true,
    });

  if (insertError) {
    throw new Error(`Failed to insert distributor_profiles row: ${insertError.message}`);
  }

  console.log('Distributor profile created successfully.');
}

async function run(): Promise<void> {
  try {
    const userId = await createAuthUser(DISTRIBUTOR_EMAIL, DISTRIBUTOR_PASSWORD);
    console.log(`Distributor auth user ID: ${userId}`);

    await ensureUserRole(userId);
    await ensureDistributorProfile(userId);

    console.log('Distributor provisioning complete.');
    console.log(`Email: ${DISTRIBUTOR_EMAIL}`);
    console.log(`Password: ${DISTRIBUTOR_PASSWORD}`);
  } catch (error) {
    console.error('Failed to provision distributor:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

run();
