const winston = require('winston');
const async = require('async');
const moment = require('moment');
const useragent = require('useragent');
const express = require('express');
const Webtask = require('webtask-tools');
const app = express();
const Request = require('request');
const memoizer = require('lru-memoizer');
const httpRequest = require('request');

function clearExpiredKeys (req, res) {
  let ctx = req.webtaskContext;
  let required_settings = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET'];
  let missing_settings = required_settings.filter((setting) => !ctx.data[setting]);

  if (missing_settings.length) {
    return res.status(400).send({ message: 'Missing settings: ' + missing_settings.join(', ') });
  }
  
  var context = {};
  
  // Start the process.
  async.waterfall([
    (callback) => {
      console.log('Get expired keys.');
      getExpiredKeysFromAuth0(req.webtaskContext.data.AUTH0_DOMAIN, req.access_token, (users, err) => {
          if(err) {
            return callback({ error: err, message: 'Error getting user.app_metadata from Auth0' });
          }
          context = {users: users};
          return callback(null,context);
        });
      
      },
    (context, callback) => {
        console.log('Remove Expired Keys');
        if(context.users && context.users.length > 0) {
          //Cap it to 100 users at a time.
          var max = context.users.length > 100 ? 100 : context.users.length;
          console.log('Removing ' + max);
          async.eachLimit(context.users, max, (user, cb) => {
            clearKeys(req.webtaskContext.data.AUTH0_DOMAIN, req.access_token, user.user_id, cb);
          }, function(user_id, err) {
            if(err) {
              console.log(err);
            }            
          });
          
        } else {
          console.log('Removing 0');
        }
        
        return callback(null, context);
      }
    ], 
    function (err, context) {
      if (err) {
        console.log('Job failed.', err);
          res.status(500).send(err);
      }

      console.log('Job complete.');
      res.sendStatus(200);
  });
  
}

function getExpiredKeysFromAuth0 (domain, token, cb) {
  var url = 'https://'+domain+'/api/v2/users';
  var now = Date.now(); 

  Request({
    method: 'GET',
    url: url,
    json: true,
    qs: {
      fields: 'user_id',
      include_fields: true,
      q: 'app_metadata.reset_timeout: [1 TO ' + now + ']',
      search_engine: 'v2'
    },
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  },
  (err, res, body) => {
    if (err) {
      cb(null, err);
    } else {
      cb(body);
    }
  });
}

function clearKeys (domain, token, user_id, cb) {
  var url = 'https://'+domain+'/api/v2/users/'+user_id;

  Request({
    method: 'PATCH',
    url: url,
    json: true,
    body: {
      app_metadata: {}
    },
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  },
  (err, res, body) => {
    if (err) {
      cb(err);
    } else {
      cb();
    }
  });
};



const getTokenCached = memoizer({
  load: (apiUrl, audience, clientId, clientSecret, cb) => {
    Request({
      method: 'POST',
      url: apiUrl,
      json: true,
      body: {
        audience: audience,
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }
    }, (err, res, body) => {
      if (err) {
        cb(null, err);
      } else {
        cb(body.access_token);
      }
    });
  },
  hash: (apiUrl) => apiUrl,
  max: 100,
  maxAge: 1000 * 60 * 60
});

app.use(function (req, res, next) {
  var apiUrl       = `https://${req.webtaskContext.data.AUTH0_DOMAIN}/oauth/token`;
  var audience     = `https://${req.webtaskContext.data.AUTH0_DOMAIN}/api/v2/`;
  var clientId     = req.webtaskContext.data.AUTH0_CLIENT_ID;
  var clientSecret = req.webtaskContext.data.AUTH0_CLIENT_SECRET;

  getTokenCached(apiUrl, audience, clientId, clientSecret, function (access_token, err) {
    if (err) {
      console.log('Error getting access_token', err);
      return next(err);
    }

    req.access_token = access_token;
    next();
  });
});

app.get('/', clearExpiredKeys);
app.post('/', clearExpiredKeys);

module.exports = Webtask.fromExpress(app);
