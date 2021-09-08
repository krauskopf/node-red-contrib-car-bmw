
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

  constructor(hostname, username, password) {
    debug(`constructor(${hostname}, ...)`);

    this._hostname = hostname;
    this._username = username;
    this._password = password;
    this._tokenType = undefined;
    this._token = undefined;
    this._expireTimestamp = undefined;
    this._state = STATE_LOGGED_OUT;
  }


  /* ---------------------------------------------------------------------------
   * Constants
   * -------------------------------------------------------------------------*/

  static GET_DYNAMIC = 'dynamic';
  static GET_SPECS = 'specs';
  static GET_NAVIGATION = 'navigation';
  static GET_EFFICIENCY = 'efficiency';
  static GET_CHARGING_PROFILE = 'remoteservices/chargingprofile';
  static GET_SERVICE = 'service';
  static GET_SERVICE_PARTNER = 'servicepartner';



  /* ---------------------------------------------------------------------------
   * Private Methods
   * -------------------------------------------------------------------------*/

  /**
   * Code to request an authentication token.
   *
   * @static
   * @param {string} username - The username to authenticate against. Id of the connected-drive account.
   * @param {string} password - The password of the username.
   * @param {function} callback(err, data) - Returns the token data.
   * @memberof Bmw
   */
  static _authenticate(username, password, callback)
  {
    // Credit goes to https://github.com/sergejmueller/battery.ebiene.de
    let postData = querystring.stringify({
      'username': username,
      'password': password,
      'client_id': 'dbf0a542-ebd1-4ff0-a9a7-55172fbfce35',
      'redirect_uri': 'https://www.bmw-connecteddrive.com/app/default/static/external-dispatch.html',
      'response_type': 'token',
      'scope': 'authenticate_user fupo',
      'state': 'eyJtYXJrZXQiOiJkZSIsImxhbmd1YWdlIjoiZGUiLCJkZXN0aW5hdGlvbiI6ImxhbmRpbmdQYWdlIn0',
      'locale': 'DE-de'
    });

    // Request a token using the given credentials
    let options = {
      hostname: 'customer.bmwgroup.com',
      port: '443',
      path: '/gcdm/oauth/authenticate',
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
   * @param {function} callback(err, data) - Returns error or requested data.
   * @memberof Bmw
   */
  static _request(host, path, token, tokenType, callback)
  {
    let options = {
      hostname: host,
      port: '443',
      path: path,
      method: 'GET',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
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
      callbackError(err);
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

      Bmw._authenticate(this._username, this._password, (err, data) => {

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

        debug(`requestNewToken() DONE, token will expire in ${tokenExpiresInSeconds} seconds at ${this._expireTimestamp.toLocaleString()} local time `);
        resolve(null);
      });
    });
  }


  /**
   * Generic request function to get data from the service.
   *
   * The method will renew the token upon expiration or if none has been aquired yet.
   *
   * @returns {Promise.<Object, Error>} A promise that returns an object with the requested data.
   * @memberof Bmw
   */
  async get(path) {

    debug(`get(${path})`);

    return new Promise( (resolve, reject) => {

      switch (this._state) {

        case STATE_LOGGED_OUT:
          debug(`get() INFO not yet authenticated`);

          this.requestNewToken().then(() => { return this.get(path); })
            .then((result) => { resolve(result); })
            .catch((err)   => { reject(err); });
          break;


        case STATE_AUTHENTICATING:
          debug(`get() INFO authentication already in progress`);

          setTimeout(() => {
            this.get(path)
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });
            }, 1000);
          break;


        case STATE_LOGGED_IN:

          // Check if token expired
          if (Date.now() > this._expireTimestamp) {
            debug(`get() INFO token expired`);

            this.requestNewToken().then(() => { return this.get(path); })
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });

            return;
          }

          // Make the request
          Bmw._request(this._hostname, path, this._token, this._tokenType, (err, data) => {

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
    return this.get("/api/me/vehicles/v2");
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
    return this.get('/api/vehicle/' + service + '/v1/' + vin);
  }

}


module.exports = Bmw;
