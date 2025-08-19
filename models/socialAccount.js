// models/SocialAccount.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const SocialAccount = sequelize.define('SocialAccount', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  providerId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  token: DataTypes.STRING,
  refreshToken: DataTypes.STRING,
  displayName: DataTypes.STRING, 

}, {
  timestamps: true,
});

// Relación con User
SocialAccount.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(SocialAccount, { foreignKey: 'userId', as: 'socialAccounts' });

module.exports = SocialAccount;
