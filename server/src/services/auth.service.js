const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const { stripHtml } = require('../utils/sanitize');
const { createError } = require('../utils/errors');

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '24h';

async function register(username, email, password) {
  username = stripHtml(username);
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw createError('Email already in use', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userModel.createUser(username, email, passwordHash);
  return user;
}

async function login(email, password) {
  const user = await userModel.findByEmail(email);
  if (!user) {
    throw createError('Invalid credentials', 401);
  }

  if (user.is_bot) {
    throw createError('Invalid credentials', 401);
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw createError('Invalid credentials', 401);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin || false },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin || false,
      must_reset_password: user.must_reset_password || false,
    },
  };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await userModel.findByIdWithHash(userId);
  if (!user) {
    throw createError('User not found', 404);
  }

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) {
    throw createError('Current password is incorrect', 401);
  }

  if (newPassword.length < 8) {
    throw createError('New password must be at least 8 characters', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userModel.updatePasswordHash(userId, passwordHash);
  await userModel.setMustResetPassword(userId, false);
}

module.exports = { register, login, changePassword };
