// routes/facebookAuth.js
const express = require("express");
const passport = require("passport");
const { ensureAuthenticated } = require("../middleware/auth");
const { SocialAccount } = require("../models");

const router = express.Router();

// Iniciar login con Facebook
router.get("/", ensureAuthenticated, (req, res, next) => {
  passport.authenticate("facebook", {
    scope: [
      "email",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement"
    ]
  })(req, res, next);
});

// Callback de Facebook
router.get("/callback", ensureAuthenticated, (req, res, next) => {
  passport.authenticate("facebook", async (err, profile, info) => {
    try {
      if (err || !profile) {
        req.flash("error_msg", "Error conectando con Facebook");
        return res.redirect("/dashboard");
      }

      // Guardamos o actualizamos cuenta
      await SocialAccount.upsert({
        userId: req.user.id,
        provider: "facebook",
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

      req.flash("success_msg", "¡Facebook conectado exitosamente!");
      res.redirect("/dashboard");
    } catch (error) {
      console.error("Error guardando Facebook account:", error);
      req.flash("error_msg", "Error conectando con Facebook");
      res.redirect("/dashboard");
    }
  })(req, res, next);
});

module.exports = router;
