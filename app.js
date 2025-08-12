require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const { Sequelize } = require('sequelize');
const { configureLocalStrategy, passport } = require('./config/passport');
const authRoutes = require('./routes/auth');

const app = express();

// Configuración de PostgreSQL con Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    logging: false, // Para evitar logs excesivos en consola
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Probar conexión a PostgreSQL
sequelize.authenticate()
  .then(() => console.log('PostgreSQL conectado exitosamente'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));

// Middlewares
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: true,
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
  next();
});

// Ruta raíz redirige al login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Rutas de autenticación
app.use('/', authRoutes);

// Sincronizar modelos con la base de datos
sequelize.sync()
  .then(() => console.log('Modelos sincronizados con PostgreSQL'))
  .catch(err => console.error('Error al sincronizar modelos:', err));

// Puerto y servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en: http://localhost:${PORT}`);
});

module.exports = { sequelize }; // Exportamos sequelize para usarlo en otros archivos