// server.js
// where your node app starts

// create a user model
var User = {
  oauthID: '',
  auth: '',
  name: '',
  created: ''
};

var FbPassport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;

FbPassport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: 'https://'+process.env.PROJECT_DOMAIN+'.glitch.me/auth/facebook/callback',
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(accessToken);
    console.log(profile);
    return cb(null, profile);
  }
));

var SlackPassport = require('passport');
var SlackStrategy = require('passport-slack-oauth2').Strategy;

SlackPassport.use(new SlackStrategy({
    clientID: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_SECRET,
    skipUserProfile: false, // default
    //state: 'aabbCCddeeFF',
    callbackURL: 'https://'+process.env.PROJECT_DOMAIN+'.glitch.me/auth/slack/callback',
    scope: ['reactions:write','reactions:read','groups:history','groups:read','incoming-webhook'] 
  },
  (accessToken, refreshToken, profile, done) => {
    // optionally persist user data into a database
    
    done(null, profile);
    
    var jwt = require('jwt-simple');
    var encoded = jwt.encode(accessToken, process.env.SECRET);
  
    User = {  oauthID: profile.id,
              auth: encoded,
              name: profile.displayName,
              created: Date.now() }
    console.log(profile);
  }
));

SlackPassport.serializeUser(function(user, done) {
  console.log(user);
  done(null, user);
});
SlackPassport.deserializeUser(function(obj, done) {
  done(null, obj);
});

// init project
var express = require('express');
var app = express();
var expressSession = require('express-session');

// cookies are used to save authentication
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');

// http://expressjs.com/en/starter/static-files.html
app.use(bodyParser.urlencoded({extended: true}));
app.use(cookieParser());
app.use(express.static('public'));
app.use(expressSession({ secret:'observingboats', resave: true, saveUninitialized: true, maxAge: (90 * 24 * 3600000) }));
app.use(SlackPassport.initialize());
app.use(SlackPassport.session());

// index route
// http://expressjs.com/en/starter/basic-routing.html

/*
app.get('/', function(req, res) {
  logUserPageView(req, res, 'open maintenance.html');
  res.sendFile(__dirname + '/views/maintenance.html');
});
*/

app.get('/', function(req, res) {
  logUserPageView(req, res, 'open /')
  if (req.cookies.ezspassport) {
    res.redirect('/start');
  } else {
    logUserPageView(req, res, 'open index.html');
    res.sendFile(__dirname + '/views/index.html');
  }
});


// routing to Fans Analysis Assistant
app.get('/analytics', function(req, res) {
  logUserPageView(req, res, 'open /analytics');
  if (validLogin(req, res)) {
    logUserPageView(req, res, 'open analytics.html');
    res.sendFile(__dirname + '/views/analytics.html');
  };
});

app.get('/auth/facebook', FbPassport.authenticate('facebook'));

app.get('/auth/facebook/callback', 
  FbPassport.authenticate('facebook', { failureRedirect: '/fail', session: false }),
    (req, res) => res.redirect('/') 
);

app.get('/auth/slack', SlackPassport.authorize('Slack'));

app.get('/auth/slack/callback', 
  SlackPassport.authenticate(
    'Slack', { failureRedirect: '/fail', session: false }),
        (req, res) => {
            console.log('slack callback');
            console.log(req.query);
            if (isValidMember(req.user.team.id)) {
              if (req.query.state){
                 res.redirect('/auth/slack');
              } else {
                 res.redirect('/setcookie') ;
              };
            }
            else {
              res.redirect('/logoff');
            }
        }
);

app.get('/changelog', function(req, res) {
  res.sendFile(__dirname + '/views/changelog.html');
  logUserPageView(req, res, 'open changelog.html');
});

app.get('/checkgroups', function(req, res) {
  logUserPageView(req, res, 'access /checkgroups');
  send_readable_groups(req, res, 'send'); 
});

app.get('/exec', function(req, res) {
  fetchFbPosts(req, res); 
});

app.get('/fail', function(req, res) {
  res.sendFile(__dirname + '/views/fail.html');
  logUserPageView(req, res, 'open fail.html');
});

