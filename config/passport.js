const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Configuración de la estrategia local
const configureLocalStrategy = () => {
  passport.use('local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  }, async (email, password, done) => {
    try {
      const user = await User.findOne({ where: { email } });
      
      if (!user) {
        return done(null, false, { message: 'Correo electrónico no registrado' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Contraseña incorrecta' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));

  // Serialización del usuario
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialización del usuario
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
};

module.exports = {
  configureLocalStrategy,
  passport
};