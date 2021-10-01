
/*
The MIT License (MIT)

Copyright (c) 2017-2021 sebakrau

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
'use strict'


const https = require('https');
const querystring = require('querystring');
const debug = require('debug')('bmw');


const STATE_LOGGED_OUT = 0;
const STATE_LOGGED_IN = 1;
const STATE_AUTHENTICATING = 2;


class Bmw {

  /* ---------------------------------------------------------------------------
   * Constants
   * -------------------------------------------------------------------------*/

  // legacy services
  static GET_DYNAMIC = 'dynamic';
  static GET_SPECS = 'specs';
  static GET_NAVIGATION = 'navigation';
  static GET_EFFICIENCY = 'efficiency';
  static GET_SERVICE = 'service';
  static GET_SERVICE_PARTNER = 'servicepartner';

  // new services
  static GET_CHARGING_PROFILE = 'chargingprofile';
  static GET_STATISTICS_ALL_TRIPS = 'statistics/allTrips';
  static GET_STATISTICS_LAST_TRIP = 'statistics/lastTrip';
  static GET_STATUS = 'status';
  static GET_DESTINATIONS = 'destinations';

  // remote services
  static SERVICE_FLASH_HEADLIGHTS = 'RLF';
  static SERVICE_HORN = 'RHB';
  static SERVICE_DOOR_LOCK = 'RDL';
  static SERVICE_DOOR_UNLOCK = 'RDU';
  static SERVICE_CLIMATE = 'RCN';

  // different servers for different regions
  static REGION_REST_OF_WORLD = 0;
  static REGION_USA = 1;
  static REGION_CHINA = 2;


  /* ---------------------------------------------------------------------------
   * Constructor
   * -------------------------------------------------------------------------*/
  constructor(username, password, region = Bmw.REGION_REST_OF_WORLD) {
    debug(`constructor(...)`);

    this._username = username;
    this._password = password;
    this._region = region;
    this._tokenType = undefined;
    this._token = undefined;
    this._expireTimestamp = undefined;
    this._state = STATE_LOGGED_OUT;
  }


  /* ---------------------------------------------------------------------------
   * Private Methods
   * -------------------------------------------------------------------------*/

  static _getApiServer(region) {
    switch (region) {
      case Bmw.REGION_REST_OF_WORLD:  return 'b2vapi.bmwgroup.com';
      case Bmw.REGION_USA:            return 'b2vapi.bmwgroup.us';
      case Bmw.REGION_CHINA:          return 'b2vapi.bmwgroup.cn:8592';
      default:                        return 'www.bmw-connecteddrive.com'; // FIXME: works from germany. Not sure if generic redirect...
    }
  }

  static _getAuthServer(region) {
    switch (region) {
      case Bmw.REGION_REST_OF_WORLD:  return 'customer.bmwgroup.com';
      case Bmw.REGION_USA:            return 'login.bmwusa.com';
      case Bmw.REGION_CHINA:          return 'customer.bmwgroup.cn';
    }
  }

  static _getApiActionServer(region) {
    switch (region) {
      case Bmw.REGION_REST_OF_WORLD:  return 'cocoapi.bmwgroup.com';
      case Bmw.REGION_USA:            return 'cocoapi.bmwgroup.us';
      case Bmw.REGION_CHINA:          return '';
    }
  }

  /**
   * Code to request an authentication token.
   *
   * @static
   * @param {string} hostname - The BMW server address providing the API. There are different servers for different regions.
   * @param {string} username - The username to authenticate against. Id of the connected-drive account.
   * @param {string} password - The password of the username.
   * @param {function} callback(err, data) - Returns the token data.
   * @memberof Bmw
   */
  static _authenticate(hostname, username, password, callback)
  {
    // Credit goes to https://github.com/sergejmueller/battery.ebiene.de and https://github.com/bimmerconnected/bimmer_connected/pull/140
    let postData = querystring.stringify({
      'username': username,
      'password': password,
      'client_id': 'dbf0a542-ebd1-4ff0-a9a7-55172fbfce35',
      'redirect_uri': 'https://www.bmw-connecteddrive.com/app/default/static/external-dispatch.html',
      'response_type': 'token',
      'scope': 'authenticate_user fupo remote_services vehicle_data',
      'state': 'eyJtYXJrZXQiOiJkZSIsImxhbmd1YWdlIjoiZGUiLCJkZXN0aW5hdGlvbiI6ImxhbmRpbmdQYWdlIn0',
      'locale': 'DE-de'
    });

    // Request a token using the given credentials
    let options = {
      hostname: hostname,
      port: '443',
      path: '/gcdm/oauth/authenticate',   // FIXME: could be universal endpoint for USA, CHINA and rest of the world. Not yet tested.
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
    };

    // Make the request
    const req = https.request(options, (res) => {
      let data = '';

      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        data += chunk;
      });

      res.on('end', function() {

        let location = res.headers.location;

        if (location === 'undefined') {
          callback(new Error('unexpected response, location header not defined'));
        } else {
          let values = querystring.parse(location);
          callback(null, values);
        }
      });
    });

    req.on('error', (err) => {
      callback(err);
    });

    req.write(postData);
    req.end();
  }

  /**
   * Query data from the connected drive service.
   *
   * @param {string} hostname - The BMW server address providing the API. (e.g. 'www.bmw-connecteddrive.com')
   * @param {string} path - The API endpoint.
   * @param {string} token - An access token.
   * @param {string} tokenType - The type of the token. Usually "Bearer".
   * @param {function} callback(err, data) - Returns error or requested data.
   * @memberof Bmw
   */
  static _request(hostname, path, token, tokenType, callback)
  {
    let options = {
      hostname: hostname,
      port: '443',
      path: path,
      method: 'GET',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenType + " " + token
        }
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode > 299) {
          callback(new Error(`Server http statusCode ${res.statusCode}`));
          return;
        }

        callback(null, data);
      });
    });

    req.on('error', (err) => {
      callback(err);
    });

    req.end();
  };




  /* ---------------------------------------------------------------------------
   * Public Methods
   * -------------------------------------------------------------------------*/


  /**
   * Utility function to check format of a Vehicle Identification Number (VIN)
   *
   * @static
   * @param {string} vin - The vin to check.
   * @memberof Bmw
   */
  static isValidVin(vin)
  {
    var letterNumber = /^[0-9A-HJ-NPR-Z]+$/;
    if(letterNumber.test(vin)) {
      return true;
    }
    else {
      return false;
    }
  }

  /**
   * Code to request an authentication token and extract the token.
   *
   * @returns {Promise.<Object, Error>} A promise that returns error resolves on successfull authentication.
   * @memberof Bmw
   */
  async requestNewToken()
  {
    return new Promise( (resolve, reject) => {

      debug(`requestNewToken()`);

      this._state = STATE_AUTHENTICATING;

      Bmw._authenticate(Bmw._getAuthServer(this._region), this._username, this._password, (err, data) => {

        // Error: Transmission
        if (err) {
          this._tokenType = undefined;
          this._token = undefined;
          this._expireTimestamp = undefined;
          this._state = STATE_LOGGED_OUT;

          debug('requestNewToken() ERROR communication');
          reject(err);
          return;
        }

        // Error: Content not as expected
        if(typeof(data.token_type) === 'undefined' || typeof(data.access_token) === 'undefined' || typeof(data.expires_in) === 'undefined') {
          this._tokenType = undefined;
          this._token = undefined;
          this._expireTimestamp = undefined;
          this._state = STATE_LOGGED_OUT;

          debug('requestNewToken() ERROR response');
          reject(new Error("Couldn't find token in response"));
          return;
        }

        // Success
        let tokenExpiresInSeconds = data.expires_in - 120;
        this._expireTimestamp = new Date().valueOf() + tokenExpiresInSeconds * 1000;
        this._tokenType = data.token_type;
        this._token = data.access_token;
        this._state = STATE_LOGGED_IN;

        debug(`requestNewToken() DONE, token will expire in ${tokenExpiresInSeconds} seconds at ${new Date(this._expireTimestamp).toLocaleString()} local time `);
        resolve(null);
      });
    });
  }


  /**
   * Generic request function to get data from the service.
   *
   * The method will renew the token upon expiration or if none has been aquired yet.
   *
   * @param {string} hostname - The BMW server address providing the API.
   * @param {string} path - The API endpoint.
   * @returns {Promise.<Object, Error>} A promise that returns an object with the requested data.
   * @memberof Bmw
   */
  async get(hostname, path) {

    debug(`get(${hostname}, ${path})`);

    return new Promise( (resolve, reject) => {

      switch (this._state) {

        case STATE_LOGGED_OUT:
          debug(`get() INFO not yet authenticated`);

          this.requestNewToken().then(() => { return this.get(hostname, path); })
            .then((result) => { resolve(result); })
            .catch((err)   => { reject(err); });
          break;


        case STATE_AUTHENTICATING:
          debug(`get() INFO authentication already in progress`);

          setTimeout(() => {
            this.get(hostname, path)
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });
            }, 1000);
          break;


        case STATE_LOGGED_IN:

          // Check if token expired
          if (Date.now() > this._expireTimestamp) {
            debug(`get() INFO token expired`);

            this.requestNewToken().then(() => { return this.get(hostname, path); })
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });

            return;
          }

          // Make the request
          Bmw._request(hostname, path, this._token, this._tokenType, (err, data) => {

            if (err) {
              reject(err);
            } else {
              if (data === 'undefined' || data === '') {
                debug(`get() ERROR empty data received`);
                reject(new Error("Empty data received"));
              }

              try {
                let json = JSON.parse(data);
                debug(`get() DONE`);
                resolve(json);
              } catch (err) {
                debug(`get() ERROR invalid data received`);
                reject(new Error("Invalid data received: " + err));
              }
            }

          });
          break;


        default:
          debug(`get() ERROR unknown state`);
          reject(new Error("unknown state"));
          break;
      }

    });
  }

  /**
   * Get a list of all registered vehicles.
   *
   * @returns {Promise.<Object, Error>} A promise that returns an object with the requested data.
   * @memberof Bmw
   */
  async getCarList() {
    return this.get(Bmw._getApiServer(this._region), '/api/me/vehicles/v2');
  }

 /**
   * Get information about a vehicle vehicles.
   *
   * @param {string} vin - The vehicle identification number.
   * @param {string} service - Which kind of data to read.
   * @returns {Promise.<Object, Error>} A promise that returns an object with the requested data.
   * @memberof Bmw
   */
  async getCarInfo(vin, service) {

    switch (service) {
      // 'legacy' services
      case Bmw.GET_DYNAMIC:
      case Bmw.GET_SPECS:
      case Bmw.GET_NAVIGATION:
      case Bmw.GET_EFFICIENCY:
      case Bmw.GET_SERVICE:
      case Bmw.GET_SERVICE_PARTNER:
      default:
        return this.get(Bmw._getApiServer(this._region), `/api/vehicle/${service}/v1/${vin}`);

      // 'new' services
      case Bmw.GET_CHARGING_PROFILE:
      case Bmw.GET_STATISTICS_ALL_TRIPS:
      case Bmw.GET_STATISTICS_LAST_TRIP:
      case Bmw.GET_STATUS:
      case Bmw.GET_DESTINATIONS:
        return this.get(Bmw._getApiServer(this._region), `/webapi/v1/user/vehicles/${vin}/${service}`);
    }

  }


}


module.exports = Bmw;