// routing to GET Fans Analysis API
app.get('/getAnalytics', function(req, res) {
  asyncFetchHistory(req, res); 
});

app.get('/how-to-use', function(req, res) {
  res.sendFile(__dirname + '/views/how-to-use.html');
  logUserPageView(req, res, 'open how-to-use.html');
});

// on clicking "logoff" the cookie is cleared
app.get('/logoff', function(req, res) {
    logUserPageView(req, res, 'Logoff');  
    res.clearCookie('ezsfbmaster-passport');
    res.clearCookie('ezspassport');
    res.redirect('/');
  }
);

/* Cookie Handling Functions*/

// on successful auth, a cookie is set before redirecting
// to the success view
app.get('/setcookie', function(req, res) {
    console.log(printUserInfo(req, res) +  ' set Cookie');
      var OneYear = new Date(new Date().getTime() + (1000*60*60*24*365)); // ~1y
      res.cookie('ezsfbmaster-passport', new Date());
      res.cookie('ezspassport', User, { expires: OneYear });
      res.redirect('/start');
      logUserPageView(req, res, 'sucessfully set cookie');
  }
);

// routing to 
app.get('/updatebase', function(req, res) {
  logUserPageView(req, res, 'set Member Database');
  setMemberDB(req, res);
});

/* Start of Facebook Click Assistant page */
app.get('/start', function(req, res) {
  logUserPageView(req, res, 'open /start');
  if (validLogin(req, res)) {
    logUserPageView(req, res, 'open main.html');
    res.sendFile(__dirname + '/views/main.html');
  };
});

/* Start of Facebook Click Assistant page */
app.get('/trends', function(req, res) {
  logUserPageView(req, res, 'open /start');
  if (validLogin(req, res)) {
    logUserPageView(req, res, 'open main.html');
    res.sendFile(__dirname + '/views/trends.html');
  };
});


/* functions related to login and Authorization */

function logUserPageView(req, res, msg){
  console.log(printUserInfo(req, res) + ' ' + msg);
};


function isValidMember(teamId){
  return ( teamId == process.env.DEFAULT_SLACK_TEAM_ID); 
}

async function validLogin(req, res) {
  const web = createSlackWeb(req, res, '000');
  if (web) {
    try{
      const result = await web.auth.test();
      if (result.ok) return true;
    }
    catch (err) {
      console.warn(err);
      return false;
    }
  };
};

/* Cookie Handling Functions*/
function getTokenFromCookie(req, res) {
  if (req.cookies.ezspassport) {
    var jwt = require('jwt-simple');
    var decoded = jwt.decode(req.cookies.ezspassport.auth, process.env.SECRET); 
    if (decoded.startsWith("xoxp-")) {
      return {ok: true, value: decoded};
    } else {
      console.warn('Wrong OAuth Data');
      res.redirect('/logoff');
      return {ok: false, error: 'Wrong OAuth Data' };
    }
  } else {
    console.warn('No OAuth Data');
    res.redirect('/');
    return {ok: false, error: 'No OAuth Data'} ;
  };
};

function getUserIdFromCookie(req, res) {
  return req.cookies.ezspassport.oauthID;
};

function getUserNameFromCookie(req, res) {
  return req.cookies.ezspassport.name;
};

function printUserInfo(req,res) {
  var id = 'Anonymous';
  var name = ' user';
  if (req.cookies.ezspassport) { 
    id = getUserIdFromCookie(req, res);
    name = getUserNameFromCookie(req, res);
  }
  return id + ' ( ' + name + ' )';
};

/* End of Cookie Handling Functions*/

function createSlackWeb(req, res, errId){
  var token = getTokenFromCookie(req, res);
  if (token.ok) {
    const { WebClient } = require('@slack/client');    
    const web = new WebClient(token.value);
    return web;
  } else {
    var err = "Error(" + errId + "): " + token.error;
    console.warn(err);
    return null;
  }
};

function checkArg(req, res, key, err_id){
  if (req.query[key]) {
    return req.query[key];
  } else {
    var err = "Error(" + err_id + "): 無法讀取參數";
    res.send({ success: false, error: err});
    console.warn(err);
    console.warn(req.query);
    return null;
  };
};

