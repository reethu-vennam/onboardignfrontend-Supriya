let users = [];

export const createUser = (user) => {
  users.push(user);
  return user;
};

export const findUserByEmail = (email) => {
  return users.find(u => u.email === email);
};

export const getAllUsers = () => users;
