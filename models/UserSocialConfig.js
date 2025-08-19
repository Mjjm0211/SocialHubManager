// models/UserSocialConfig.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const UserSocialConfig = sequelize.define('userSocialConfig', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['twitter', 'facebook', 'instagram', 'linkedin']]
    }
  },
  // Para cuando el usuario usa sus propias credenciales de app
  clientId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Client ID de la app del usuario'
  },
  clientSecret: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Client Secret de la app del usuario (encriptado)'
  },
  // Para aplicaciones centralizadas
  usesCentralApp: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Si usa las credenciales centrales de la aplicación'
  },
  // Configuraciones específicas por provider
  apiKey: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'API Key adicional si es necesaria'
  },
  apiSecret: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'API Secret adicional'
  },
  bearerToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Bearer Token para APIs que lo requieren'
  },
  // Configuraciones avanzadas
  webhookUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL de webhook personalizada del usuario'
  },
  rateLimitTier: {
    type: DataTypes.STRING,
    defaultValue: 'basic',
    validate: {
      isIn: [['basic', 'elevated', 'academic', 'premium']]
    },
    comment: 'Nivel de acceso a la API del usuario'
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Permisos específicos otorgados por el usuario'
  },
  restrictions: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Restricciones de la cuenta (rate limits, etc.)'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Si las credenciales han sido verificadas'
  },
  lastVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Última vez que se verificaron las credenciales'
  },
  errorCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Contador de errores consecutivos'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'provider']
    },
    {
      fields: ['provider', 'isActive']
    }
  ]
});

// Relaciones
UserSocialConfig.belongsTo(User, { 
  foreignKey: 'userId', 
  as: 'user',
  onDelete: 'CASCADE'
});

User.hasMany(UserSocialConfig, { 
  foreignKey: 'userId', 
  as: 'socialConfigs' 
});

// Métodos para encriptar/desencriptar credenciales
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

UserSocialConfig.prototype.setClientSecret = function(secret) {
  if (!secret) return;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  this.clientSecret = iv.toString('hex') + ':' + encrypted;
};

UserSocialConfig.prototype.getClientSecret = function() {
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
};

// Método para verificar credenciales
UserSocialConfig.prototype.verifyCredentials = async function() {
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
};

// Función para verificar credenciales según el proveedor
async function verifyProviderCredentials(provider, credentials) {
  switch (provider) {
    case 'twitter':
      return await verifyTwitterCredentials(credentials);
    case 'facebook':
      return await verifyFacebookCredentials(credentials);
    case 'instagram':
      return await verifyInstagramCredentials(credentials);
    case 'linkedin':
      return await verifyLinkedInCredentials(credentials);
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}

// Verificaciones específicas por proveedor
async function verifyTwitterCredentials({ clientId, clientSecret, bearerToken }) {
  try {
    // Verificar con Twitter API v2
    const response = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'User-Agent': 'SocialHub/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        userData: data.data,
        restrictions: {
          tweetCap: data.data.public_metrics || null,
          rateLimits: response.headers.get('x-rate-limit-remaining')
        }
      };
    }
    
    return { isValid: false, error: 'Invalid Twitter credentials' };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}

async function verifyFacebookCredentials({ clientId, clientSecret }) {
  try {
    // Verificar con Facebook Graph API
    const response = await fetch(`https://graph.facebook.com/me/accounts?access_token=${clientSecret}`);
    
    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        userData: data,
        restrictions: null
      };
    }
    
    return { isValid: false, error: 'Invalid Facebook credentials' };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}

async function verifyInstagramCredentials({ clientId, clientSecret }) {
  try {
    // Verificar con Instagram Basic Display API
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${clientSecret}`);
    
    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        userData: data,
        restrictions: null
      };
    }
    
    return { isValid: false, error: 'Invalid Instagram credentials' };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}

async function verifyLinkedInCredentials({ clientId, clientSecret }) {
  try {
    // Verificar con LinkedIn API
    const response = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${clientSecret}`,
        'cache-control': 'no-cache',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        userData: data,
        restrictions: null
      };
    }
    
    return { isValid: false, error: 'Invalid LinkedIn credentials' };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}

module.exports = UserSocialConfig;