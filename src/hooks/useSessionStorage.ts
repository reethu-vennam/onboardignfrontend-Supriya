// hooks/useSessionStorage.ts
import { useState, useCallback } from 'react';

export const useSessionStorage = <T>(key: string, initialValue: T) => {
    const [storedValue, setStoredValue] = useState<T>(() => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        try {
            const item = window.sessionStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(`Error reading sessionStorage key "${key}":`, error);
            return initialValue;
        }
    });

    const setValue = useCallback((value: T | ((val: T) => T)) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);

            if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
            }
        } catch (error) {
            console.error(`Error setting sessionStorage key "${key}":`, error);
        }
    }, [key, storedValue]);

    const removeValue = useCallback(() => {
        try {
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(key);
            }
            setStoredValue(initialValue);
        } catch (error) {
            console.error(`Error removing sessionStorage key "${key}":`, error);
        }
    }, []);

    return [storedValue, setValue, removeValue] as const;
};