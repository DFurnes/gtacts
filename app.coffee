#
# Module dependencies.
#

express = require('express')
ejs = require('ejs')
routes = require('./routes')
http = require('http')
https = require('https')
qs = require('qs')
path = require('path')
util = require('util')
fs = require('fs')
mongoose = require('mongoose')
passport = require('passport')
GoogleStrategy = require('passport-google-oauth').OAuth2Strategy

conf = require('./conf')

#
# MongoDB setup.
#

mongoose.connect(conf.mongodb.hostname, conf.mongodb.dbname)
mongoose.connection.on 'error', ->
  console.error('Mongoose connection error: check that mongod is running.')

userSchema = new mongoose.Schema(
  _id: String
  profile_id: String
  name: String
  accessToken: String
  refreshToken: String
);

# custom id for users
userSchema.path('profile_id').set( ->
  this._id = 'user_' + v
  return v
)

User = mongoose.model('User', userSchema);

#
# Passport setup.
#

passport.serializeUser (user, done) ->
  done(null, user)

passport.deserializeUser (obj, done) ->
  done(null, obj)

# use GoogleStrategy within Passport
passport.use new GoogleStrategy(
    clientID: conf.google.clientID
    clientSecret: conf.google.clientSecret
    callbackURL: "http://localhost:3000/auth/google/callback"
    passReqToCallback: true
  , (req, accessToken, refreshToken, profile, done) ->
    if not req.user
      # not logged in, authenticate based on Google account
      newUser = new User (
        profile_id: profile.id
        name: profile.displayName
        accessToken: accessToken
        refreshToken: refreshToken
      )

      if refreshToken?
        User.update({profile_id: profile.id}, {$set: {name: profile.displayName, accessToken: accessToken, refreshToken: refreshToken}}, {upsert: true}, ->
          console.log "Inserted/updated user in database. Changed refresh token."
        )
      else
        User.update({profile_id: profile.id}, {$set: {name: profile.displayName, accessToken: accessToken}}, {upsert: true}, ->
          console.log "Updated user in database. Did not change refresh token."
        )

      done(null, newUser)
    else
      console.log("Already authenticated!")
      done(null, req.user)
)

# Route middleware to ensure user is authenticated.
ensureAuthenticated = (req, res, next) ->
  if req.isAuthenticated()
    next()
  else
    res.redirect '/auth/google'


#
# Express setup.
#

app = express()

app.configure( ->
  app.set 'port', process.env.PORT || 3000
  app.set 'views', __dirname + '/views'
  app.set 'view engine', 'ejs'
  app.use express.favicon()
  app.use express.logger('dev')
  app.use express.cookieParser()
  app.use express.bodyParser()
  app.use express.methodOverride()
  app.use express.session({ secret: "ZEgpCugJaH"})
  app.use passport.initialize()
  app.use passport.session()
  app.use app.router
  app.use express.static(path.join(__dirname, 'public'))
)

app.configure('development', ->
  app.use(express.errorHandler());
)


#
# HTTP requests.
#

# GET /contacts
app.get '/contacts', ensureAuthenticated, (req, res) ->
  res.render 'contacts.ejs', 
    user: req.user


#`
# Passport requests.
#

# GET /auth/google
app.get '/auth/google', passport.authenticate('google', 
  scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.google.com/m8/feeds']
  accessType: 'offline' )

# GET /auth/google/callback
app.get '/auth/google/callback', passport.authenticate('google', { 
    successRedirect: "/contacts",
    failureRedirect: "/loginerror"
  })


# GET /logout
app.get '/logout', (req, res) ->
  req.logout();
  res.redirect('/');

#
# Gtacts API requests.
#

# GET /api/users(/:id)
# just for demo purposes. probably wouldn't exist in production because security.
app.get '/api/users', (req, res) ->
  User.find (err, users) ->
    res.json(users)

app.get '/api/users/:id', (req, res) ->
  User.findById "user_#{req.params.id}", (err, user) ->
    res.json(user)

# GET /api/user/me
app.get '/api/me', ensureAuthenticated, (req, res) ->
  User.findById "user_#{req.user.profile_id}", (err, user) ->
    res.json(user)

