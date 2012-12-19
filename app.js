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
  , mongoose = require('mongoose')
  , passport = require('passport')
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

var conf = require('./conf');

/*
 * MongoDB setup.
 */

mongoose.connect(conf.mongodb.hostname, conf.mongodb.dbname);
mongoose.connection.on('error', function() {
  console.error('Mongoose connection error: check that mongod is running.');
})

var userSchema = new mongoose.Schema({
  _id: String,
  profile_id: String,
  name: String,
  accessToken: String,
  refreshToken: String
});

// custom id for users
userSchema.path('profile_id').set(function(v) {
  this._id = 'user_' + v;
  return v;
});

var User = mongoose.model('User', userSchema);

/*
 * Passport setup.
 */

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

    if(!req.user) {
      // not logged in, authenticate based on Google account
      var newUser = new User ({
        profile_id: profile.id,
        name: profile.displayName,
        accessToken: accessToken,
        refreshToken: refreshToken
      });

      if(refreshToken != undefined) {
        User.update({profile_id: profile.id}, {$set: {name: profile.displayName, accessToken: accessToken, refreshToken: refreshToken}}, {upsert: true}, function() {
          console.log("Inserted/updated user in database. Changed refresh token.")
        });
      } else {
        User.update({profile_id: profile.id}, {$set: {name: profile.displayName, accessToken: accessToken}}, {upsert: true}, function() {
          console.log("Updated user in database. Did not change refresh token.")
        });
      }

      return done(null, newUser);
    } else {
      console.log("Already authenticated!");
      return done(null, req.user);
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

// GET /contacts
app.get('/contacts', ensureAuthenticated,function(req, res) {
  res.render('contacts.ejs', { title: "User Info", user: req.user });
  console.log(util.inspect(req.user));
});

/*`
 * Passport requests.
 */

// GET /auth/google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/userinfo.profile',
                                            'https://www.google.com/m8/feeds'],
                                    accessType: 'offline' })
);

// GET /auth/google/callback
app.get('/auth/google/callback',
  passport.authenticate('google', { 
    successRedirect: "/contacts",
    failureRedirect: "/loginerror"
  })
);

// GET /logout
app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

/*
 * Gtacts API requests.
 */

// GET /api/users(/:id)
// just for demo purposes. probably wouldn't exist in production because security.
app.get('/api/users', function(req, res) {
  User.find(function(err, users) {
    res.json(users);
  })
});

app.get('/api/users/:id', function(req, res) {
  User.findById("user_" + req.params.id, function(err, user) {
    res.json(user);
  })
});

// GET /api/user/me
app.get('/api/me', ensureAuthenticated, function(req, res) {
  User.findById("user_" + req.user.profile_id, function(err, user) {
    res.json(user);
  })
});

// GET /api/contacts
app.get('/api/contacts', ensureAuthenticated, function(req,res) {
  refreshContacts(req.user.accessToken, req.user.profile_id, function(result) {
    var entries = JSON.parse(result).feed.entry;
    var parsed_entries = [];

    for(i in entries) {
      var name = "", email = [], phone = [];

      if(entries[i].title != undefined && entries[i].title['$t'] != "") {
        name = entries[i].title['$t'];
      } else {
        if(entries[i]['gd$email'] != undefined) {
          name = entries[i]['gd$email'][0].address;
        } else {
          name = "<unnamed contact>";
        }
      }

      if(entries[i]['gd$email'] != undefined) {
        for(j in entries[i]['gd$email']) {
          if(entries[i]['gd$email'][j].address != null) email.push(entries[i]['gd$email'][j].address);
        }
      }

      if(entries[i]['gd$phoneNumber'] != undefined) {
        for(j in entries[i]['gd$phoneNumber']) {
          if(entries[i]['gd$phoneNumber'][j]['$t'] != null) phone.push(entries[i]['gd$phoneNumber'][j]['$t']);
        }
      }

      parsed_entries.push({
        "name": name,
        "email": email,
        "phone": phone
      });
    }

    res.json(parsed_entries);
  });
});

/*
 * External API Resources.
 */

function refreshContacts(accessToken, user_id, callback) {
  req_authorization = 'Bearer ' + accessToken;

  var options = {
    host: 'www.google.com',
    port: 443,
    path: '/m8/feeds/contacts/default/full?max-results=75000&alt=json',
    method: 'GET',
    headers: {
      'GData-Version': '3.0',
      'Content-length': '0',
      'Authorization': req_authorization
    }
  }

  var api_req = https.request(options, function(api_res) {
    var buffer = "", data;
    api_res.setEncoding('utf8');

    api_res.on('error', function(e) {
      return refreshToken(user_id, function() {
        refreshContacts(accessToken, user_id, callback);
      });
    });

    api_res.on('data', function(chunk) {
      buffer += chunk;
    });

    api_res.on('end', function() {
      callback(buffer);
    });
  });

  api_req.end();
}

// Gets a new access_token (expires every hour) using our refresh token.
function refreshToken(user_id, callback) {
  console.log("Refreshing access token for user " + user_id + "...");

  var previous_token, refresh_token, access_token;
  User.findById("user_" + user_id, function(err, user) {
    if(err) console.error("Couldn't refresh access token because user isn't registered.");

    previous_token = user.accessToken;
    refresh_token = user.refreshToken;

    var post_data = qs.stringify({
      'client_id': conf.google.clientID,
      'client_secret': conf.google.clientSecret,
      'refresh_token': refresh_token,
      'grant_type': 'refresh_token'
    });

    var options = {
      host: 'accounts.google.com',
      port: 443,
      path: '/o/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
    
    var req = https.request(options, function(res) {
      res.setEncoding('utf8');
      
      console.log("Making request for new access token using refresh token: " + refresh_token);
      res.on('data', function(data) {
        data = JSON.parse(data);

        console.log(data);
        if(data.access_token != undefined) {
          console.log("New access token granted: " + data.access_token);
          access_token = data.access_token;
          
          if(previous_token != access_token) {
            User.update({profile_id: user_id}, {$set: {accessToken: access_token}}, {upsert: true}, function() {
              console.log("Updated refresh token in database.");
              callback();
            });
          } else {
            console.error("ERROR: Could not refresh access token.");
          }
        }
      });
    });
    
    req.write(post_data);
    req.end();
  });
}

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

