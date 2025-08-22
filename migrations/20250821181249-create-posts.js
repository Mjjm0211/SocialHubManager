'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Tabla Posts
    await queryInterface.createTable('Posts', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      content: { type: Sequelize.TEXT, allowNull: false },
      scheduledAt: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });

    // Tabla PostAccounts
    await queryInterface.createTable('PostAccounts', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      postId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Posts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      accountId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'SocialAccounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });

    // Índices
    await queryInterface.addIndex('Posts', ['userId']);
    await queryInterface.addIndex('PostAccounts', ['postId']);
    await queryInterface.addIndex('PostAccounts', ['accountId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('PostAccounts');
    await queryInterface.dropTable('Posts');
  }
};
