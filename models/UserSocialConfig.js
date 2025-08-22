'use strict';
const { Model } = require('sequelize');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

module.exports = (sequelize, DataTypes) => {
  class UserSocialConfig extends Model {
    static associate(models) {
      // Asociaciones usando la referencia correcta desde index.js
      UserSocialConfig.belongsTo(models.User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
      models.User.hasMany(UserSocialConfig, { foreignKey: 'userId', as: 'socialConfigs' });
    }

    // Métodos para encriptar/desencriptar credenciales
    setClientSecret(secret) {
      if (!secret) return;
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
      let encrypted = cipher.update(secret, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      this.clientSecret = iv.toString('hex') + ':' + encrypted;
    }

    getClientSecret() {
      if (!this.clientSecret) return null;
      try {
        const parts = this.clientSecret.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        console.error('Error decrypting client secret:', error);
        return null;
      }
    }

    async verifyCredentials() {
      try {
        const result = await verifyProviderCredentials(this.provider, {
          clientId: this.clientId,
          clientSecret: this.getClientSecret(),
          apiKey: this.apiKey,
          bearerToken: this.bearerToken
        });

        await this.update({
          isVerified: result.isValid,
          lastVerifiedAt: new Date(),
          errorCount: result.isValid ? 0 : this.errorCount + 1,
          restrictions: result.restrictions || null
        });

        return result;
      } catch (error) {
        console.error(`Error verifying ${this.provider} credentials:`, error);
        await this.increment('errorCount');
        return { isValid: false, error: error.message };
      }
    }
  }

  UserSocialConfig.init(
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['twitter','facebook','instagram','linkedin']] }
      },
      clientId: { type: DataTypes.STRING, allowNull: true },
      clientSecret: { type: DataTypes.TEXT, allowNull: true },
      usesCentralApp: { type: DataTypes.BOOLEAN, defaultValue: true },
      apiKey: { type: DataTypes.TEXT, allowNull: true },
      apiSecret: { type: DataTypes.TEXT, allowNull: true },
      bearerToken: { type: DataTypes.TEXT, allowNull: true },
      webhookUrl: { type: DataTypes.STRING, allowNull: true },
      rateLimitTier: { type: DataTypes.STRING, defaultValue: 'basic', validate: { isIn: [['basic','elevated','academic','premium']] } },
      permissions: { type: DataTypes.JSON, allowNull: true },
      restrictions: { type: DataTypes.JSON, allowNull: true },
      isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
      lastVerifiedAt: { type: DataTypes.DATE, allowNull: true },
      errorCount: { type: DataTypes.INTEGER, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
    },
    {
      sequelize,
      modelName: 'UserSocialConfig',
      tableName: 'UserSocialConfigs',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['userId','provider'] },
        { fields: ['provider','isActive'] }
      ]
    }
  );

  return UserSocialConfig;

  // --- Funciones privadas de verificación ---
  async function verifyProviderCredentials(provider, credentials) {
    switch (provider) {
      case 'twitter': return await verifyTwitterCredentials(credentials);
      case 'facebook': return await verifyFacebookCredentials(credentials);
      case 'instagram': return await verifyInstagramCredentials(credentials);
      case 'linkedin': return await verifyLinkedInCredentials(credentials);
      default: throw new Error(`Provider ${provider} not supported`);
    }
  }

  async function verifyTwitterCredentials({ clientId, clientSecret, bearerToken }) {
    try {
      const response = await fetch('https://api.twitter.com/2/users/me', {
        headers: { 'Authorization': `Bearer ${bearerToken}`, 'User-Agent': 'SocialHub/1.0' }
      });
      if (response.ok) {
        const data = await response.json();
        return { isValid:true, userData:data.data, restrictions:{ tweetCap:data.data.public_metrics || null, rateLimits: response.headers.get('x-rate-limit-remaining') } };
      }
      return { isValid:false, error:'Invalid Twitter credentials' };
    } catch (error) { return { isValid:false, error:error.message }; }
  }

  async function verifyFacebookCredentials({ clientId, clientSecret }) {
    try {
      const response = await fetch(`https://graph.facebook.com/me/accounts?access_token=${clientSecret}`);
      if (response.ok) {
        const data = await response.json();
        return { isValid:true, userData:data, restrictions:null };
      }
      return { isValid:false, error:'Invalid Facebook credentials' };
    } catch (error) { return { isValid:false, error:error.message }; }
  }

  async function verifyInstagramCredentials({ clientId, clientSecret }) {
    try {
      const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${clientSecret}`);
      if (response.ok) {
        const data = await response.json();
        return { isValid:true, userData:data, restrictions:null };
      }
      return { isValid:false, error:'Invalid Instagram credentials' };
    } catch (error) { return { isValid:false, error:error.message }; }
  }

  async function verifyLinkedInCredentials({ clientId, clientSecret }) {
    try {
      const response = await fetch('https://api.linkedin.com/v2/me', {
        headers: { 'Authorization': `Bearer ${clientSecret}`, 'cache-control':'no-cache', 'X-Restli-Protocol-Version':'2.0.0' }
      });
      if (response.ok) {
        const data = await response.json();
        return { isValid:true, userData:data, restrictions:null };
      }
      return { isValid:false, error:'Invalid LinkedIn credentials' };
    } catch (error) { return { isValid:false, error:error.message }; }
  }
};
