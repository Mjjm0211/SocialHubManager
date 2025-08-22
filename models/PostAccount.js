'use strict';
module.exports = (sequelize, DataTypes) => {
  const PostAccount = sequelize.define('PostAccount', {
    postId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'PostAccounts',
    timestamps: true
  });

  PostAccount.associate = (models) => {
    PostAccount.belongsTo(models.Post, { foreignKey: 'postId', as: 'post' });
    PostAccount.belongsTo(models.SocialAccount, { foreignKey: 'accountId', as: 'socialAccount' });
  };

  return PostAccount;
};
