/*
 * Module dependencies.
 */

var express = require('express')
  , ejs = require('ejs')
  , routes = require('./routes')
  , http = require('http')
  , https = require('https')
  , qs = require('qs')
  , xml2js = require('xml2js')
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

var contactSchema = new mongoose.Schema({
  _id: String,
  profile_id: String,
  owner_id: String,
  name: String,
  address: String,
  phone: String
});

var Contact = mongoose.model('Contact', contactSchema);

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

    if(!req.user) {
      // not logged in, authenticate based on Google account
      var newUser = new User ({
        profile_id: profile.id,
        name: profile.displayName,
        accessToken: accessToken,
        refreshToken: refreshToken
      });

      User.findById("user_" + profile.id, function(err, user) {        
        if(user != undefined && user.refreshToken != undefined) newUser.refreshToken = user.refreshToken;

        newUser.save(function(err) {
          if(!err) {
            return console.log('created new user');
          } else {
            console.log('user already exists. updating...')

            user.name = profile.displayName;
            user.accessToken = accessToken;
            if(refreshToken != undefined) user.refreshToken = refreshToken;

            user.save(function(err) {
              if(err) console.error('Error updating user...', err.message);
            });
          }
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

// GET /contacts
app.get('/contacts', ensureAuthenticated,function(req, res) {
  res.render('contacts.ejs', { title: "User Info", user: req.user });
  console.log(util.inspect(req.user));
});

/*
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
 * API requests.
 */

// GET /api/users
// ** should be removed before going live, because security.
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

// GET /api/contacts
app.get('/api/contacts', ensureAuthenticated, function(req,res) {
  refreshContacts(req.user.accessToken, function(result) {

    Contact.find({owner_id: req.user.profile_id}, function(err, contacts) {
      //res.json(contacts);
      res.json(result.feed.entry);
    });
  });

  
});

// GET /api/contacts/:id
app.get('/api/contacts/:id', ensureAuthenticated, function(req,res) {
  var contact_id = req.params.id;
  Contact.findOne({owner_id: req.user.profile_id, profile_id: contact_id}, function(err, contact) {
    res.json(contact);
  });
});


app.get('/contacts/:id', ensureAuthenticated, function(req,res) {
  // var id = req.params.id;

  // var test = [
  //   { id: "1", name: "John Barrowman", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
  //   { id: "2", name: "Karen Gillan", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
  //   { id: "3", name: "Arthur Darvill", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
  //   { id: "4", name: "Catherine Tate", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
  //   { id: "5", name: "Billie Piper", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
  //   { id: "6", name: "Matt Smith", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
  //   { id: "7", name: "David Tennant", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
  //   { id: "8", name: "Christopher Eccleston", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
  //   { id: "9", name: "William Hartnell", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" }
  // ];

  // for(var contact in test) {
  //   if(contact.id == req.params.id) {
  //     return res.json(contact);
  //   }
  // }
});


function refreshContacts(accessToken, callback) {
  req_authorization = 'Bearer ' + accessToken;
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

  var api_req = https.request(options, function(api_res) {
    var buffer = "", data;
    api_res.setEncoding('utf8');

    api_res.on('data', function(chunk) {
      buffer += chunk;
    });

    api_res.on('end', function() {
      var parser = new xml2js.Parser();

      parser.on('end', function(result) {
        callback(result);
      });

      parser.parseString(buffer); // parse stinky XML into JSON

    });
  });

  api_req.end();
  
  // refreshToken(req.user.id, function(result) {
  // });
}

// GET /api/user/me
app.get('/api/me', ensureAuthenticated, function(req, res) {
  User.findById("user_" + req.user.profile_id, function(err, user) {
    res.json(user);
  })
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