function get_channel_ids() {
   return (process.env.SLACK_CHANNEL_IDs).split(',');
};

function send_readable_groups(req, res) {    
  const web = createSlackWeb(req, res, '160');
  const channels = get_channel_ids();
  
  var groups = [];
    channels.forEach(function (ch){
        groups.push(web.groups.info({channel: ch})
          .then((result) => {
               if (result.ok) return { id: ch, name: result.group.name};
            })
          .catch ((err) => { return null;}));
    });
    
    Promise.all(groups).then( (v) => {
        res.send({ success: true, channels: v.filter(w => w)});
    });
};

async function fetchFbPosts(req, res) {    
  const count = checkArg(req, res, 'read_limit','110');
  const channel_id = checkArg(req, res, 'group','115');
  const channel_name = checkArg(req, res, 'groupname','116');
  if (count && channel_id && channel_name) {
    var obj = [];
    try {
      const web = createSlackWeb(req, res, '111');
      const userId = getUserIdFromCookie(req, res);
      const result = await web.groups.history({channel: channel_id, count: count});
      if (result.ok) {
        for (var i = 0 ; i < result.messages.length; i++) {
          const message = result.messages[i];
          if (message.hasOwnProperty('attachments')){          
            const url = message.attachments[0].original_url;
            if (url) {
              obj.push({ind: i, url: url, ts: message.ts, 
                        isliked: isLikedbyUser(message, userId),
                        skin_tone: getSkinTone(message)
                       });
            }
          };
        };
        logUserPageView(req, res, 'proceeded ' + i + ' messages.');
        res.send({ success: true, channel: { id: channel_id, name: channel_name }, read_limit: count, obj: obj});
      } else {
        throw new Error('(112) Failed to fetch history of messages and events from a private channel.');
      };
    } catch(err) {
      res.send({ success: false , error: err});
      console.warn(err)
    }
  }
};

// check if the post has aleary marked on Slack by a specifiy user
function isLikedbyUser(message, userId) {
  var isliked = false;
  if (message.hasOwnProperty('reactions')){                   
    for (var j in message.reactions) {
      var likedusers = message.reactions[j].users;
      isliked = likedusers.includes(userId);
      if (isliked) { break; }
    };
  };
  return isliked;
};

function getSkinTone(message){
    var flag = false;
  if (message.hasOwnProperty('reactions')){                   
    for (var j in message.reactions) {
      flag = (message.reactions[j].name == '+1');
      if (flag) { break; }
    };
  };
  return flag;
}

// POST method called by Mark Like buttons
app.post('/update_reactions', function(req, res) {
  onMarkReaction(req, res); 
});

// OnClickEvent - Mark Liked on Slack
async function onMarkReaction(req, res) {    
  console.log(req.body)
  const ts = req.body.ts;
  const name = req.body.name;
  const channel = req.body.channel.id;//process.env.DEFAULT_SLACK_CHANNEL_ID;  
  const web = createSlackWeb(req, res, '121');
  
  if(ts && name && channel) {
    try {
      const result = await web.reactions.add({channel: channel, timestamp: ts, name : name });
      if (result.ok) {
        res.send({ success: true, status: result.acceptedScopes});
      }      
    } catch(err) {
            console.log(err);
        if (err.data.hasOwnProperty('error') && err.data.error === "already_reacted"){
          console.log(err.data.error);
          res.send({ success: true });
        } else {
          res.send({ success: false });
        };
    }
  } else {
    var err = 'Error(120): 無法讀取參數。';
    res.send(err);
    console.warn(err); 
    return { ok: false , error: err};
  }  
};
/* End of Facebook Click Assistant page */

/* START FAN ANALYSIS ASISTANT PAGE */

// init sqlite db
var fs = require('fs');
var dbFile = './.data/sqlite.db';
var dbExist = fs.existsSync(dbFile);
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database(dbFile);

var sqlite = require('sqlite-sync');
sqlite.connect(dbFile); 


