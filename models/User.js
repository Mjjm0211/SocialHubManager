const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  name: DataTypes.STRING,
  email: {
    type: DataTypes.STRING,
    unique: true
  },
  password: DataTypes.STRING,
  twoFactorEnabled: DataTypes.BOOLEAN,
  otpSecret: DataTypes.STRING
}, {
  timestamps: true
});

module.exports = User;