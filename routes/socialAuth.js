// routes/socialAuth.js
const express = require('express');
const router = express.Router();
const SocialAccount = require('../models/socialAccount');
const { ensureAuthenticated } = require('../middleware/auth');
const passport = require('passport');

// Redirigir a LinkedIn
router.get('/linkedin', ensureAuthenticated, passport.authenticate('linkedin'));

// Callback de LinkedIn
router.get('/linkedin/callback', 
  passport.authenticate('linkedin', { failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const linkedinUser = req.user;
      await storeSocialData(req.user.id, linkedinUser, 'linkedin');
      res.redirect('/dashboard');
    } catch (err) {
      console.error(err);
      res.redirect('/login');
    }
  }
);

// Función para guardar/actualizar cuenta social
async function storeSocialData(userId, socialUser, provider) {
  await SocialAccount.upsert({
    userId: userId,
    provider: provider,
    providerId: socialUser.id,
    token: socialUser.token,
    refreshToken: socialUser.refreshToken || null,
  });
}

module.exports = router;
