
/*
The MIT License (MIT)

Copyright (c) 2017-2022 sebakrau

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


const { randomUUID, createHash } = require('crypto');
const { URLSearchParams } = require('url');
const https = require('https');
const debug = require('debug')('bmw');
const fetch = require('node-fetch');


const STATE_LOGGED_OUT = 0;
const STATE_LOGGED_IN = 1;
const STATE_AUTHENTICATING = 2;


class Bmw {

  /* ---------------------------------------------------------------------------
   * Constants
   * -------------------------------------------------------------------------*/

  // v1 services (discontinued)
  static GET_DYNAMIC = 'dynamic';
  static GET_SPECS = 'specs';
  static GET_NAVIGATION = 'navigation';
  static GET_EFFICIENCY = 'efficiency';
  static GET_SERVICE = 'service';
  static GET_SERVICE_PARTNER = 'servicepartner';
  static GET_STATISTICS_ALL_TRIPS = 'statistics/allTrips';
  static GET_STATISTICS_LAST_TRIP = 'statistics/lastTrip';
  static GET_STATUS = 'status';
  static GET_DESTINATIONS = 'destinations';

  // v2 services
  static GET_CHARGING_STATISTICS = 'charging-statistics';
  static GET_CHARGING_SESSIONS = 'charging-sessions';
  static GET_CHARGING_PROFILE = 'chargingprofile';

  // v4 services
  static GET_STATE = 'state';

  // remote services
  static SERVICE_FLASH_HEADLIGHTS = 'RLF';
  static SERVICE_HORN = 'RHB';
  static SERVICE_DOOR_LOCK = 'RDL';
  static SERVICE_DOOR_UNLOCK = 'RDU';
  static SERVICE_CLIMATE_START = 'RCN';
  static SERVICE_CLIMATE_STOP = 'RCNSTOP';
  static SERVICE_VEHICLE_FINDER = 'RVF';
  static SERVICE_CHARGE_NOW = 'CHARGE_NOW';
  static SERVICE_CHANGE_CHARGING_MODE = 'CHANGE_CHARGING_MODE';
  static SERVICE_CHANGE_CHARGING_SETTINGS = 'CHANGE_CHARGING_SETTINGS';
  static SERVICE_CHARGE_START = 'CHARGE_START';
  static SERVICE_CHARGE_STOP = 'CHARGE_STOP';

  // different servers for different regions
  static REGION_REST_OF_WORLD = "0";
  static REGION_USA = "1";
  static REGION_CHINA = "2";

  // units
  static UNIT_METRIC = "metric";
  static UNIT_IMPERIAL = "imperial";


  /* ---------------------------------------------------------------------------
   * Constructor
   * -------------------------------------------------------------------------*/
  constructor(username, password, region = Bmw.REGION_REST_OF_WORLD, unit = Bmw.UNIT_METRIC) {
    debug(`constructor(...)`);

    this._username = username;
    this._password = password;
    if(typeof region == "number"){
      this._region = region.toString(); //compatibility to versions <= 0.4.4
    }else{
      this._region = region;
    }
    this._unit = unit;
    this._tokenType = undefined;
    this._token = undefined;
    this._expireTimestamp = undefined;
    this._state = STATE_LOGGED_OUT;
  }


  /* ---------------------------------------------------------------------------
   * Private Methods
   * -------------------------------------------------------------------------*/

  static _getUnitFormat(unit){
    switch (unit){
      case Bmw.UNIT_IMPERIAL: return "d=MI;v=G";
      default:                return "d=KM;v=L;p=B;ec=KWH100KM;fc=L100KM;em=GKM;";
    }
  }

  static _getApiServerLegacy(region) {
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

  static _getApiServerNew(region) {
    switch (region) {
      case Bmw.REGION_REST_OF_WORLD:  return 'cocoapi.bmwgroup.com';
      case Bmw.REGION_USA:            return 'cocoapi.bmwgroup.us';
      case Bmw.REGION_CHINA:          return 'myprofile.bmw.com.cn';
    }
  }

  static _getAPIKeys(region) {
    switch (region) {
      case Bmw.REGION_USA: return 'MzFlMTAyZjUtNmY3ZS03ZWYzLTkwNDQtZGRjZTYzODkxMzYy';
      default:             return 'NGYxYzg1YTMtNzU4Zi1hMzdkLWJiYjYtZjg3MDQ0OTRhY2Zh';
    }
  }

  /**
   * Helper function which generates a random string.
   *
   * @static
   * @param {number} length - The number of symbols to generate.
   * @returns {string} A generated random string.
   * @memberof Bmw
   */
  static _randomString(length = 25) {
    const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~';
    const charactersLength = characters.length;

    let randomString = '';
    for (let i = 0; i < length; i++) {
        randomString += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return randomString;
  }

  /**
   * Helper method to parse JSON or tagged JSON ('tag1={...} tag2={...}') from V4 endpoints
   * @param {string} data JSON or tagged JSON data
   * @returns parsed JSON
   */
  static _parseTaggedJson(data) {
    const tags = {};
    const appendTag = (tag, index, endIndex) => {
      if (tag) {
        tags[tag] = JSON.parse(data.substring(index, endIndex));
      }
      return endIndex + 1;
    }

    let index = 0, match, tag, tagR = /([a-z]{1,32})\s*=\s*\{/gi;
    while (match = tagR.exec(data)) {
      const endIndex = match.index - 1;
      const tagExpressionLength = match[0].length - 1;
      index = appendTag(tag, index, endIndex) + tagExpressionLength;
      tag = match[1];
    }
    appendTag(tag || '__json', index, data.length);

    return tags['__json'] || tags;
  }

  /**
   * Returns the correlation ID headers.
   * @returns {Object} header object
   */
  static _correlationIdHeader() {
    let id = randomUUID();
    return {
      'X-Identity-Provider': 'gcdm',
      'X-Correlation-Id': id,
      'Bmw-Correlation-Id': id,
    };
  }

  /**
   * Returns the user agent headers for all request types.
   * @returns {Object} header object
   */
  static _userAgentHeader() {
    const androidVersion = 'android(TQ2A.230405.003.B2)';
    const agentVersion = '3.11.1(29513)';
    const ua = 'Dart/3.0 (dart:io)';
    return {
      'User-Agent': ua,
      'X-User-Agent': `${androidVersion};bmw;${agentVersion}`,
    };
  }

  /**
   * Create S256 code_challenge with the given code_verifier.
   * @param {string} code_verifier 
   * @returns {Object} the S256 challenge url data object
   */
  static _codeChallengeParams(code_verifier) {
    return {
      'code_challenge': createHash('sha256').update(code_verifier).digest('base64url'),
      'code_challenge_method': 'S256',
    };
  }

  /**
   * Creates URLSearchParams from one or more objects.
   * @param  {...any} objects param objects
   * @returns {URLSearchParams} of the merged objects list
   */
  static _params(...objects) {
    return new URLSearchParams(Object.assign({}, ...objects));
  }

  /**
   * Code to request an authentication token.
   * Thanks to https://github.com/bluewalk
   * https://github.com/bluewalk/BMWConnecteDrive/blob/master/ConnectedDrive.php
   *
   * @static
   * @param {string} region - The auth region
   * @param {string} username - The username to authenticate against. Id of the connected-drive account.
   * @param {string} password - The password of the username.
   * @returns {Promise.<Object, Error>} A promise that returns error resolves on successfull authentication.
   * @memberof Bmw
   */
   static async _authenticate(region, username, password) {
    //
    // State 0 - Get the oauth config
    //
    let result0 = await fetch(`https://${Bmw._getApiServerNew(region)}/eadrax-ucs/v1/presentation/oauth/config`, {
      headers: Object.assign({
        'ocp-apim-subscription-key': Buffer.from(Bmw._getAPIKeys(region), 'base64').toString('ascii'),
        'bmw-session-id': randomUUID(),
      }, Bmw._correlationIdHeader(), Bmw._userAgentHeader()),
    });
    
    if (result0.status != 200) {
      throw new Error(`Server sent http statusCode ${result0.status} on stage 0`);
    }

    const config = await result0.json();
    if (!config.tokenEndpoint) {
      debug(JSON.stringify(config))
      throw new Error(`Missing tokenEndpoint on stage 0`);
    }


    //
    // Parameters for stages 1-3
    //
    const headers = Object.assign({'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}, Bmw._userAgentHeader());
    const token_url = config.tokenEndpoint;
    const authenticate_url = token_url.replace("/token", "/authenticate");

    const code_challenge = Bmw._randomString(86);
    const oauth_params = Object.assign({
      'client_id': config.clientId,
      'response_type': 'code',
      'scope': config.scopes.join(' '),
      'redirect_uri': config.returnUrl,
      'state': Bmw._randomString(22),
      'nonce': Bmw._randomString(22),
    }, Bmw._codeChallengeParams(code_challenge));


    //
    // Stage 1 - Request authorization code
    //
    let result1 = await fetch(authenticate_url, {
      method: "POST",
      body: Bmw._params({
        'username': username,
        'password': password,
        'grant_type': 'authorization_code'
      }, oauth_params),
      headers: headers,
    });

    if (result1.status < 200 || result1.status > 299) {
      throw new Error(`Server send http statusCode ${result1.status} on stage 1`);
    }

    // Extract 'authorization' code from response body
    const data1 = await result1.json();
    if (!data1.redirect_to) {
      throw new Error(`Missing redirect_to on stage 1`);
    }

    const authorization = new URLSearchParams(data1.redirect_to).get('authorization');
    if (!authorization) {
      throw new Error(`Missing authorization token on stage 1`);
    }


    //
    // Stage 2 - No idea, it's required to get the code
    //
    let result2 = await fetch(authenticate_url, {
      method: 'POST',
      body: Bmw._params({'authorization': authorization}, oauth_params),
      headers: Object.assign({'Cookie': `GCDMSSO=${authorization}`}, headers),
      redirect: 'manual',
    });

    if (result2.status != 302) {
      throw new Error(`Server send http statusCode ${result2.status} on stage 2`);
    }

    // Extract 'code' from response header
    const location = result2.headers.get('location');
    if (!location) {
      throw new Error(`Missing location on stage 2`);
    }

    const code = new URLSearchParams(location).get('com.bmw.connected://oauth?code');
    if (!code) {
      throw new Error(`Missing code on stage 2`);
    }


    //
    // Stage 3 - Get Token
    //
    let result3 = await fetch(token_url, {
        method: 'POST',
        body: Bmw._params({
            'code': code,
            'code_verifier': code_challenge,
            'redirect_uri': config.returnUrl,
            'grant_type': 'authorization_code'
        }),
        headers: Object.assign({
            'Authorization': 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
        }, headers),
    });

    if (result1.status < 200 || result1.status > 299) {
        throw new Error(`Server send http statusCode ${result1.status} on stage 3`);
    }
    let data3 = await result3.json();

    return data3;
  }


  /**
   * Query data from the connected drive service.
   *
   * @param {string} hostname - The BMW server address providing the API. (e.g. 'www.bmw-connecteddrive.com')
   * @param {string|Array} path - The API endpoint as '/path' or {path: '/path', method: 'POST'}
   * @param {string} token - An access token.
   * @param {string} tokenType - The type of the token. Usually "Bearer".
   * @param {string} unit - The BMW unit.
   * @param {string} vin - The vehicle identification number.
   * @param {function} callback(err, data) - Returns error or requested data.
   * @memberof Bmw
   */
  static _request(hostname, path, headers, token, tokenType, callback)
  {
    path = {
      method: path.method || 'GET',
      path: path.path || path,
    };

    const options = Object.assign({
      hostname: hostname,
      port: '443',
      headers: Object.assign({
          'Authorization': tokenType + " " + token,
          'Accept': 'application/json',
          'Accept-Language': 'en',
          'X-Raw-Locale': 'en_US',
          '24-hour-format': 'true',
        }, Bmw._userAgentHeader(), Bmw._correlationIdHeader())
    }, path);

    if (headers) {
      Object.assign(options.headers, headers);
    }

    if (vin) {
      options.headers['bmw-vin'] = vin;
    }

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

  /**
   * Execute a remote service on the car.
   *
   * @param {string} hostname - The BMW server address providing the API. (e.g. 'www.bmw-connecteddrive.com')
   * @param {string} path - The API endpoint.
   * @param {string} token - An access token.
   * @param {string} tokenType - The type of the token. Usually "Bearer".
   * @param {object} queryParameters - The data to send as query parameter (optional).
   * @param {object} payloadBody - The payload to send in the request body in JSON format (optional).
   * @param {function} callback(err, data) - Returns error or requested data (optional).
   * @memberof Bmw
   */
  static _execute(hostname, path, token, tokenType, queryParameters, payloadBody, callback)
  {
    let query = queryParameters != null ? `?${Bmw._params(queryParameters)}` : '';
    // when no payload body is provided then query parameters are sent also in the payload (backward compatibility)
    let payload = payloadBody != null ? payloadBody : (queryParameters || null);
    let options = {
      hostname: hostname,
      port: '443',
      path: path + query,
      method: 'POST',
      headers: Object.assign({
        'Authorization': tokenType + " " + token,
        'Accept': 'application/json',
        'Accept-Language': 'en',
        'X-Raw-Locale': 'en_US',
        '24-hour-format': 'true',
      }, Bmw._userAgentHeader(), Bmw._correlationIdHeader())
    };

    let postData;
    if (payload) {
      postData = JSON.stringify(payload);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = "";

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode > 299) {
          callback(new Error(`Server http statusCode ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        callback(null, data);
      });
    });

    req.on('error', (err) => {
      callback(err);
    });

    if (postData) {
      req.write(postData);
    }

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

      Bmw._authenticate(this._region, this._username, this._password).then((data) => {

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

      }).catch((err) => {

        // Error: Transmission
        this._tokenType = undefined;
        this._token = undefined;
        this._expireTimestamp = undefined;
        this._state = STATE_LOGGED_OUT;

        debug('requestNewToken() ERROR communication');
        reject(err);
        return;
      });

    });
  }


  /**
   * Generic request function to get data from the service.
   *
   * The method will renew the token upon expiration or if none has been aquired yet.
   *
   * @param {string} vin - The vehicle identification number.
   * @param {string} hostname - The BMW server address providing the API. (e.g. 'www.bmw-connecteddrive.com')
   * @param {string} path - The API endpoint.
   * @returns {Promise.<Object, Error>} A promise that returns an object with the requested data.
   * @memberof Bmw
   */
  async get(vin, hostname, path) {

    debug(`get(${vin}, ${hostname}, ${path})`);

    return new Promise( (resolve, reject) => {

      switch (this._state) {

        case STATE_LOGGED_OUT:
          debug(`get() INFO not yet authenticated`);

          this.requestNewToken().then(() => { return this.get(vin, hostname, path); })
            .then((result) => { resolve(result); })
            .catch((err)   => { reject(err); });
          break;


        case STATE_AUTHENTICATING:
          debug(`get() INFO authentication already in progress`);

          setTimeout(() => {
            this.get(vin, hostname, path)
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });
            }, 1000);
          break;


        case STATE_LOGGED_IN:

          // Check if token expired
          if (Date.now() > this._expireTimestamp) {
            debug(`get() INFO token expired`);

            this.requestNewToken().then(() => { return this.get(vin, hostname, path); })
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });

            return;
          }

          // Make the request
          let headers = {};
          if (vin) {
            headers['bmw-vin'] = vin;
            headers['bmw-current-date'] = new Date().toISOString();
          }
          if (this._unit) {
            headers['bmw-units-preferences'] = Bmw._getUnitFormat(this._unit);
          }

          Bmw._request(hostname, path, headers, this._token, this._tokenType, (err, data) => {

            if (err) {
              reject(err);
            } else {
              if (typeof data === 'undefined' || data === '') {
                debug(`get() ERROR empty data received`);
                reject(new Error("Empty data received"));
              }

              try {
                let json = Bmw._parseTaggedJson(data);
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
   * Generic execute function to trigger a remote service on the car.
   *
   * The method will renew the token upon expiration or if none has been aquired yet.
   *
   * @param {string} vin - The vehicle identification number.
   * @param {string} service - The service endpoint.
   * @param {string} action - Some service endpoints have additional action parameter.
   * @param {string} payload - Some service endpoints have an additional action payload (JSON format).
   * @returns {Promise.<Object, Error>} A promise that returns an object with the response data from the server. E.g. an eventId that can be used to query the status of execution.
   * @memberof Bmw
   */
  async execute(vin, service, action = undefined, payload = undefined) {

    debug(`execute(${vin}, ${service}, ${action}, ${payload})`);

    return new Promise( (resolve, reject) => {

      switch (this._state) {

        case STATE_LOGGED_OUT:
          debug(`execute() INFO not yet authenticated`);

          this.requestNewToken().then(() => { return this.execute(vin, service, action, payload); })
            .then((result) => { resolve(result); })
            .catch((err)   => { reject(err); });
          break;


        case STATE_AUTHENTICATING:
          debug(`execute() INFO authentication already in progress`);

          setTimeout(() => {
            this.execute(vin, service, action, payload)
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });
            }, 1000);
          break;


        case STATE_LOGGED_IN:

          // Check if token expired
          if (Date.now() > this._expireTimestamp) {
            debug(`execute() INFO token expired`);

            this.requestNewToken().then(() => { return this.execute(vin, service, action, payload); })
              .then((result) => { resolve(result); })
              .catch((err)   => { reject(err); });

            return;
          }

          // Make the request
          let path, params;

          switch (service) {
            case 'charging-profile':
            case 'charging-settings':
              path = `/eadrax-crccs/v1/vehicles/${vin}/${service}`;
              break;
            default:
              path = `/eadrax-vrccs/v3/presentation/remote-commands/${vin}/${service}`;
              break;
          }

          params = action != null ? {"action": action } : null;

          Bmw._execute(Bmw._getApiServerNew(this._region), path, this._token, this._tokenType, params, payload, (err, data) => {

            if (err) {
              reject(err);
            } else {
              if (typeof data === 'undefined' || data === '') {
                debug(`execute() ERROR empty data received`);
                reject(new Error("Empty data received"));
              }

              try {
                let json = JSON.parse(data);
                debug(`execute() DONE`);
                resolve(json);
              } catch (err) {
                debug(`execute() ERROR invalid data received`);
                reject(new Error("Invalid data received: " + err));
              }
            }

          });
          break;


        default:
          debug(`execute() ERROR unknown state`);
          reject(new Error("unknown state"));
          break;
      }
    });
  }

  /**
   * Returns the default URL params for V4 and V5 services.
   * @returns {URLSearchParams}
   */
  static _defaultGetParams(...others) {
    let now = new Date();
    return Bmw._params({
      'apptimezone': now.getTimezoneOffset() * -1,
      'appDateTime': now.getTime(),
    }, ...others);
  }

  /**
   * Retrieve the status of a remote service execution.
   *
   * The method will renew the token upon expiration or if none has been aquired yet.
   *
   * @param {string} eventId - The eventId that was returned by the server after the service was executed.
   * @returns {Promise.<Object, Error>} A promise that returns an object with the response status.
   * @memberof Bmw
   */
  async queryEventStatus(eventId) {
    let params = Bmw._params({'eventId': eventId});
    let path = `/eadrax-vrccs/v3/presentation/remote-commands/eventStatus?${params}`;

    // TODO
  }

  /**
   * Get a list of all registered vehicles.
   *
   * @returns {Promise.<Object, Error>} A promise that returns an object with the requested data.
   * @memberof Bmw
   */
  async getCarList() {
    return this
      .get(undefined, Bmw._getApiServerNew(this._region), {
        method: 'POST', 
        path: `/eadrax-vcs/v5/vehicle-list?${Bmw._defaultGetParams()}`
      })
      .then(carList => carList.mappingInfos);
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
    let params;

    switch (service) {

      // new services ('my BMW')
      case Bmw.GET_CHARGING_STATISTICS:
        params = Bmw._params({
          'vin': vin, 
          'currentDate': new Date().toISOString()
        });
        return this.get(undefined, Bmw._getApiServerNew(this._region), `/eadrax-chs/v1/charging-statistics?${params}`);

      case Bmw.GET_CHARGING_SESSIONS:
        params = Bmw._params({
          'vin': vin, 
          'maxResults': 40, 
          'include_date_picker': true
        });
        return this.get(undefined, Bmw._getApiServerNew(this._region), `/eadrax-chs/v1/charging-sessions?${params}`);

      case Bmw.GET_CHARGING_PROFILE:
        params = Bmw._params({
          'fields': 'charging-profile', 
          'has_charging_settings_capabilities': true // should match capabilities from GET_STATE
        });
        return this.get(vin, Bmw._getApiServerNew(this._region), `/eadrax-crccs/v2/vehicles?${params}`);

      // v4 service
      case Bmw.GET_STATE:
        params = Bmw._defaultGetParams({'tireGuardMode': 'ENABLED'});
        return this.get(vin, Bmw._getApiServerNew(this._region), `/eadrax-vcs/v4/vehicles/state?${params}`);

      // 'discontinued' services
      case Bmw.GET_STATISTICS_ALL_TRIPS:
      case Bmw.GET_STATISTICS_LAST_TRIP:
      case Bmw.GET_STATUS:
      case Bmw.GET_DESTINATIONS:
      case Bmw.GET_DYNAMIC:
      case Bmw.GET_SPECS:
      case Bmw.GET_NAVIGATION:
      case Bmw.GET_EFFICIENCY:
      case Bmw.GET_SERVICE:
      case Bmw.GET_SERVICE_PARTNER:
      case Bmw.GET_STATISTICS_ALL_TRIPS:
      case Bmw.GET_STATISTICS_LAST_TRIP:
      case Bmw.GET_STATUS:
      case Bmw.GET_DESTINATIONS:
      default:
        return Promise.reject("Service no longer supported");

      // new services ('my BMW')
      case Bmw.GET_CHARGING_STATISTICS:
        let params1 = `vin=${vin}&currentDate=${encodeURIComponent(new Date().toISOString())}`;
        return this.get(Bmw._getApiServerNew(this._region), '/eadrax-chs/v1/charging-statistics?' + params1);
      case Bmw.GET_CHARGING_SESSIONS:
        let params2 = `vin=${vin}&maxResults=40&include_date_picker=true`;
        return this.get(Bmw._getApiServerNew(this._region), '/eadrax-chs/v1/charging-sessions?' + params2);
      case Bmw.GET_CHARGING_PROFILE:
        return this.get(Bmw._getApiServerNew(this._region), '/eadrax-crccs/v2/vehicles?fields=charging-profile&has_charging_settings_capabilities=True', vin);
    }
  }

  /**
   * Execute a remote service on the given car.
   *
   * @param {string} vin - The vehicle identification number.
   * @param {string} service - Which kind of remote service to execute.
   * @param {string} payload - The payload in JSON format sent to the service (optional).
   * @returns {Promise.<Object, Error>} A promise that returns an object with an eventId, that can be used to query the status of the service.
   * @memberof Bmw
   */
  async executeRemoteService(vin, service, payload) {

    switch (service) {
      case Bmw.SERVICE_FLASH_HEADLIGHTS:
        return this.execute(vin, 'light-flash');
      case Bmw.SERVICE_HORN:
        return this.execute(vin, 'horn-blow');
      case Bmw.SERVICE_DOOR_LOCK:
        return this.execute(vin, 'door-lock');
      case Bmw.SERVICE_DOOR_UNLOCK:
        return this.execute(vin, 'door-unlock');
      case Bmw.SERVICE_CLIMATE_START:
        return this.execute(vin, 'climate-now', 'START');
      case Bmw.SERVICE_CLIMATE_STOP:
        return this.execute(vin, 'climate-now', 'STOP');
      case Bmw.SERVICE_VEHICLE_FINDER:
        return this.execute(vin, 'vehicle-finder');
      case Bmw.SERVICE_CHANGE_CHARGING_MODE:
        return this.execute(vin, 'charging-profile', null, payload);
      case Bmw.SERVICE_CHANGE_CHARGING_SETTINGS:
        return this.execute(vin, 'charging-settings', null, payload);
      case Bmw.SERVICE_CHARGE_START:
        return this.execute(vin, 'start-charging');
      case Bmw.SERVICE_CHARGE_STOP:
        return this.execute(vin, 'stop-charging');

      // 'discontinued' services
      case Bmw.SERVICE_CHARGE_NOW:
        return Promise.reject("Service no longer supported");
      case Bmw.SERVICE_CHANGE_CHARGING_MODE:
        return this.execute(vin, 'charging-profile', null, payload);
      default:
        return Promise.reject("Invalid argument");
    }
  }

}


module.exports = Bmw;