function checkTableExists(tb) {
  if (dbExist) {
    console.log('checking table');
    var hasTable = sqlite.run("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '" + tb + "'" );
    if (Object.values(hasTable[0]) > 0) {
      console.log('Table exists.');
      return true;
    };
  }
  return false;
};

async function createTableIfNotExist(tb) {
  if (dbExist && !checkTableExists(tb)) {
    await db.serialize(function(){
      db.run('CREATE TABLE ' + tb + ' (uid TEXT unique, name TEXT, avatar TEXT);');
      console.log('New table ' + tb + ' created!');
    });
   };     
};


function write2db(uid, name, avatar) {    
  if (dbExist) {
    try {
      db.serialize(function() {
            db.run('INSERT OR REPLACE INTO Members (uid, name, avatar) VALUES ("' 
                   + uid + '", "' + name + '", "'
                   + avatar +'" );');
      });
      console.log('uid: ' + uid + ' , name: ' + name + ' , avatar: ' + avatar);
      return true;
    }
    catch (err) {
      return false;
    }
  };
};

function onlyUnique(value, index, self) { 
    return self.indexOf(value) === index;
};

async function writeMembers2db(members) {
  var token = process.env.SLACK_TOKEN;
  const { WebClient } = require('@slack/client');    
  const web = new WebClient(token);

  // convert to array if variable member is a string
  if (typeof(members) == 'string') {
    members = [members];
  }
  var uids = members.filter(onlyUnique);
  var results = [];
  console.log('Try to add/update ' + uids.length + ' members to database.');
  for (var i in uids){
    const uid = uids[i];
    const uInfo = await web.users.info({user: uid}); 
    if (!uInfo.ok) {
       console.warn('Error(130) Failed to get information about a user.')
    };
    await results.push({ id: uid, success: write2db(uid, uInfo.user.real_name, uInfo.user.profile.image_32)});
    console.log('Proceeding: ' + uids[i] + ' (' + results.length + '/' + uids.length + ')')
  };
  console.log('Database "Members" ready to go!');
  return { ok: true, log: results };
};

async function renewAllMemebrs2db() {
  var token = process.env.SLACK_TOKEN;
  const { WebClient } = require('@slack/client');    
  const web = new WebClient(token);
  
  var channels = get_channel_ids();
  console.log('Preparing to set Database...');
  var members = [];
  for (var i in channels) {
    const gInfo = await web.groups.info({channel: channels[i]});
    if (gInfo.ok) {
      console.log('Successful got group member list #' + i);
      members = await members.concat(gInfo.group.members);
    } else {
      console.log('Error:(133) Failed to get information about a private channel.')
      return null;
    };
  };
  return await writeMembers2db(members)
};

// fetch members' data and store to database
async function setMemberDB(req, res) {  
  var member = checkArg(req, res, 'member', '131');
  await createTableIfNotExist('Members');
  if (member.length == 9) {
    var results = await writeMembers2db(member);
  } else if (member.toLowerCase() == 'all') {
    var results = await renewAllMemebrs2db();
  }
  report_db_update(req, res, results);
};

function report_db_update(req, res, obj){
  console.log(obj)
  if (obj.ok) {
    res.send('Successfully Updated Member Database!');
    return { ok: true };
  } else {
    res.send('Failed to Updated Some Members to Database!');
    return { ok: false };
  };  
};

// get the avatar of a specific user from database
function getNameAvatar(uid) {
   return sqlite.run('SELECT name name, avatar avatar FROM Members WHERE uid = ?', [uid]); 
}

// get all members's data from database
function getAllMbDataFromDb() {
  var data = sqlite.run('SELECT * FROM Members');
  var mbdata = [];
  for (var d in data) {
    var datum = data[d];
    mbdata[datum.uid] = {name: datum.name, avatar: datum.avatar} ;
  }
  return mbdata;
};


