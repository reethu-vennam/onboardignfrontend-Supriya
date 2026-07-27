// src/lib/supportApi.ts

import { API_URL } from "./apiConfig";

/* =========================
   AUTH
======================== */

export const supportLogin = async (payload: {
  email: string;
  password: string;
}) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Login failed");
  }

  return response.json();
};


/* =========================
   GET TICKET STATS (Module Aware)
======================== */

export const getTicketStats = async (
  token: string,
  module?: string
) => {
  const query = module ? `?module=${module}` : "";

  const response = await fetch(
    `${API_URL}/tickets/stats${query}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }

  return response.json();
};


/* =========================
   GET TICKETS (Module Aware)
======================== */
export const getTickets = async (
  token: string,
  page = 1,
  limit = 10,
  module?: string,
  status?: string
) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (module) params.append("module", module);
  if (status) params.append("status", status);

  const response = await fetch(
    `${API_URL}/tickets?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.json();
};

/* =========================
   GET SUPPORT USERS
======================== */

export const getSupportUsers = async (token: string) => {
  const response = await fetch(`${API_URL}/auth/support-users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch support users");
  }

  return response.json();
};
