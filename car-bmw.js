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

module.exports = function(RED) {
  'use strict';
  const Bmw = require('./lib/bmw.js');
  const { pbkdf2Sync } = require('crypto');



  /* ---------------------------------------------------------------------------
   * CONFIG node
   * -------------------------------------------------------------------------*/
  function CarBmwNodeConfig(config) {
    RED.nodes.createNode(this, config);

    // Configuration options passed by Node Red
    this.name = config.name;
    this.debug = config.debug;
    this.region = config.region;
    this.unit = config.unit;
    if (this.credentials) {
      this.username = this.credentials.username;
      this.password = this.credentials.password;
      this.captcha = this.credentials.captcha;
    }

    // Config node state
    this.closing = false;
    this.bmw = new Bmw(this.username, this.password, this.captcha, this.region, this.unit);

    // Note: Requires a persistent context store for the global context
    this.bmw.setTokenStoreProvider(callback => {
      if (!this.storeKey) {
        this.storeKey = pbkdf2Sync(this.password, this.username, 100000, 16, 'sha256').toString('hex');
      }

      const ctx = this.context().global;
      ctx.get('bmw_oauth', (err, oauth) => {
        if (err) {
          this.error(err, msg);
        } else {
          oauth = oauth || (oauth = {});
          let store = oauth[this.storeKey] || (oauth[this.storeKey] = {});
          callback(store);
          ctx.set('bmw_oauth', oauth);
        }
      });
    });

    // Define functions called by nodes
    let node = this;

    // Define config node event listeners
    node.on("close", function(removed, done){
      node.closing = true;
      done();
    });
  }
  RED.nodes.registerType("car-bmw", CarBmwNodeConfig, {
    credentials: {
      username: {type: "text"},
      password: {type: "password"},
      captcha: {type: "password"},
    }
  });





  /* ---------------------------------------------------------------------------
   * LIST node
   * -------------------------------------------------------------------------*/
  function CarBmwNodeList(config) {
    RED.nodes.createNode(this, config);

    // Save settings in local node
    this.account = config.account;
    this.configNode = RED.nodes.getNode(this.account);
    this.name = config.name;
    this.as = config.as || "single";

    let node = this;
    if (this.configNode) {

  		// Input handler, called on incoming flow
      this.on('input', function(msg, send, done) {

        node.configNode.bmw.getCarList()
          .then((carList) => {

            // For maximum backwards compatibility, check that send exists.
            // If this node is installed in Node-RED 0.x, it will need to
            // fallback to using `node.send`
            send = send || function() { node.send.apply(node, arguments) }

            if (node.as === "multi") {
              let numVehicles = carList.length;
              for(let v = 0; v < numVehicles; ++v) {
                let msgVehicle = RED.util.cloneMessage(msg)
                msgVehicle.payload = carList[v];
                send(msgVehicle);
              }
            }

            if (node.as === "single") {
              msg.payload = carList;
              send(msg);
            }

            // Once finished, call 'done'.
            // This call is wrapped in a check that 'done' exists
            // so the node will work in earlier versions of Node-RED (<1.0)
            if (done) {
              done();
            }

          })
          .catch((err) => {
            if (done) {
              done(err); // Node-RED 1.0 compatible
            } else {
              node.error(err, msg); // Node-RED 0.x compatible
            }
          });

      });

      // Closing, get's called when new flow is deployed
      node.on("close", function(removed, done){
        done();
      });

    } else {
      this.error(RED._("car-bmw.errors.missing-config"));
    }
  }
  RED.nodes.registerType("car-bmw-list", CarBmwNodeList);





  /* ---------------------------------------------------------------------------
   * GET node
   * -------------------------------------------------------------------------*/
  function CarBmwNodeGet(config) {
    RED.nodes.createNode(this, config);

    // Save settings in local node
    this.account = config.account;
    this.configNode = RED.nodes.getNode(this.account);
    this.name = config.name;
    this.datatype = config.datatype;


    let node = this;
    if (this.configNode) {

  		// Input handler, called on incoming flow
      this.on('input', function(msg, send, done) {

        let vin = node.credentials.vin;
        if (msg.hasOwnProperty('vin')) {
          vin = node.credentials.vin || msg.vin;
        }
        if (!Bmw.isValidVin(vin)) {
          node.error('The VIN you have entered contains invalid characters. Please check.');
          return;
        }

        node.configNode.bmw.getCarInfo(vin, node.datatype)
          .then((data) => {

            // For maximum backwards compatibility, check that send exists.
            // If this node is installed in Node-RED 0.x, it will need to
            // fallback to using `node.send`
            send = send || function() { node.send.apply(node, arguments) }

            msg.payload = data;
            msg.title = node.datatype;
            msg.vin = vin;

            send(msg);

            // Once finished, call 'done'.
            // This call is wrapped in a check that 'done' exists
            // so the node will work in earlier versions of Node-RED (<1.0)
            if (done) {
              done();
            }
          })
          .catch((err) => {
            if (done) {
              done(err); // Node-RED 1.0 compatible
            } else {
              node.error(err, msg); // Node-RED 0.x compatible
            }
          });

      });

      // Closing, get's called when new flow is deployed
      node.on("close", function(removed, done){
        done();
      });


    } else {
      this.error(RED._("car-bmw.errors.missing-config"));
    }
  }
  RED.nodes.registerType("car-bmw-get", CarBmwNodeGet, {
    credentials: {
      vin: {type: "text"}
      }
  });



  /* ---------------------------------------------------------------------------
   * ACTION node
   * -------------------------------------------------------------------------*/
  function CarBmwNodeAction(config) {
    RED.nodes.createNode(this, config);

    // Save settings in local node
    this.account = config.account;
    this.configNode = RED.nodes.getNode(this.account);
    this.name = config.name;
    this.action = config.action;


    let node = this;
    if (this.configNode) {

  		// Input handler, called on incoming flow
      this.on('input', function(msg, send, done) {

        let vin = node.credentials.vin;
        let payload;
        if (msg.hasOwnProperty('vin')) {
          vin = node.credentials.vin || msg.vin;
        }
        if (msg.hasOwnProperty('payload')) {
          payload = msg.payload;
        }
        if (!Bmw.isValidVin(vin)) {
          node.error('The VIN you have entered contains invalid characters. Please check.');
          return;
        }

        node.configNode.bmw.executeRemoteService(vin, node.action, payload)
          .then((data) => {


            // TODO: Implement blocking until remote service has finished here




            // For maximum backwards compatibility, check that send exists.
            // If this node is installed in Node-RED 0.x, it will need to
            // fallback to using `node.send`
            send = send || function() { node.send.apply(node, arguments) }

            msg.payload = data;
            msg.vin = vin;

            send(msg);

            // Once finished, call 'done'.
            // This call is wrapped in a check that 'done' exists
            // so the node will work in earlier versions of Node-RED (<1.0)
            if (done) {
              done();
            }
          })
          .catch((err) => {
            if (done) {
              done(err); // Node-RED 1.0 compatible
            } else {
              node.error(err, msg); // Node-RED 0.x compatible
            }
          });

      });

      // Closing, get's called when new flow is deployed
      node.on("close", function(removed, done){
        done();
      });

    } else {
      this.error(RED._("car-bmw.errors.missing-config"));
    }
  }
  RED.nodes.registerType("car-bmw-action", CarBmwNodeAction, {
    credentials: {
      vin: {type: "text"}
    }
  });

};
