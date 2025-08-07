const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/auth');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Registro
router.get('/register', (req, res) => {
  res.render('register', { errors: [] });  // <-- PASA errors vacío para que no falle la vista
});


router.post('/register', async (req, res) => {
  const { name, email, password, password2 } = req.body;
  let errors = [];

  if (!name || !email || !password || !password2) errors.push({ msg: 'Por favor rellena todos los campos' });
  if (password !== password2) errors.push({ msg: 'Las contraseñas no coinciden' });
  if (password.length < 6) errors.push({ msg: 'La contraseña debe tener al menos 6 caracteres' });

  if (errors.length > 0) {
    return res.render('register', { errors, name, email, password, password2 });
  }

  try {
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      errors.push({ msg: 'Correo ya registrado' });
      return res.render('register', { errors, name, email, password, password2 });
    }

    user = new User({ name, email: email.toLowerCase(), password });
    await user.save();
    req.flash('success_msg', 'Registrado correctamente. Ahora inicia sesión.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.render('register', { errors: [{ msg: 'Error en el servidor' }], name, email, password, password2 });
  }
});

// Login
router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error_msg', info.message);
      return res.redirect('/login');
    }

    req.logIn(user, async (err) => {
      if (err) return next(err);

      if (user.twoFactorEnabled) {
        req.session.pending_2fa_user = user._id;
        req.logout(() => {
          res.redirect('/2fa/verify');
        });
      } else {
        res.redirect('/dashboard');
      }
    });
  })(req, res, next);
});

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    req.flash('success_msg', 'Sesión cerrada');
    res.redirect('/login');
  });
});

// Dashboard protegido
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.render('dashboard', { user: req.user });
});

// 2FA Setup
router.get('/2fa/setup', ensureAuthenticated, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `SocialHubManager (${req.user.email})` });
  const qrCodeDataURL = await qrcode.toDataURL(secret.otpauth_url);
  req.session.temp_secret = secret;
  res.render('2fa-setup', { qrCodeDataURL, secret: secret.base32 });
});

router.post('/2fa/setup', ensureAuthenticated, async (req, res) => {
  const userToken = req.body.token;
  const secret = req.session.temp_secret;

  const verified = speakeasy.totp.verify({
    secret: secret.base32,
    encoding: 'base32',
    token: userToken
  });

  if (verified) {
    await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: true, otpSecret: secret.base32 });
    delete req.session.temp_secret;
    req.flash('success_msg', '2FA activado correctamente.');
    res.redirect('/dashboard');
  } else {
    req.flash('error_msg', 'Código OTP incorrecto, inténtalo de nuevo.');
    res.redirect('/2fa/setup');
  }
});

// 2FA Verify
router.get('/2fa/verify', (req, res) => {
  if (!req.session.pending_2fa_user) return res.redirect('/login');
  res.render('2fa-verify');
});

router.post('/2fa/verify', async (req, res) => {
  const { token } = req.body;

  if (!req.session.pending_2fa_user) return res.redirect('/login');

  const user = await User.findById(req.session.pending_2fa_user);
  if (!user) {
    req.flash('error_msg', 'Usuario no encontrado');
    return res.redirect('/login');
  }

  const isVerified = speakeasy.totp.verify({
    secret: user.otpSecret,
    encoding: 'base32',
    token
  });

  if (isVerified) {
    req.logIn(user, (err) => {
      if (err) {
        req.flash('error_msg', 'Error al autenticar con OTP');
        return res.redirect('/login');
      }
      delete req.session.pending_2fa_user;
      res.redirect('/dashboard');
    });
  } else {
    req.flash('error_msg', 'Código OTP incorrecto');
    res.redirect('/2fa/verify');
  }
});

module.exports = router;
