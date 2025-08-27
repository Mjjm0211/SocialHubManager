
const express = require('express');
const router = express.Router();
const { passport } = require('../config/passport'); 

// Inicia autenticación con Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Callback de Google
router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Si todo sale bien, redirige al dashboard
        res.redirect('/dashboard');
    }
);

module.exports = router;
