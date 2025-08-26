// controllers/socialConfigController.js
const UserSocialConfig = require('../models/UserSocialConfig');
const SocialAccount = require('../models/socialAccount');
const { ensureAuthenticated } = require('../middleware/auth');

// Mostrar configuración de APIs del usuario
const showApiConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Obtener configuraciones existentes
    const configs = await UserSocialConfig.findAll({
      where: { userId, isActive: true }
    });
    
    // Crear mapa de configuraciones por proveedor
    const configMap = {};
    configs.forEach(config => {
      configMap[config.provider] = {
        ...config.toJSON(),
        clientSecret: config.clientSecret ? '••••••••' : null // Ocultar secreto
      };
    });
    
    res.render('social-config', { 
      user: req.user,
      configs: configMap,
      providers: ['twitter', 'facebook', 'instagram', 'linkedin', 'mastodon'] // Proveedores 
    });
  } catch (error) {
    console.error('Error loading social config:', error);
    req.flash('error_msg', 'Error al cargar configuración');
    res.redirect('/dashboard');
  }
};

// Guardar/actualizar configuración de API
const saveApiConfig = async (req, res) => {
  try {
    const { provider, clientId, clientSecret, apiKey, bearerToken, usesCentralApp } = req.body;
    const userId = req.user.id;
    
    // Validar datos requeridos
    if (!provider) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proveedor es requerido' 
      });
    }
    
    // Si usa la app central, no necesita credenciales propias
    if (usesCentralApp === 'true') {
      await UserSocialConfig.upsert({
        userId,
        provider,
        usesCentralApp: true,
        clientId: null,
        clientSecret: null,
        apiKey: null,
        bearerToken: null,
        isActive: true
      });
      
      return res.json({ 
        success: true, 
        message: 'Configuración guardada. Usando aplicación central.' 
      });
    }
    
    // Validar credenciales propias según el proveedor
    const validationResult = validateProviderCredentials(provider, {
      clientId, clientSecret, apiKey, bearerToken
    });
    
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        message: validationResult.message
      });
    }
    
    // Crear o actualizar configuración
    let config = await UserSocialConfig.findOne({
      where: { userId, provider }
    });
    
    if (config) {
      // Actualizar existente
      config.clientId = clientId;
      config.setClientSecret(clientSecret);
      config.apiKey = apiKey;
      config.bearerToken = bearerToken;
      config.usesCentralApp = false;
      config.isVerified = false;
      config.isActive = true;
      await config.save();
    } else {
      // Crear nueva
      config = await UserSocialConfig.create({
        userId,
        provider,
        clientId,
        apiKey,
        bearerToken,
        usesCentralApp: false,
        isActive: true
      });
      config.setClientSecret(clientSecret);
      await config.save();
    }
    
    // Verificar credenciales automáticamente
    const verificationResult = await config.verifyCredentials();
    
    if (verificationResult.isValid) {
      res.json({ 
        success: true, 
        message: 'Configuración guardada y verificada correctamente',
        verified: true
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Configuración guardada pero hay problemas con la verificación',
        verified: false,
        error: verificationResult.error
      });
    }
    
  } catch (error) {
    console.error('Error saving social config:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

// Verificar credenciales manualmente
const verifyCredentials = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    const config = await UserSocialConfig.findOne({
      where: { userId, provider, isActive: true }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuración no encontrada'
      });
    }
    
    const result = await config.verifyCredentials();
    
    res.json({
      success: result.isValid,
      message: result.isValid ? 
        'Credenciales verificadas correctamente' : 
        'Error en verificación de credenciales',
      verified: result.isValid,
      error: result.error || null,
      userData: result.userData || null
    });
    
  } catch (error) {
    console.error('Error verifying credentials:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Eliminar configuración
const deleteConfig = async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    // Desactivar configuración
    const config = await UserSocialConfig.findOne({
      where: { userId, provider }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuración no encontrada'
      });
    }
    
    await config.update({ isActive: false });
    
    // También desconectar cuentas relacionadas
    await SocialAccount.update(
      { isActive: false },
      { where: { userId, provider } }
    );
    
    res.json({
      success: true,
      message: 'Configuración eliminada correctamente'
    });
    
  } catch (error) {
    console.error('Error deleting config:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Obtener instrucciones para cada proveedor
const getProviderInstructions = async (req, res) => {
  try {
    const { provider } = req.params;
    const instructions = getSetupInstructions(provider);
    
    res.json({
      success: true,
      instructions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error obteniendo instrucciones'
    });
  }
};

// Funciones auxiliares
function validateProviderCredentials(provider, credentials) {
  const { clientId, clientSecret, apiKey, bearerToken } = credentials;
  
  switch (provider) {
    case 'twitter':
      if (!bearerToken && (!clientId || !clientSecret)) {
        return {
          isValid: false,
          message: 'Twitter requiere Bearer Token o Client ID + Client Secret'
        };
      }
      return { isValid: true };
      
    case 'facebook':
    case 'instagram':
      if (!clientId || !clientSecret) {
        return {
          isValid: false,
          message: `${provider} requiere Client ID y Client Secret`
        };
      }
      return { isValid: true };
      
    case 'linkedin':
      if (!clientId || !clientSecret) {
        return {
          isValid: false,
          message: 'LinkedIn requiere Client ID y Client Secret'
        };
      }
      return { isValid: true };
    
    case 'mastodon':
      if (!clientId || !clientSecret) {
        return {
          isValid: false,
          message: 'Mastodon requiere Client ID y Client Secret'
        };
      }
      return { isValid: true };
    default:
      return {
        isValid: false,
        message: 'Proveedor no soportado'
      };
  }
}

function getSetupInstructions(provider) {
  const instructions = {
    twitter: {
      title: 'Configurar Twitter API',
      steps: [
        'Ve a https://developer.twitter.com/en/portal/dashboard',
        'Crea una nueva app o selecciona una existente',
        'En "Keys and tokens", copia tu Bearer Token',
        'O copia Client ID y Client Secret si prefieres OAuth 2.0',
        'Asegúrate de tener permisos de escritura habilitados'
      ],
      required: ['bearerToken', 'clientId', 'clientSecret'],
      optional: ['apiKey']
    },
    facebook: {
      title: 'Configurar Facebook App',
      steps: [
        'Ve a https://developers.facebook.com/apps/',
        'Crea una nueva app o selecciona una existente',
        'Agrega el producto "Facebook Login"',
        'En configuración básica, copia App ID y App Secret',
        'Configura dominios válidos de OAuth redirect'
      ],
      required: ['clientId', 'clientSecret'],
      optional: []
    },
    instagram: {
      title: 'Configurar Instagram Basic Display',
      steps: [
        'Ve a https://developers.facebook.com/apps/',
        'Selecciona tu app de Facebook',
        'Agrega el producto "Instagram Basic Display"',
        'Copia Client ID y Client Secret',
        'Configura redirect URIs válidas'
      ],
      required: ['clientId', 'clientSecret'],
      optional: []
    },
    linkedin: {
      title: 'Configurar LinkedIn API',
      steps: [
        'Ve a https://www.linkedin.com/developers/apps',
        'Crea una nueva app',
        'Solicita acceso a "Sign In with LinkedIn" y "Share on LinkedIn"',
        'Copia Client ID y Client Secret',
        'Configura redirect URLs autorizadas'
      ],
      required: ['clientId', 'clientSecret'],
      optional: []
    },
    mastodon: {
      title: 'Configurar Mastodon App',
      steps: [
        'Ve a tu instancia de Mastodon (ej. https://mastodon.social)',
        'En configuración, ve a "Desarrolladores" y crea una nueva aplicación',
        'Copia Client ID y Client Secret',
        'Configura los permisos necesarios (leer, escribir, seguir)',
        'Usa la URL de tu instancia como Client ID'
      ],
      required: ['clientId', 'clientSecret'],
      optional: []
    }
  };
  
  return instructions[provider] || null;
}

module.exports = {
  showApiConfig,
  saveApiConfig,
  verifyCredentials,
  deleteConfig,
  getProviderInstructions
};