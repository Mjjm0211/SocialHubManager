const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const SocialAccount = require('../models/SocialAccount'); // Agregar import
const { ensureAuthenticated } = require('../middleware/auth');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { Sequelize } = require('sequelize');

// Registro (GET)
router.get('/register', (req, res) => {
  res.render('register', { errors: [] });
});

// Registro (POST)
router.post('/register', async (req, res) => {
  const { name, email, password, password_confirmation } = req.body;
  const errors = [];

  // Validaciones
  if (!name || !email || !password || !password_confirmation) {
    errors.push({ msg: 'Todos los campos son obligatorios' });
  }
  if (password != password_confirmation) {
    errors.push({ msg: 'Las contraseñas no coinciden' });
  }
  if (password.length < 6) {
    errors.push({ msg: 'La contraseña debe tener al menos 6 caracteres' });
  }

  if (errors.length > 0) {
    return res.render('register', { errors, name, email, password, password_confirmation });
  }

  try {
    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      errors.push({ msg: 'El correo ya está registrado' });
      return res.render('register', { errors, name, email, password, password_confirmation });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear usuario en PostgreSQL
    await User.create({ 
      name, 
      email: email.toLowerCase(), 
      password: hashedPassword,
      twoFactorEnabled: false,
      otpSecret: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    req.flash('success_msg', 'Registro exitoso. Inicia sesión.');
    res.redirect('/login');
  } catch (err) {
    console.error('Error en registro:', err);
    res.render('register', { 
      errors: [{ msg: 'Error del servidor' }], 
      name, 
      email, 
      password, 
      password_confirmation 
    });
  }
});

// Login (GET)
router.get('/login', (req, res) => {
  res.render('login', { error_msg: req.flash('error_msg') });
});

// Login (POST)
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('Error en autenticación:', err);
      return next(err);
    }
    if (!user) {
      req.flash('error_msg', info.message || 'Error de autenticación');
      return res.redirect('/login');
    }
    
    req.logIn(user, (err) => {
      if (err) {
        console.error('Error en login:', err);
        return next(err);
      }
      
      // Verificar 2FA si está habilitado
      if (user.twoFactorEnabled) {
        req.session.pending_2fa_user = user.id;
        return res.redirect('/2fa/verify');
      }
      
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

// Logout
router.post('/logout', (req, res) => {
  // Destruye la sesión del usuario
  req.session.destroy(err => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.redirect('/dashboard'); // Si hay error, vuelve al dashboard
    }
    res.clearCookie('connect.sid'); // Limpiar la cookie de sesión
    res.redirect('/login'); // Redirige al login
  });
});

// Dashboard - ACTUALIZADO para incluir cuentas sociales
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    // Obtener el usuario con sus cuentas sociales activas
    const user = await User.findByPk(req.user.id, {
      include: [{
        model: SocialAccount,
        as: 'socialAccounts',
        where: { isActive: true },
        required: false, // LEFT JOIN para que aparezca el usuario aunque no tenga cuentas
        order: [['createdAt', 'DESC']]
      }]
    });

    if (!user) {
      req.flash('error_msg', 'Usuario no encontrado');
      return res.redirect('/login');
    }

    // Si no hay cuentas sociales, inicializar como array vacío
    if (!user.socialAccounts) {
      user.socialAccounts = [];
    }

    // Agregar información adicional para la vista
    const socialAccountsWithInfo = user.socialAccounts.map(account => {
      const accountData = account.toJSON();
      
      // Parsejar profileData si existe
      if (account.profileData) {
        try {
          accountData.profile = JSON.parse(account.profileData);
        } catch (e) {
          accountData.profile = {};
        }
      }

      // Agregar información de estado
      accountData.isExpired = account.isTokenExpired();
      accountData.canPost = account.canPost();
      
      return accountData;
    });

    // Preparar datos para la vista
    const dashboardData = {
      user: {
        ...user.toJSON(),
        socialAccounts: socialAccountsWithInfo
      }
    };

    res.render('dashboard', dashboardData);
  } catch (err) {
    console.error('Error al cargar dashboard:', err);
    req.flash('error_msg', 'Error al cargar el dashboard');
    res.redirect('/login');
  }
});

// Ruta para desconectar cuenta social
router.post('/social/disconnect/:provider', ensureAuthenticated, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    // Validar provider
    const validProviders = ['twitter', 'facebook', 'instagram', 'linkedin', 'google'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Proveedor no válido' 
      });
    }

    // Buscar y desactivar la cuenta social
    const socialAccount = await SocialAccount.findOne({
      where: { userId, provider, isActive: true }
    });

    if (!socialAccount) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cuenta social no encontrada' 
      });
    }

    // Desactivar en lugar de eliminar (para mantener historial)
    await socialAccount.update({ 
      isActive: false,
      token: null, // Limpiar tokens por seguridad
      refreshToken: null
    });

    res.json({ 
      success: true, 
      message: `Cuenta de ${provider} desconectada exitosamente` 
    });
  } catch (err) {
    console.error('Error desconectando cuenta social:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// 2FA Setup (GET)
router.get('/2fa/setup', ensureAuthenticated, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ 
      name: `SocialHub:${req.user.email}`,
      length: 20
    });
    const qrCodeDataURL = await qrcode.toDataURL(secret.otpauth_url);
    req.session.temp_secret = secret.base32;
    res.render('2fa-setup', { 
      qrCodeDataURL, 
      secret: secret.base32 
    });
  } catch (err) {
    console.error('Error en 2FA setup:', err);
    res.redirect('/dashboard');
  }
});

// 2FA Setup (POST)
router.post('/2fa/setup', ensureAuthenticated, async (req, res) => {
  const { token } = req.body;
  const secret = req.session.temp_secret;

  try {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (verified) {
      await User.update(
        { 
          twoFactorEnabled: true, 
          otpSecret: secret,
          updatedAt: new Date()
        },
        { 
          where: { id: req.user.id } 
        }
      );
      delete req.session.temp_secret;
      req.flash('success_msg', '2FA activado correctamente.');
      res.redirect('/dashboard');
    } else {
      req.flash('error_msg', 'Código OTP inválido.');
      res.redirect('/2fa/setup');
    }
  } catch (err) {
    console.error('Error en 2FA setup:', err);
    res.redirect('/dashboard');
  }
});

// 2FA Verify (GET)
router.get('/2fa/verify', (req, res) => {
  if (!req.session.pending_2fa_user) {
    return res.redirect('/login');
  }
  res.render('2fa-verify', { error_msg: req.flash('error_msg') });
});

// 2FA Verify (POST)
router.post('/2fa/verify', async (req, res) => {
  const { token } = req.body;
  const userId = req.session.pending_2fa_user;

  if (!userId) {
    return res.redirect('/login');
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      req.flash('error_msg', 'Usuario no encontrado.');
      return res.redirect('/login');
    }

    const verified = speakeasy.totp.verify({
      secret: user.otpSecret,
      encoding: 'base32',
      token,
      window: 2
    });

    if (verified) {
      req.logIn(user, (err) => {
        if (err) {
          req.flash('error_msg', 'Error al autenticar.');
          return res.redirect('/login');
        }
        delete req.session.pending_2fa_user;
        res.redirect('/dashboard');
      });
    } else {
      req.flash('error_msg', 'Código OTP incorrecto.');
      res.redirect('/2fa/verify');
    }
  } catch (err) {
    console.error('Error en 2FA verify:', err);
    res.redirect('/login');
  }
});

module.exports = router;