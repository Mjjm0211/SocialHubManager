require("dotenv").config();
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const TwitterStrategy = require("passport-twitter").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const InstagramStrategy = require("passport-instagram").Strategy;
const User = require("../models/User");
const SocialAccount = require("../models/SocialAccount");
const bcrypt = require("bcryptjs");

// Estrategia Local
const configureLocalStrategy = () => {
  passport.use(
    "local",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
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
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Buscar o crear usuario
        let user = await User.findOne({
          where: { email: profile.emails[0].value },
        });

        if (!user) {
          user = await User.create({
            name: profile.displayName,
            email: profile.emails[0].value,
            password: null, // Autenticación con Google
            twoFactorEnabled: false,
          });
        }

        // Guardar/actualizar cuenta social
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

// Estrategia LinkedIn
passport.use(
  new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL:
        process.env.LINKEDIN_CALLBACK_URL ||
        "http://localhost:3000/auth/linkedin/callback",
      scope: ["r_emailaddress", "r_liteprofile", "w_member_social"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Solo conectar cuenta social si el usuario ya está autenticado
        if (!profile.userId) {
          return done(new Error("Usuario no autenticado"), null);
        }

        await SocialAccount.upsert({
          userId: profile.userId, // Este será pasado desde la sesión
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
      passReqToCallback: true, // ✅ Necesario para obtener req
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


// Uso
passport.use(
  "twitter",
  createTwitterStrategy(
    process.env.TWITTER_API_KEY,
    process.env.TWITTER_API_SECRET,
    process.env.TWITTER_CALLBACK_URL
  )
);

// Estrategia Facebook - Configuración dinámica
const createFacebookStrategy = (clientID, clientSecret, callbackURL) => {
  return new FacebookStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      profileFields: ["id", "displayName", "photos", "email"],
      scope: [
        "email",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
      ],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Agregar tokens al perfil
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        return done(null, profile);
      } catch (err) {
        console.error("Error en Facebook Strategy:", err);
        return done(err);
      }
    }
  );
};

// Estrategia Facebook por defecto
passport.use(
  "facebook",
  createFacebookStrategy(
    process.env.FACEBOOK_APP_ID || "default_id",
    process.env.FACEBOOK_APP_SECRET || "default_secret",
    process.env.FACEBOOK_CALLBACK_URL ||
      "http://localhost:3000/auth/facebook/callback"
  )
);

// Estrategia Instagram - Configuración dinámica
const createInstagramStrategy = (clientID, clientSecret, callbackURL) => {
  return new InstagramStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        return done(null, profile);
      } catch (err) {
        console.error("Error en Instagram Strategy:", err);
        return done(err);
      }
    }
  );
};

// Estrategia LinkedIn - Configuración dinámica
const createLinkedInStrategy = (clientID, clientSecret, callbackURL) => {
  return new LinkedInStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      scope: ["r_emailaddress", "r_liteprofile", "w_member_social"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        return done(null, profile);
      } catch (err) {
        console.error("Error en LinkedIn Strategy:", err);
        return done(err);
      }
    }
  );
};

// Estrategias por defecto
passport.use(
  "instagram",
  createInstagramStrategy(
    process.env.INSTAGRAM_CLIENT_ID || "default_id",
    process.env.INSTAGRAM_CLIENT_SECRET || "default_secret",
    process.env.INSTAGRAM_CALLBACK_URL ||
      "http://localhost:3000/auth/instagram/callback"
  )
);

passport.use(
  "linkedin",
  createLinkedInStrategy(
    process.env.LINKEDIN_CLIENT_ID || "default_id",
    process.env.LINKEDIN_CLIENT_SECRET || "default_secret",
    process.env.LINKEDIN_CALLBACK_URL ||
      "http://localhost:3000/auth/linkedin/callback"
  )
);

// Serialización y deserialización
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id, {
      include: [
        {
          model: SocialAccount,
          as: "socialAccounts",
        },
      ],
    });
    done(null, user);
  } catch (err) {
    console.error("Error en deserializeUser:", err);
    done(err);
  }
});

