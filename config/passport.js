require('dotenv').config();

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    // aquí guardas o encuentras el usuario
    return done(null, profile);
  }
));
// Estrategia LinkedIn
passport.use(new LinkedInStrategy({
  clientID: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/linkedin/callback",
  scope: ['r_emailaddress', 'r_liteprofile'],
}, async (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

// Serialización global
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

//google
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Aquí buscas o creas el usuario
        let user = await User.findOne({ where: { email: profile.emails[0].value } });

        if (!user) {
            user = await User.create({
                name: profile.displayName,
                email: profile.emails[0].value,
                password: null // porque autenticación con Google
            });
        }

        // Opcional: guardar en SocialAccount
        await SocialAccount.upsert({
            userId: user.id,
            provider: 'google',
            providerId: profile.id,
            token: accessToken,
            refreshToken: refreshToken || null
        });

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));



// Estrategia Local
const configureLocalStrategy = () => {
  passport.use('local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  }, async (email, password, done) => {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) return done(null, false, { message: 'Correo no registrado' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return done(null, false, { message: 'Contraseña incorrecta' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
};

module.exports = { passport, configureLocalStrategy };
