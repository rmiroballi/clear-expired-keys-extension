module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "/build/";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

	'use strict';

	var winston = __webpack_require__(1);
	var async = __webpack_require__(2);
	var moment = __webpack_require__(3);
	var useragent = __webpack_require__(4);
	var express = __webpack_require__(5);
	var Webtask = __webpack_require__(6);
	var app = express();
	var Request = __webpack_require__(7);
	var memoizer = __webpack_require__(8);
	var httpRequest = __webpack_require__(7);

	function clearExpiredKeys(req, res) {
	  var ctx = req.webtaskContext;
	  var required_settings = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET'];
	  var missing_settings = required_settings.filter(function (setting) {
	    return !ctx.data[setting];
	  });

	  if (missing_settings.length) {
	    return res.status(400).send({ message: 'Missing settings: ' + missing_settings.join(', ') });
	  }

	  // Start the process.
	  async.waterfall([function (callback) {
	    console.log('Get expired keys.');
	    getExpiredKeysFromAuth0(req.webtaskContext.data.AUTH0_DOMAIN, req.access_token, function (users, err) {
	      if (err) {
	        return callback({ error: err, message: 'Error getting user.app_metadata from Auth0' });
	      }
	      context = { users: users };
	      return callback(null, context);
	    });
	  }, function (context, callback) {
	    console.log('Remove Expired Keys');
	    if (context.users && context.users.length > 0) {
	      //Cap it to 100 users at a time.
	      var max = context.users.length > 100 ? 100 : context.users.length;

	      async.eachLimit(context.users, max, clearKeys(req.webtaskContext.data.AUTH0_DOMAIN, req.access_token, user, callback), function (err) {
	        if (err) {
	          console.log(err);
	        }
	      });
	    }
	    return callback(null, context);
	  }], function (err, context) {
	    if (err) {
	      console.log('Job failed.', err);
	      res.status(500).send(err);
	    }

	    console.log('Job complete.');
	    res.sendStatus(200);
	  });
	}

	function getExpiredKeysFromAuth0(domain, token, cb) {
	  var url = 'https://${domain}/api/v2/users';
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
	      Authorization: 'Bearer ' + token,
	      Accept: 'application/json'
	    }
	  }, function (err, res, body) {
	    if (err) {
	      cb(null, err);
	    } else {
	      cb(body);
	    }
	  });
	}

	function clearKeys(domain, token, user, cb) {
	  var url = 'https://${domain}/api/v2/users/' + user;

	  Request({
	    method: 'PATCH',
	    url: url,
	    json: true,
	    body: {
	      app_metadata: '{}'
	    },
	    headers: {
	      Authorization: 'Bearer ' + token,
	      Accept: 'application/json'
	    }
	  }, function (err, res, body) {
	    if (err) {
	      cb(err);
	    } else {
	      cb();
	    }
	  });
	};

	var getTokenCached = memoizer({
	  load: function load(apiUrl, audience, clientId, clientSecret, cb) {
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
	    }, function (err, res, body) {
	      if (err) {
	        cb(null, err);
	      } else {
	        cb(body.access_token);
	      }
	    });
	  },
	  hash: function hash(apiUrl) {
	    return apiUrl;
	  },
	  max: 100,
	  maxAge: 1000 * 60 * 60
	});

	app.use(function (req, res, next) {
	  var apiUrl = 'https://' + req.webtaskContext.data.AUTH0_DOMAIN + '/oauth/token';
	  var audience = 'https://' + req.webtaskContext.data.AUTH0_DOMAIN + '/api/v2/';
	  var clientId = req.webtaskContext.data.AUTH0_CLIENT_ID;
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

/***/ }),
/* 1 */
/***/ (function(module, exports) {

	module.exports = require("winston");

/***/ }),
/* 2 */
/***/ (function(module, exports) {

	module.exports = require("async");

/***/ }),
/* 3 */
/***/ (function(module, exports) {

	module.exports = require("moment");

/***/ }),
/* 4 */
/***/ (function(module, exports) {

	module.exports = require("useragent");

/***/ }),
/* 5 */
/***/ (function(module, exports) {

	module.exports = require("express");

/***/ }),
/* 6 */
/***/ (function(module, exports) {

	module.exports = require("webtask-tools");

/***/ }),
/* 7 */
/***/ (function(module, exports) {

	module.exports = require("request");

/***/ }),
/* 8 */
/***/ (function(module, exports) {

	module.exports = require("lru-memoizer");

/***/ })
/******/ ]);