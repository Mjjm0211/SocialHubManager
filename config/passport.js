require("dotenv").config();
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const TwitterStrategy = require("passport-twitter").Strategy;
const { TwitterApi } = require("twitter-api-v2"); 
const OAuth2Strategy = require('passport-oauth2').Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const InstagramStrategy = require("passport-instagram").Strategy;
const bcrypt = require("bcryptjs");

// Importar modelos desde index.js
const { User, SocialAccount } = require("../models");



// Estrategia Local
const configureLocalStrategy = () => {
  passport.use(
    "local",
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await User.findOne({ where: { email } });
          if (!user)
            return done(null, false, { message: "Correo no registrado" });

          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch)
            return done(null, false, { message: "Contraseña incorrecta" });

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
};

// Estrategia Google
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ where: { email: profile.emails[0].value } });

        if (!user) {
          user = await User.create({
            name: profile.displayName,
            email: profile.emails[0].value,
            password: null,
            twoFactorEnabled: false,
          });
        }

        await SocialAccount.upsert({
          userId: user.id,
          provider: "google",
          providerId: profile.id,
          token: accessToken,
          refreshToken: refreshToken || null,
          username: profile.displayName,
          profileData: JSON.stringify({
            name: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0]?.value,
          }),
        });

        return done(null, user);
      } catch (err) {
        console.error("Error en Google Strategy:", err);
        return done(err);
      }
    }
  )
);
//estrategia mastodon


passport.use('mastodon', new OAuth2Strategy({
  authorizationURL: 'https://mastodon.social/oauth/authorize',
  tokenURL: 'https://mastodon.social/oauth/token',
  clientID: process.env.MASTODON_CLIENT_ID,
  clientSecret: process.env.MASTODON_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/oauth/mastodon/callback'
},
async (accessToken, refreshToken, profile, done) => {
  try {
    // Obtener perfil
    const response = await fetch('https://mastodon.social/api/v1/accounts/verify_credentials', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const profileData = await response.json();

    done(null, {
      id: profileData.id,
      username: profileData.username,
      displayName: profileData.display_name,
      avatar: profileData.avatar,
      accessToken,
      refreshToken,
      profileData
    });
  } catch (err) {
    done(err);
  }
}));





// Estrategia LinkedIn
passport.use(
  new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL:
        process.env.LINKEDIN_CALLBACK_URL || "http://localhost:3000/auth/linkedin/callback",
      scope: ["r_emailaddress", "r_liteprofile", "w_member_social"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.userId) {
          return done(new Error("Usuario no autenticado"), null);
        }

        await SocialAccount.upsert({
          userId: profile.userId,
          provider: "linkedin",
          providerId: profile.id,
          token: accessToken,
          refreshToken: refreshToken || null,
          username: profile.displayName,
          profileData: JSON.stringify({
            name: profile.displayName,
            headline: profile.headline,
            profileUrl: profile.profileUrl,
          }),
        });

        const user = await User.findByPk(profile.userId);
        return done(null, user);
      } catch (err) {
        console.error("Error en LinkedIn Strategy:", err);
        return done(err);
      }
    }
  )
);

// Estrategia Twitter - Configuración dinámica
const createTwitterStrategy = (consumerKey, consumerSecret, callbackURL) => {
  return new TwitterStrategy(
    {
      consumerKey,
      consumerSecret,
      callbackURL,
      includeEmail: true,
      passReqToCallback: true, // Necesario para obtener req
    },
    async (req, token, tokenSecret, profile, done) => {
      try {
        const userId = req.user.id; // ID del usuario logueado

        // Buscar o crear la cuenta
        const [account, created] = await SocialAccount.findOrCreate({
          where: {
            provider: "twitter",
            providerId: profile.id,
          },
          defaults: {
            userId: userId,
            displayName: profile.username,
            token: token,
            refreshToken: tokenSecret,
          },
        });

        if (!created) {
          // Si ya existía, actualizarla
          await account.update({
            userId: userId,
            displayName: profile.username,
            token: token,
            refreshToken: tokenSecret,
            updatedAt: new Date(),
          });
        }

        profile.socialAccountId = account.id; // opcional, útil para futuras consultas

        return done(null, profile);
      } catch (err) {
        console.error("Error guardando SocialAccount:", err);
        return done(err);
      }
    }
  );
};
/**
 * Publica contenido en la red social especificada
 * @param {number} accountId - ID de SocialAccount
 * @param {string} provider - 'twitter' (puede extenderse a otras redes)
 * @param {string} content - Texto a publicar
 */
const publishToSocial = async (accountId, provider, content) => {
  try {
    const socialAccount = await SocialAccount.findByPk(accountId);
    if (!socialAccount) throw new Error(`No se encontró la cuenta social (ID: ${accountId})`);

    switch (provider) {
      case "twitter":
        if (!socialAccount.token || !socialAccount.refreshToken)
          throw new Error("Tokens de Twitter no disponibles");

        // Inicializar cliente de Twitter
        const twitterClient = new TwitterApi({
          appKey: process.env.TWITTER_API_KEY,
          appSecret: process.env.TWITTER_API_SECRET,
          accessToken: socialAccount.token,
          accessSecret: socialAccount.refreshToken,
        });

        // Publicar tweet
        const tweet = await twitterClient.v2.tweet(content);
        return tweet;

      default:
        throw new Error(`Publicación no implementada para ${provider}`);
    }
  } catch (err) {
    console.error(`Error publicando en ${provider} (accountId: ${accountId}):`, err);
    throw err;
  }
};
// Credenciales de conexión a Twitter dinámicas
passport.use(
  "twitter",
  createTwitterStrategy(
    process.env.TWITTER_API_KEY,
    process.env.TWITTER_API_SECRET,
    process.env.TWITTER_CALLBACK_URL
  )
);

// Serialización
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id, { include: [{ model: SocialAccount, as: "socialAccounts" }] });
    done(null, user);
  } catch (err) {
    console.error('❌ Error en deserializeUser:', err.message);
    console.error(err); // muestra detalles como error de SQL, tabla/columna inexistente, etc.
    done(err);
  }
});

module.exports = {
  passport,
  configureLocalStrategy,
  createTwitterStrategy,
  publishToSocial,
};