// Fans Analysis functoin
async function asyncFetchHistory(req, res) {    
  const nDays = checkArg(req, res, 'num_of_days', '140');
  
  const channel = checkArg(req, res, 'group', '141');  
  
  // get the required time period
  var timePeriod = getTimePeriod(nDays);
  
  // cache members' data from database
  var mbdata = await getAllMbDataFromDb();
  
  var activeUsers = [];
  var has_more = true;
  
  const web = createSlackWeb(req, res, '142');
  try {
  // while if any remaining history
  // while(has_more && nDays && web) {    
      const result = await web.groups.history({
                                channel: channel, 
                                count: 1000, 
                                latest: timePeriod.last, 
                                oldest: JsDate2SlackTs(timePeriod.past)
                              });
      if (result.ok) {
        console.log('Start Fetch History: '+ timePeriod.last);
        var messages = result.messages;
        
        // for each slack messages in the history  
        for (var i = 0 ; i < messages.length; i++) {
          var message = messages[i];  
          // Chech if this message attached a facebook post
          if (message.hasOwnProperty('attachments')){          
            if (message.attachments[0].original_url && message.attachments[0].original_url.includes('.facebook.com')){
              const uid = message.user;
              if (activeUsers.hasOwnProperty(uid)) {
                // increment post counter if uid in activeUsers
                activeUsers[uid].num_of_posts++;
              } else {
                // initizate a dataset and add to activeUsers,
                //  if uid is not in the list 
                if (!mbdata[uid]) throw new Error("Error(143): Missing " + uid);
                activeUsers[uid] = { avatar: mbdata[uid].avatar, 
                                 name: mbdata[uid].name, num_of_posts: 1, 
                                 num_of_reacts: 0, adjacency: {}};
              };              
              // Find and count who liked is slack message
              if (message.hasOwnProperty('reactions')){                   
                var likers = [];
                // list out unique users reacted to this message
                message.reactions.forEach( 
                  (j) => j.users.forEach( (k) => likers[k] = k )
                ); // End for each reaction lists    
                // for each of unique likers found
                
                for (var m in likers) {
                   var liker = likers[m];
                   if (activeUsers[uid].adjacency[liker]) {
                     activeUsers[uid].adjacency[liker].reaction_count++;
                   } else {
                   // if this liker has not registered in the adjacency list of current user,
                   // create a new record to the adjacency list; else, increase the corresponding counter.
                     if (!mbdata[liker]) throw new Error("Error(144): Missing " + liker);
                     activeUsers[uid].adjacency[liker] = {
                                     avatar: mbdata[liker].avatar,
                                     name: mbdata[liker].name,
                                     reaction_count: 1};
                   };
                   // Add a new user if the liker is not in the list of users;
                   // else, increase the reacted count of the liker
                   if (activeUsers[liker]){
                     activeUsers[liker].num_of_reacts++;
                   } else {
                     activeUsers[liker] = {avatar: mbdata[liker].avatar, 
                            name: mbdata[liker].name, num_of_posts: 0, 
                                     num_of_reacts: 1, adjacency: {}};
                   };                  
                };   // End for each likers           
              }; // End if reactions exist
            }; // End if this message attached a facebook post
          }; // End if this message has any attachements
        }; // End for each slack messages in the history
        
        // check if there are more slack messages within the required time period
        if (result.has_more) {
          timePeriod.last = messages[messages.length-1].ts;
        } else {
          has_more = false;
        }
      }; // End if fetched results
    //  }; // End while if any remaining history
  } catch(err) {
    res.send({ success: false , error: err});
    console.warn(err);
    renewAllMemebrs2db();
    return false;
  }
  
  res.send({success: true, users: Object.values(activeUsers)});
  return true;
};

// Convert Javascript datatime to Unix timestamp
function JsDate2SlackTs(d) {
   return d/1000;
};
// Convert Unix timestamp to Javascript datatime
function SlackTs2JsDate(ts) {
   return ts*1000;
}

function getTimePeriod(nDays) {
  var tsLast = new Date().getTime();
  var tsFirst = new Date(tsLast-86400000*nDays);
    tsFirst.setHours(0);
    tsFirst.setMinutes(0);
    tsFirst.setSeconds(0);
    tsFirst.setMilliseconds(0);
  return { past: tsFirst, last: tsLast };
};

/* END OF FAN ANALYSIS ASISTANT PAGE */

// listen for requests :)
var listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});