# GET /api/contacts
app.get '/api/contacts', ensureAuthenticated, (req,res) ->
  refreshContacts req.user.accessToken, req.user.profile_id, (result) ->
    entries = JSON.parse(result).feed.entry;
    parsed_entries = [];

    for entry in entries
      id = ""
      name = ""
      email = []
      phone = []

      if entry.id? && entry.id['$t']?
        raw_id = entry.id['$t'];
        id = raw_id.match(/[^/]+$/);

      if entry.title? && entry.title['$t'] isnt ""
        name = entry.title['$t'];
      else
        if entry['gd$email']? && entry['gd$email'][0].address
          name = entry['gd$email'][0].address;
        else
          name = "<unnamed contact>";

      if entry['gd$email']?
        for addr in entry['gd$email']
          if addr.address? then email.push(addr.address)

      if entry['gd$phoneNumber']?
        for num in entry['gd$phoneNumber']
          if num['$t']? then phone.push(num['$t'])

      parsed_entries.push(
        "id": id,
        "name": name,
        "email": email,
        "phone": phone
      )

    res.json(parsed_entries);

# GET /api/photo/:id
app.get '/api/photo/:id', ensureAuthenticated, (req, res) ->
  getPhoto req.params.id, req.user.accessToken, req.user.profile_id, res


#
# External API Resources.
#

# get photos from the Google Contacts API (called by detail view of individual contact)
getPhoto = (contact_id, accessToken, user_id, res) ->
  req_authorization = "Bearer #{accessToken}"
  req_path = "/m8/feeds/photos/media/default/#{contact_id}"

  if not /^[a-zA-Z0-9_]*$/.test(contact_id)
    return callback("Invalid contact photo path.");

  options =
    host: 'www.google.com'
    port: 443
    path: req_path
    method: 'GET'
    headers:
      'GData-Version': '3.0'
      'Content-length': '0'
      'Authorization': req_authorization

  api_req = https.request options, (api_res) ->
    # placeholder image for contacts with no photo
    if api_req.res.statusCode is 404
      img = fs.readFileSync path.join(__dirname, 'public', 'images', 'person.png')
      res.writeHead 200
        'Content-Type': 'image/png'
      res.end img, 'binary'
      return

    res.setHeader "Content-Type", api_req.res.headers['content-type']

    # if we get an authentication error, refresh access token and try again
    api_res.on 'error', (e) ->
      return refreshToken user_id, ->
        getPhoto contact_id, accessToken, user_id, res

    api_res.on 'data', (chunk) ->
      res.write chunk, 'binary'

    api_res.on 'end', () ->
      res.end()

  api_req.end()

# refresh list of contacts and their information
refreshContacts = (accessToken, user_id, callback) ->
  req_authorization = "Bearer #{accessToken}"

  options =
    host: 'www.google.com'
    port: 443
    path: '/m8/feeds/contacts/default/full?max-results=75000&alt=json'
    method: 'GET'
    headers:
      'GData-Version': '3.0'
      'Content-length': '0'
      'Authorization': req_authorization

  api_req = https.request options, (api_res) ->
    buffer = ""

    # on authentication error, refresh access token and try again
    api_res.on 'error', (e) ->
      return refreshToken user_id, ->
        refreshContacts accessToken, user_id, callback

    api_res.on 'data', (chunk) ->
      buffer += chunk

    api_res.on 'end', () ->
      callback(buffer)

  api_req.end()

# Gets a new access_token (expires every hour) using our refresh token.
refreshToken = (user_id, callback) ->
  console.log "Refreshing access token for user #{user_id}..."

  User.findById "user_#{user_id}", (err, user) ->
    if err then console.error "Couldn't refresh access token because user isn't registered."

    previous_token = user.accessToken;
    refresh_token = user.refreshToken;

    post_data = qs.stringify(
      'client_id': conf.google.clientID
      'client_secret': conf.google.clientSecret
      'refresh_token': refresh_token
      'grant_type': 'refresh_token'
    )

    options =
      host: 'accounts.google.com'
      port: 443
      path: '/o/oauth2/token'
      method: 'POST'
      headers:
        'Content-Type': 'application/x-www-form-urlencoded'

    req = https.request options, (res) ->
      res.setEncoding 'utf8'
      
      console.log "Making request for new access token using refresh token: #{refresh_token}"
      res.on 'data', (data) ->
        data = JSON.parse data

        if data.access_token?
          console.log "New access token granted: #{data.access_token}"
          access_token = data.access_token
          
          if previous_token isnt access_token
            User.update({profile_id: user_id}, {$set: {accessToken: access_token}}, {upsert: true}, () ->
              console.log "Updated refresh token in database."
              callback()
            )
          else
            console.error "ERROR: Could not refresh access token."
    
    req.write post_data
    req.end()


#
# Server creation!
#

http.createServer(app).listen(app.get('port'), ->
  console.log "Express server listening on port #{app.get('port')}"
)