// Función para configurar estrategias dinámicamente
const configureUserStrategy = (provider, userConfig, userId) => {
  const { clientId, clientSecret, bearerToken, usesCentralApp } = userConfig;

  // Determinar qué credenciales usar
  const finalClientId = usesCentralApp
    ? process.env[`${provider.toUpperCase()}_CLIENT_ID`]
    : clientId;
  const finalClientSecret = usesCentralApp
    ? process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]
    : clientSecret;
  const finalBearerToken = usesCentralApp
    ? process.env[`${provider.toUpperCase()}_BEARER_TOKEN`]
    : bearerToken;

  const callbackURL = `${
    process.env.BASE_URL || "http://localhost:3000"
  }/auth/${provider}/callback`;

  // Configurar estrategia específica
  switch (provider) {
    case "twitter":
      if (finalBearerToken && !finalClientId) {
        // No necesita estrategia Passport para Bearer Token
        return null;
      }
      passport.use(
        `twitter-${userId}`,
        createTwitterStrategy(finalClientId, finalClientSecret, callbackURL)
      );
      break;

    case "facebook":
      passport.use(
        `facebook-${userId}`,
        createFacebookStrategy(finalClientId, finalClientSecret, callbackURL)
      );
      break;

    case "instagram":
      passport.use(
        `instagram-${userId}`,
        createInstagramStrategy(finalClientId, finalClientSecret, callbackURL)
      );
      break;

    case "linkedin":
      passport.use(
        `linkedin-${userId}`,
        createLinkedInStrategy(finalClientId, finalClientSecret, callbackURL)
      );
      break;
  }

  return `${provider}-${userId}`;
};
const getValidSocialToken = async (userId, provider) => {
  try {
    const socialAccount = await SocialAccount.findOne({
      where: {
        userId: userId,
        provider: provider,
      },
    });

    if (!socialAccount) {
      throw new Error(`No hay cuenta ${provider} conectada`);
    }

    // Verificar si el token necesita ser renovado (implementar según cada API)
    if (shouldRefreshToken(socialAccount, provider)) {
      const newTokens = await refreshSocialToken(socialAccount, provider);

      await socialAccount.update({
        token: newTokens.accessToken,
        refreshToken: newTokens.refreshToken || socialAccount.refreshToken,
        updatedAt: new Date(),
      });

      return newTokens.accessToken;
    }

    return socialAccount.token;
  } catch (err) {
    console.error(`Error obteniendo token de ${provider}:`, err);
    throw err;
  }
};

// Función para verificar si un token necesita renovación
const shouldRefreshToken = (socialAccount, provider) => {
  // Implementar lógica específica para cada proveedor
  const tokenAge = Date.now() - new Date(socialAccount.updatedAt).getTime();
  const oneHour = 60 * 60 * 1000;

  switch (provider) {
    case "facebook":
    case "instagram":
      // Los tokens de Facebook/Instagram duran ~60 días, renovar cada día
      return tokenAge > 24 * oneHour;
    case "google":
      // Google tokens duran 1 hora, renovar cada 50 minutos
      return tokenAge > 50 * 60 * 1000;
    case "linkedin":
      // LinkedIn tokens duran 60 días, renovar cada semana
      return tokenAge > 7 * 24 * oneHour;
    case "twitter":
      // Twitter tokens no expiran, pero verificar cada día
      return tokenAge > 24 * oneHour;
    default:
      return false;
  }
};

// Función para renovar tokens (implementar según cada API)
const refreshSocialToken = async (socialAccount, provider) => {
  // Esta función deberá implementarse según las especificaciones de cada API
  switch (provider) {
    case "google":
      return await refreshGoogleToken(socialAccount.refreshToken);
    case "facebook":
    case "instagram":
      return await refreshFacebookToken(socialAccount.token);
    case "linkedin":
      return await refreshLinkedInToken(socialAccount.refreshToken);
    default:
      throw new Error(`Renovación de token no implementada para ${provider}`);
  }
};

// Funciones específicas de renovación (ejemplos - implementar según APIs)
const refreshGoogleToken = async (refreshToken) => {
  // Implementar llamada a Google OAuth2 para renovar token
  // return { accessToken, refreshToken };
  throw new Error("Renovación de Google token no implementada");
};

const refreshFacebookToken = async (accessToken) => {
  // Implementar llamada a Facebook para extender token
  // return { accessToken };
  throw new Error("Renovación de Facebook token no implementada");
};

const refreshLinkedInToken = async (refreshToken) => {
  // Implementar llamada a LinkedIn OAuth2 para renovar token
  // return { accessToken, refreshToken };
  throw new Error("Renovación de LinkedIn token no implementada");
};

// Función helper para publicar en redes sociales
const publishToSocial = async (userId, provider, content) => {
  try {
    const token = await getValidSocialToken(userId, provider);

    switch (provider) {
      case "twitter":
        return await publishToTwitter(token, content);
      case "facebook":
        return await publishToFacebook(token, content);
      case "instagram":
        return await publishToInstagram(token, content);
      case "linkedin":
        return await publishToLinkedIn(token, content);
      default:
        throw new Error(`Publicación no soportada para ${provider}`);
    }
  } catch (err) {
    console.error(`Error publicando en ${provider}:`, err);
    throw err;
  }
};

// Funciones de publicación específicas (ejemplos - implementar según APIs)
const publishToTwitter = async (token, content) => {
  // Implementar usando Twitter API v2
  throw new Error("Publicación en Twitter no implementada");
};

const publishToFacebook = async (token, content) => {
  // Implementar usando Facebook Graph API
  throw new Error("Publicación en Facebook no implementada");
};

const publishToInstagram = async (token, content) => {
  // Implementar usando Instagram Graph API
  throw new Error("Publicación en Instagram no implementada");
};

const publishToLinkedIn = async (token, content) => {
  // Implementar usando LinkedIn API
  throw new Error("Publicación en LinkedIn no implementada");
};

module.exports = {
  passport,
  configureLocalStrategy,
  configureUserStrategy,
  createTwitterStrategy,
  createFacebookStrategy,
  createInstagramStrategy,
  createLinkedInStrategy,
  getValidSocialToken,
  publishToSocial,
};
