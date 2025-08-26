// routes/oauth.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { ensureAuthenticated } = require('../middleware/auth');
const {SocialAccount } = require("../models");

// Middleware para verificar token del usuario
const ensureUserToken = async (req, res, next) => {
  const { provider } = req.params;
  const userId = req.user.id;

  const account = await SocialAccount.findOne({
    where: { userId, provider, isActive: true }
  });

  req.session.userSocialAccount = account || null;
  next();
};

// ===== RUTAS FACEBOOK =====
router.get('/facebook', ensureAuthenticated, (req, res, next) => {
  passport.authenticate('facebook', {
    scope: ['email', 'pages_manage_posts', 'pages_read_engagement', 'publish_to_groups']
  })(req, res, next);
});

router.get('/facebook/callback', ensureAuthenticated, (req, res, next) => {
  passport.authenticate('facebook', async (err, profile, info) => {
    try {
      if (err || !profile) {
        req.flash('error_msg', 'Error conectando con Facebook');
        return res.redirect('/dashboard');
      }

      await SocialAccount.upsert({
        userId: req.user.id,
        provider: 'facebook',
        providerId: profile.id,
        token: profile.accessToken,
        username: profile.displayName,
        displayName: profile.displayName,
        avatar: profile.photos?.[0]?.value,
        profileData: JSON.stringify({
          name: profile.displayName,
          email: profile.emails?.[0]?.value
        }),
        isActive: true
      });

      req.flash('success_msg', '¡Facebook conectado exitosamente!');
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Error guardando Facebook account:', error);
      req.flash('error_msg', 'Error conectando con Facebook');
      res.redirect('/dashboard');
    }
  })(req, res, next);
});

// ===== RUTAS TWITTER =====
router.get('/twitter', ensureAuthenticated, (req, res, next) => {
  passport.authenticate('twitter')(req, res, next);
});

router.get('/twitter/callback', ensureAuthenticated, (req, res, next) => {
  passport.authenticate('twitter', async (err, profile, info) => {
    try {
      if (err || !profile) {
        req.flash('error_msg', 'Error conectando con Twitter');
        return res.redirect('/dashboard');
      }

      await SocialAccount.upsert({
        userId: req.user.id,
        provider: 'twitter',
        providerId: profile.id,
        token: profile.token,
        refreshToken: profile.tokenSecret,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.photos?.[0]?.value,
        profileData: JSON.stringify({
          name: profile.displayName,
          username: profile.username
        }),
        isActive: true
      });

      req.flash('success_msg', '¡Twitter conectado exitosamente!');
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Error guardando Twitter account:', error);
      req.flash('error_msg', 'Error conectando con Twitter');
      res.redirect('/dashboard');
    }
  })(req, res, next);
});

// en routes/oauth.js
router.get('/mastodon', ensureAuthenticated, passport.authenticate('mastodon'));

router.get('/mastodon/callback', ensureAuthenticated, (req, res, next) => {
  passport.authenticate('mastodon', async (err, profile) => {
    if (err || !profile) {
      req.flash('error_msg', 'Error conectando con Mastodon');
      return res.redirect('/dashboard');
    }
    try {
      await SocialAccount.upsert({
        userId: req.user.id,
        provider: 'mastodon',
        providerId: profile.id,
        token: profile.accessToken,
        refreshToken: profile.refreshToken,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        profileData: JSON.stringify(profile.profileData),
        isActive: true
      });

      req.flash('success_msg', '¡Mastodon conectado exitosamente!');
      res.redirect('/dashboard');
    } catch (error) {
      console.error(error);
      req.flash('error_msg', 'Error guardando datos de Mastodon');
      res.redirect('/dashboard');
    }
  })(req, res, next);
});

module.exports = router;
