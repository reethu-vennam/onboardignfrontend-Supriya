// let tickets = [];

// export const createTicket = (ticket) => {
//   tickets.push(ticket);
//   return ticket;
// };

// export const getAllTickets = () => tickets;

// export const getTicketById = (id) => {
//   return tickets.find(t => t.id === id);
// };

// export const updateTicket = (id, updates) => {
//   const ticket = tickets.find(t => t.id === id);
//   if (!ticket) return null;

//   Object.assign(ticket, updates);
//   return ticket;
// };
// In-memory ticket storage (temporary until DB integration)
let tickets = [];

/**
 * Create a new ticket
 */
export const createTicket = (ticket) => {
  tickets.push(ticket);
  return ticket;
};

/**
 * Get all tickets
 */
export const getAllTickets = () => {
  return tickets;
};

/**
 * Get ticket by ID
 */
export const getTicketById = (id) => {
  return tickets.find(ticket => ticket.id === id);
};

/**
 * Update ticket fields (status, assignedTo, etc.)
 */
export const updateTicket = (id, updates) => {
  const ticket = tickets.find(ticket => ticket.id === id);

  if (!ticket) {
    return null;
  }

  Object.assign(ticket, updates);

  return ticket;
};

/**
 * Delete ticket (optional for future)
 */
export const deleteTicket = (id) => {
  const index = tickets.findIndex(ticket => ticket.id === id);

  if (index === -1) {
    return null;
  }

  const deleted = tickets.splice(index, 1);
  return deleted[0];
};
