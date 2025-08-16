require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const { Sequelize } = require('sequelize');
const { configureLocalStrategy, passport } = require('./config/passport');
const authRoutes = require('./routes/auth');
const socialAuthRoutes = require('./routes/socialAuth');
const livereload = require("livereload");
const connectLivereload = require("connect-livereload");

const app = express();

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

// Probar conexión a PostgreSQL
sequelize.authenticate()
  .then(() => console.log('PostgreSQL conectado exitosamente'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));

// Middlewares
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Sesión y flash
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret123',
  resave: false,
  saveUninitialized: false,
}));
app.use(flash());

// Passport
configureLocalStrategy();
app.use(passport.initialize());
app.use(passport.session());

// Configurar EJS
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

// Sincronizar modelos con la base de datos
sequelize.sync()
  .then(() => console.log('Modelos sincronizados con PostgreSQL'))
  .catch(err => console.error('Error al sincronizar modelos:', err));

// LiveReload (opcional)
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
