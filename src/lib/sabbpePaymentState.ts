const PAYMENT_COMPLETION_PREFIX = 'sabbpe-payment-completed';
const PAYMENT_RETURN_PATH_KEY = 'sabbpe-payment-return-path';
const PAYMENT_TOKEN_KEY = 'sabbpe-payment-token';

export interface SabbpePaymentCompletion {
  transactionId: string;
  completedAt: string;
}

const getStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
};

const getSessionStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage;
};

export const getSabbpePaymentCompletionKey = (userId: string) =>
  `${PAYMENT_COMPLETION_PREFIX}:${userId}`;

export const markSabbpePaymentComplete = (userId: string, transactionId: string) => {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(
    getSabbpePaymentCompletionKey(userId),
    JSON.stringify({ transactionId, completedAt: new Date().toISOString() } satisfies SabbpePaymentCompletion)
  );
};

export const isSabbpePaymentComplete = (userId?: string) => {
  if (!userId) return false;

  const storage = getStorage();
  if (!storage) return false;

  const raw = storage.getItem(getSabbpePaymentCompletionKey(userId));
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as Partial<SabbpePaymentCompletion>;
    return Boolean(parsed.transactionId);
  } catch {
    return false;
  }
};

export const clearSabbpePaymentCompletion = (userId: string) => {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(getSabbpePaymentCompletionKey(userId));
};

export const setSabbpePaymentReturnPath = (path: string) => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.setItem(PAYMENT_RETURN_PATH_KEY, path);
};

export const getSabbpePaymentReturnPath = (fallback = '/merchant-onboarding?step=dashboard') => {
  const storage = getSessionStorage();
  if (!storage) return fallback;

  return storage.getItem(PAYMENT_RETURN_PATH_KEY) || fallback;
};

export const clearSabbpePaymentReturnPath = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.removeItem(PAYMENT_RETURN_PATH_KEY);
};

const PAYMENT_MERCHANT_KEY = 'sabbpe-payment-merchant';

export const setSabbpePaymentMerchantId = (merchantUserId: string) => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.setItem(PAYMENT_MERCHANT_KEY, merchantUserId);
};

export const getSabbpePaymentMerchantId = (): string | null => {
  const storage = getSessionStorage();
  if (!storage) return null;

  return storage.getItem(PAYMENT_MERCHANT_KEY);
};

export const clearSabbpePaymentMerchantId = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.removeItem(PAYMENT_MERCHANT_KEY);
};

export const setSabbpePaymentToken = (token: string) => {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(PAYMENT_TOKEN_KEY, token);
};

export const getSabbpePaymentToken = (): string | null => {
  const storage = getStorage();
  if (!storage) return null;

  return storage.getItem(PAYMENT_TOKEN_KEY);
};

export const clearSabbpePaymentToken = () => {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(PAYMENT_TOKEN_KEY);
};