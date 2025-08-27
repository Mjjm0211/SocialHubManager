//configuracion centarl para autenticacion y publicacion con diferentes redes sociales
require("dotenv").config();
const passport = require("passport");
//estrategias para diferentes redes sociales
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const TwitterStrategy = require("passport-twitter").Strategy;
const { TwitterApi } = require("twitter-api-v2");
const OAuth2Strategy = require("passport-oauth2").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const InstagramStrategy = require("passport-instagram").Strategy;
const bcrypt = require("bcryptjs");
let fetch;
(async () => {
  fetch = (await import("node-fetch")).default;
})();

// Importa modelos desde index.js
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
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({
          where: { email: profile.emails[0].value },
        });

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
passport.use(
  "mastodon",
  new OAuth2Strategy(
    {
      authorizationURL: "https://mastodon.social/oauth/authorize",
      tokenURL: "https://mastodon.social/oauth/token",
      clientID: process.env.MASTODON_CLIENT_ID,
      clientSecret: process.env.MASTODON_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/oauth/mastodon/callback",
      scope: "read write",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Obtener perfil
        const response = await fetch(
          "https://mastodon.social/api/v1/accounts/verify_credentials",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const profileData = await response.json();
        done(null, {
          id: profileData.id,
          username: profileData.username,
          displayName: profileData.display_name,
          avatar: profileData.avatar,
          accessToken,
          refreshToken,
          profileData,
        });
      } catch (err) {
        done(err);
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

// Estrategia Facebook
function createFacebookStrategy() {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/oauth/facebook/callback",
        profileFields: ["id", "displayName", "photos", "email"],
        passReqToCallback: true, // para obtener req
      },

      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const userId = req.user.id;

          // Obtiene páginas administradas
          let pageId = null;
          let pageAccessToken = null;
          try {
            const pagesRes = await fetch(
              `https://graph.facebook.com/me/accounts?access_token=${accessToken}`
            );
            const pagesData = await pagesRes.json();
            if (pagesData.data && pagesData.data.length > 0) {
              pageId = pagesData.data[0].id;
              pageAccessToken = pagesData.data[0].access_token;
            }
          } catch (err) {
            console.warn("No se pudo obtener página de Facebook:", err);
          }

          // Busca la SocialAccount 
          let account = await SocialAccount.findOne({
            where: { provider: "facebook", providerId: profile.id },
          });
          if (!account) {
            // Crea nueva cuenta
            account = await SocialAccount.create({
              userId,
              provider: "facebook",
              providerId: profile.id,
              displayName: profile.displayName,
              username: profile.username || profile.displayName,
              token: accessToken,
              refreshToken: refreshToken || null,
              clientId: pageId, 
              clientSecret: pageAccessToken, 
              avatar: profile.photos?.[0]?.value || null,
              profileData: JSON.stringify({
                name: profile.displayName,
                email: profile.emails?.[0]?.value || null,
              }),
              isActive: true,
            });
          } else if (account) {
        
            await account.update({
              userId,
              displayName: profile.displayName,
              username: profile.username || profile.displayName,
              token: accessToken,
              refreshToken: refreshToken || null,
              clientId: pageId,
              clientSecret: pageAccessToken,
              avatar: profile.photos?.[0]?.value || null,
              profileData: JSON.stringify({
                name: profile.displayName,
                email: profile.emails?.[0]?.value || null,
              }),
              isActive: true,
              updatedAt: new Date(),
            });
          }

          profile.socialAccountId = account.id;

          return done(null, profile);
        } catch (err) {
          console.error("Error guardando SocialAccount Facebook:", err);
          return done(err);
        }
      }
    )
  );
}

