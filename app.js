/*
 * Module dependencies.
 */

var express = require('express')
  , ejs = require('ejs')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , util = require('util')
  , passport = require('passport')
  , nano = require('nano')('http://localhost:5984/')
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

var conf = require('./conf');

/*
 * CouchDB setup.
 */

var db_name = "gtacts", db = nano.use(db_name);

db.insert({nano: true}, function(err, body, headers) {
  if(err) { 
    if(err.message === 'no_db_file') {
      // first run! create database and retry.
      return nano.db.create(db_name, function() {
        console.log("Created database '" + db_name + "'.")
      })
    }
  } else {
    console.log("Connected to CouchDB database " + db_name + ".")
  }
});


/*
 * Passport setup.
 */

// passport session startup... since no persistent DB, complete profile is serialized/deserialized
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
})

// use GoogleStrategy within Passport
passport.use(new GoogleStrategy({
    clientID: conf.google.clientID,
    clientSecret: conf.google.clientSecret,
    callbackURL: "http://localhost:3000/auth/google/callback",
    passReqToCallback: true
  }, function(req, accessToken, refreshToken, profile, done) {
    console.log(profile.id);
    console.log(profile.displayName);
    console.log(profile._json.link);
    console.log(accessToken);

    var newUser = {
      id: profile.id,
      name: profile.displayName,
      link: profile._json.link,
      accessToken: accessToken,
    }

    if(!req.user) {
      // not logged in, authenticate based on Google account

      // check if this user already exists, and if so add _rev to update it
      db.get(profile.id, function(err, existing) {
        if(!err) newUser._rev = existing._rev;

        // add ID, full name, and access token to DB
        db.insert(newUser, profile.id, function(err, body, header) {
          if(err) {
            console.log('[db.insert] ', err.message);
            return;
          }

          console.log('Authenticated & inserted/updated user in database.');
          console.log(body);
        });
      });

      return done(null, newUser);
    } else {
      console.log("Already authenticated!");
      return done(null, newUser);
    }
  }
));

/*
 * Express setup.
 */

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({ secret: "ZEgpCugJaH"}));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

/*
 * HTTP requests.
 */

// GET /user
app.get('/user', ensureAuthenticated,function(req, res){
  res.render('index.ejs', { title: "User Info", user: req.user });
  console.log(util.inspect(req.user));
});


// GET /auth/google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.profile',
                                            'https://www.google.com/m8/feeds'] })
);

// GET /auth/google/callback
app.get('/auth/google/callback',
  passport.authenticate('google', { 
    successRedirect: "/user",
    failureRedirect: "/loginerror"
  })
);

// GET /logout
app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

/*
 * Server creation & middleware.
 */

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

// Route middleware to ensure user is authenticated.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/auth/google');
}

