require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const { Sequelize } = require('sequelize');
const { configureLocalStrategy, passport, createFacebookStrategy} = require('./config/passport');
const authRoutes = require('./routes/auth');
const socialAuthRoutes = require('./routes/socialAuth');
const livereload = require("livereload");
const connectLivereload = require("connect-livereload");
const oauthRoutes = require('./routes/oauth');
const socialAccountController = require('./controllers/socialAccountController');
const postsRoutes = require('./routes/posts');
const facebookAuthRoutes = require('./routes/facebookAuth');

const app = express();
// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de PostgreSQL con Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
  }
);

// Prueba conexión a la base de datos 
sequelize.authenticate()
  .then(() => console.log('PostgreSQL conectado exitosamente'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));


// Sesión y Flash para mensajes
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret123',
  resave: false,
  saveUninitialized: false,
}));
app.use(flash());

// configuracion de passport 
configureLocalStrategy();
createFacebookStrategy();
app.use(passport.initialize());
app.use(passport.session());

// Configuracion de  rutas OAuth
app.use('/oauth', oauthRoutes);

// Rutas de redes sociales
app.use('/oauth/facebook', facebookAuthRoutes); 

// Rutas adicionales para configuración social
app.get('/social/config', socialAccountController.showApiConfig);
app.post('/social/config', socialAccountController.saveApiConfig);
app.post('/social/config/:provider/verify', socialAccountController.verifyCredentials);
app.delete('/social/config/:provider', socialAccountController.deleteConfig);
app.get('/social/config/:provider/instructions', socialAccountController.getProviderInstructions);

//Configuracion de posts
app.use('/posts', postsRoutes); 

// vistas 
app.set('view engine', 'ejs');

// Variables globales para mensajes flash
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.user || null;
  next();
});

// Rutas
app.get('/', (req, res) => res.redirect('/login'));
app.use('/', authRoutes);
app.use('/auth', socialAuthRoutes);

// Sincroniza modelos con la base de datos
sequelize.sync()
  .then(() => console.log('Modelos sincronizados con PostgreSQL'))
  .catch(err => console.error('Error al sincronizar modelos:', err));

// Live Reload para desarrollo
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(__dirname + "/views");
app.use(connectLivereload());
liveReloadServer.server.once("connection", () => {
  setTimeout(() => liveReloadServer.refresh("/"), 100);
});

// Puerto y servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en: http://localhost:${PORT}`));

//google
const googleAuthRoutes = require('./routes/googleAuth');
app.use('/auth', googleAuthRoutes);



module.exports = { sequelize };
