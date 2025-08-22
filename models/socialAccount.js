'use strict';
module.exports = (sequelize, DataTypes) => {
  const SocialAccount = sequelize.define('SocialAccount', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    token: DataTypes.STRING,
    refreshToken: DataTypes.STRING,
    displayName: DataTypes.STRING
  }, {
    tableName: 'SocialAccounts',
    timestamps: true
  });

  SocialAccount.associate = (models) => {
    SocialAccount.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SocialAccount.belongsToMany(models.Post, {
      through: models.PostAccount,
      foreignKey: 'accountId',
      otherKey: 'postId',
      as: 'posts'
    });
  };

  return SocialAccount;
};
