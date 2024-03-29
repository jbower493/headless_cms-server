// import dependencies
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const datemaker = require('datemaker');
const morgan = require('morgan');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// import routers
const authRouter = require('./routes/auth/authRouter.js');
const apiRouter = require('./routes/api/apiRouter');

// import other files
const db = require('./config/db/db');
const logger = require('./config/logging/winston');
const authController = require('./controllers/auth/authController');

// define app and port
const app = express();
const PORT = process.env.PORT;

// connect to DB
db.connect(err => {
  if(err) {
    return logger.error(err.stack);
  }
  logger.info(`${process.env.NODE_ENV} database connected`);
});

// initialize mysql session store
const sessionStore = new MySQLStore({}, db);

// initialize sessions
app.use(session({
  name: "session_id",
  genid: (req) => {
    return uuidv4();
  },
  secret: 'secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore
}));

// allow cross origin resource sharing, note the default setting allows ANY origin to connect, change this for production
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// parse json request bodies
app.use(express.json());

// log http requests
const morganFormat = require('./config/logging/morganFormat');
app.use(morgan(morganFormat, { stream: logger.stream }));

// make logged in user available on req object as req.user
app.use(authController.deserializeUser);

// add a 1 second delay to responses if dev mode, so I can see the loading states in development
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'dev') {
    return setTimeout(() => next(), 1000);
  }
  next();
});

// mount routers
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// 404 response
app.use((req, res, next) => {
  res.status(404).json({
    error: 'No route exists',
    message: '',
    success: false,
    user: null
  });
});

// error handler
app.use((err, req, res, next) => {
  logger.error(`[${datemaker.UTC()}] [${req.method}] [${req.originalUrl}] [${req.ip}] [${err.stack}]`);
  res.status(500).json({
    error: 'Server error, apologies',
    message: '',
    success: false,
    user: null
  });
});

// run the app
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});

// export the app for testing
module.exports = app;