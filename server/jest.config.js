require('dotenv').config();

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
};
