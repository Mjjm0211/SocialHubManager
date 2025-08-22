'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SocialAccounts', {
      id: { 
        allowNull: false, 
        autoIncrement: true, 
        primaryKey: true, 
        type: Sequelize.INTEGER 
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      provider: { type: Sequelize.STRING, allowNull: false },
      providerId: { type: Sequelize.STRING, allowNull: false },
      clientId: { type: Sequelize.STRING, allowNull: true },
      clientSecret: { type: Sequelize.STRING, allowNull: true },
      token: { type: Sequelize.TEXT, allowNull: true },
      refreshToken: { type: Sequelize.TEXT, allowNull: true },
      tokenExpiry: { type: Sequelize.DATE, allowNull: true },
      displayName: { type: Sequelize.STRING, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });

    await queryInterface.addIndex('SocialAccounts', ['provider', 'providerId'], { unique: true, name: 'socialaccount_provider_providerid_unique' });
    await queryInterface.addIndex('SocialAccounts', ['userId']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('SocialAccounts', 'socialaccount_provider_providerid_unique');
    await queryInterface.dropTable('SocialAccounts');
  }
};
