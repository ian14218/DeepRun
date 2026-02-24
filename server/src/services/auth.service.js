const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '24h';

async function register(username, email, password) {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userModel.createUser(username, email, passwordHash);
  return user;
}

async function login(email, password) {
  const user = await userModel.findByEmail(email);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin || false },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return { token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin || false } };
}

module.exports = { register, login };
