// Centralized API configuration for the support module
// All ticket/auth endpoints are on the sabbpe-admin-backend at /api/*
// VITE_API_URL should point to the backend base (e.g. http://localhost:5000)

const raw = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Accept either a backend origin or an older /api(/support) URL.
export const API_BASE_URL = raw.replace(/\/+$/, "").replace(/\/api(?:\/support)?$/, "");

// Full base including /api prefix
export const API_URL = `${API_BASE_URL}/api`;
