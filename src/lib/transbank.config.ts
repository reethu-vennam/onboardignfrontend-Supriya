/**
 * Transbank Configuration
 * 
 * All values are loaded from environment variables.
 */

const getEnvVariable = (key: string): string => {
  const fullKey = `VITE_${key}`;
  const value = import.meta.env[fullKey];
  return value || '';
};

export const TRANSBANK_CONFIG = {
  BASE_URL: getEnvVariable('TRANSBANK_BASE_URL') || 'https://transbankuat.sabbpe.com/api',
  CLIENT_ID: getEnvVariable('TRANSBANK_CLIENT_ID'),
  ENTITY_ID: getEnvVariable('TRANSBANK_ENTITY_ID'),
  PROGRAM_ID: getEnvVariable('TRANSBANK_PROGRAM_ID'),
  PROCESSOR: getEnvVariable('TRANSBANK_PROCESSOR') || 'TRANSBANK',
  TRANSACTION_TYPE: getEnvVariable('TRANSBANK_TRANSACTION_TYPE') || 'IMPS',
};