// Estrategia Twitter 
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

        // Busca o crea la cuenta
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

        if (created) {
          // Si ya existía, actualiza
          await account.update({
            userId: userId,
            displayName: profile.username,
            token: token,
            refreshToken: tokenSecret,
            updatedAt: new Date(),
          });
        }

        profile.socialAccountId = account.id; 

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
const publishToSocial = async (accountId, provider, content, imageUrl) => {
  console.log("accountId:", accountId);
  try {
    const socialAccount = await SocialAccount.findOne({
      where: {
        id: accountId,
      },
    });
    console.log("socialAccount:", socialAccount);
    if (!socialAccount)
      throw new Error(`No se encontró la cuenta social (ID: ${accountId})`);
    switch (provider) {
      case "twitter":
        // Busca la cuenta de Facebook del usuario
        const socialAccount = await SocialAccount.findOne({
          where: {
            id: accountId, 
            provider: "twitter",
          },
        });

        if (!socialAccount) {
          throw new Error(
            `No se encontró la cuenta de Twitter para userId: ${accountId}`
          );
        }
        if (!socialAccount.token || !socialAccount.refreshToken)
          throw new Error("Tokens de Twitter no disponibles");

        const twitterClient = new TwitterApi({
          appKey: process.env.TWITTER_API_KEY,
          appSecret: process.env.TWITTER_API_SECRET,
          accessToken: socialAccount.token,
          accessSecret: socialAccount.refreshToken,
        });

        return await twitterClient.v2.tweet(content);
      case "facebook": {
        // Busca la cuenta de Facebook del usuario
        const socialAccount = await SocialAccount.findOne({
          where: {
            id: accountId, 
            provider: "facebook",
          },
        });

        if (!socialAccount) {
          throw new Error(
            `No se encontró la cuenta de Facebook para userId: ${accountId}`
          );
        }

        const pageId = socialAccount.clientId; 
        const pageAccessToken = socialAccount.clientSecret; 

        if (!pageId || !pageAccessToken) {
          throw new Error(
            "No se han definido pageId o pageAccessToken en SocialAccount"
          );
        }

        let endpoint = `https://graph.facebook.com/${pageId}/feed`;
        let body = new URLSearchParams({
          message: content,
          access_token: pageAccessToken,
        });

        if (imageUrl) {
          endpoint = `https://graph.facebook.com/${pageId}/photos`;
          body = new URLSearchParams({
            caption: content,
            url: imageUrl,
            access_token: pageAccessToken,
          });
        }

        const res = await fetch(endpoint, { method: "POST", body });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `Error publicando en Facebook: ${res.status} - ${text}`
          );
        }

        return await res.json();
      }

      case "instagram": {
        if (!socialAccount.token)
          throw new Error("Token de Instagram no disponible");

        const igUserId = process.env.IG_USER_ID; 
        if (!imageUrl) throw new Error("Instagram requiere imagen");

      
        let mediaRes = await fetch(
          `https://graph.facebook.com/v18.0/${igUserId}/media`,
          {
            method: "POST",
            body: new URLSearchParams({
              image_url: imageUrl, 
              caption: content,
              access_token: socialAccount.token,
            }),
          }
        );
        const mediaData = await mediaRes.json();
        if (!mediaData.id)
          throw new Error("Error creando media container en Instagram");

        // Paso 2: publicar
        let publishRes = await fetch(
          `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
          {
            method: "POST",
            body: new URLSearchParams({
              creation_id: mediaData.id,
              access_token: socialAccount.token,
            }),
          }
        );

        const publishData = await publishRes.json();
        if (!publishData.id) throw new Error("Error publicando en Instagram");

        return publishData;
      }
      case "mastodon": {
        
        const socialAccount = await SocialAccount.findOne({
          where: {
            id: accountId,
            provider: "mastodon",
          },
        });

        if (!socialAccount || !socialAccount.token) {
          throw new Error(
            `No se encontró la cuenta de Mastodon o el token no está disponible (userId: ${accountId})`
          );
        }

        const mastodonBaseUrl =
          socialAccount.instanceUrl || "https://mastodon.social";

        let mediaId = null;
        if (imageUrl) {
          // Subir imagen primero
          const imageResponse = await fetch(`${mastodonBaseUrl}/api/v2/media`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${socialAccount.token}`,
            },
            body: (() => {
              const formData = new FormData();
              const fs = require("fs");
              formData.append("file", fs.createReadStream(`.${imageUrl}`));
              return formData;
            })(),
          });

          if (!imageResponse.ok) {
            throw new Error(
              `Error subiendo imagen a Mastodon: ${imageResponse.statusText}`
            );
          }
          const imageData = await imageResponse.json();
          mediaId = imageData.id;
        }

        // Publica el estado
        const postBody = {
          status: content,
          ...(mediaId && { media_ids: [mediaId] }), // Solo incluye si hay mediaId
        };


        const postResponse = await fetch(`${mastodonBaseUrl}/api/v1/statuses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${socialAccount.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postBody),
        });

        if (!postResponse.ok) {
          throw new Error(
            `Error publicando en Mastodon: ${postResponse.statusText}`
          );
        }

        return await postResponse.json();
      }

      default:
        throw new Error(`Publicación no implementada para ${provider}`);
    }
  } catch (err) {
    console.error(
      `Error publicando en ${provider} (accountId: ${accountId}):`,
      err
    );
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

// Serialización que almacena el ID del usuario en la sesión
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id, {
      include: [{ model: SocialAccount, as: "socialAccounts" }],
    });
    done(null, user);
  } catch (err) {
    console.error("❌ Error en deserializeUser:", err.message);
    console.error(err); // muestra detalles específicos del error
    done(err);
  }
});

module.exports = {
  passport,
  configureLocalStrategy,
  createTwitterStrategy,
  createFacebookStrategy,
  publishToSocial,
};
