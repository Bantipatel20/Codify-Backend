var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const queue = require('express-queue');
const cors = require("cors");


// Rate limiting
const compileLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 requests per windowMs
  message: { error: 'Too many compilation requests, try again later' }
});

// Queue middleware for compilation endpoint
const compileQueue = queue({ activeLimit: 10, queuedLimit: 50 });



mongoose.connect('mongodb://localhost:27017/codify').then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {   
  console.log('MongoDB connection error:', err);
});


var indexRouter = require('./routes/compiler');
var usersRouter = require('./routes/users');
var contestRouter = require('./routes/contests');
var problemRouter = require('./routes/problems');


var app = express();

// Allow requests from React frontend
app.use(cors({ origin: "http://localhost:3000" }));

app.use('/compile', compileLimit);
app.use('/compile', compileQueue);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/', usersRouter);
app.use('/api/contests', contestRouter);
app.use('/api/problems', problemRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
