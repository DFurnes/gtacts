/*
 * Module dependencies.
 */

var express = require('express')
  , ejs = require('ejs')
  , routes = require('./routes')
  , http = require('http')
  , https = require('https')
  , qs = require('qs')
  , path = require('path')
  , util = require('util')
  , nano = require('nano')('http://localhost:5984/')
  , passport = require('passport')
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
    console.log(accessToken);
    console.log(refreshToken);

    var newUser = {
      id: profile.id,
      name: profile.displayName,
      accessToken: accessToken,
      refreshToken: refreshToken
    }

    if(!req.user) {
      // not logged in, authenticate based on Google account

      // check if this user already exists, and if so add _rev to update it
      db.get(profile.id, function(err, existing) {
        if(err) {
          existing = {};
          existing.id = profile.id;
        }

        if(newUser.name != undefined) existing.name = newUser.name;
        if(newUser.accessToken != undefined) existing.accessToken = newUser.accessToken;
        if(newUser.refreshToken != undefined) existing.refreshToken = newUser.refreshToken;

        // add updated ID, full name, and access token to DB
        db.insert(existing, profile.id, function(err, body, header) {
          if(err) {
            console.log('[db.insert] ', err.message);
            return;
          }

          console.log('Authenticated & inserted/updated user in database.');
          console.log(existing);
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
app.get('/user', ensureAuthenticated,function(req, res) {
  res.render('index.ejs', { title: "User Info", user: req.user });
  console.log(util.inspect(req.user));
});


// GET /auth/google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.profile',
                                            'https://www.google.com/m8/feeds'],
                                    accessType: 'offline' })
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

// GET /contacts
app.get('/contacts', ensureAuthenticated, function(req, res) {
  req_authorization = 'Bearer ' + req.user.accessToken;
  console.log(req_authorization)

  var options = {
    host: 'www.google.com',
    port: 443,
    path: '/m8/feeds/contacts/default/full/',
    method: 'GET',
    headers: {
      'GData-Version': '3.0',
      'Content-length': '0',
      'Authorization': req_authorization
    }
  }

  var req = https.request(options, function(res) {
    var buffer = "", data;
    res.setEncoding('utf8');

    res.on('data', function(chunk) {
      buffer += chunk;
    });

    res.on('end', function() {
      console.log(buffer);
      //data = JSON.parse(buffer); // parse into valid JSON
      //console.log(data);

    });
  });

  req.end();
  
  // refreshToken(req.user.id, function(result) {
  // });
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





// Gets a new access_token (expires every hour) using our refresh token.
function refreshToken(user_id, callback) {
  console.log("Refreshing access token for user " + user_id + "...");

  var previous_token, refresh_token, access_token;
  db.get(user_id, function(err, existing) {
    if(err) console.error("[db.get] ", err.message);

    console.log(existing);

    previous_token = existing.accessToken;
    refresh_token = existing.refreshToken;
  });

  var post_data = qs.stringify({
    'refresh_token': refresh_token,
    'client_id': conf.google.clientID,
    'client_secret': conf.google.clientSecret,
    'grant_type': 'refresh_token'
  });
  
  var options = {
    host: 'accounts.google.com',
    port: 443,
    path: '/o/oauth2/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': post_data.length,
    }
  }
  
  var req = https.request(options, function(res) {
    res.setEncoding('utf8');
    
    console.log("Making request for new access token using refresh token: " + refresh_token);
    res.on('data', function(data) {
      data = JSON.parse(data);

      console.log(data);
      if(data.access_token != undefined) {
        console.log("****** NEW ACCESS TOKEN ****** ");
        console.log(data.access_token);
        console.log("****************************** ");
        access_token = data.access_token;
        
        if(previous_token != access_token) {
            db.get(user_id, function(err, existing) {
              if(err) console.error("[db.get] ", err.message);
              
              existing.access_token = access_token;
              db.insert(existing, user_id, function() {
                callback();
              });
            });
        } else {
          console.error("ERROR: Could not refresh access token.");
        }
      }
    });
  });
  
  req.write(post_data);
  req.end();
}