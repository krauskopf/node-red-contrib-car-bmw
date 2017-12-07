/*
The MIT License (MIT)

Copyright (c) 2017 sebakrau

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

  var tokenmanager = require('./lib/tokenmanager.js');
  var bmwrequest = require('./lib/bmwrequest.js');


  /* ---------------------------------------------------------------------------
   * CONFIG node
   * -------------------------------------------------------------------------*/
  function CarBmwNodeConfig(config) {
    RED.nodes.createNode(this, config);

    // Configuration options passed by Node Red
    this.name = config.name;
    this.debug = config.debug;
    this.server = config.server;

    // Config node state
    this.closing = false;

    // Define functions called by nodes
    var node = this;

    // Define config node event listeners
    node.on("close", function(done){
      node.closing = true;
      done();
    });
  }
  RED.nodes.registerType("car-bmw", CarBmwNodeConfig, {
    credentials: {
         username: {type:"text"},
         password: {type:"password"}
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

    var node = this;
    if (this.configNode) {

  		// Input handler, called on incoming flow
      this.on('input', function(msg) {

        var config = {
          'username': node.configNode.credentials.username,
          'password': node.configNode.credentials.password
        }

        tokenmanager.initialize(config,
          function onSuccess(token, tokenType) {

            if (node.configNode.debug) {
              node.log("Token init completed: " + "\nToken: " + token + "\nTokenType: " + tokenType);
            }

            bmwrequest.call(node.configNode.server, '/api/me/vehicles/v2', '', token, tokenType, function(data) {
            	try	{
                var json = JSON.parse(data);

                if (node.as === "multi") {
                  var numVehicles = json.length;
                  for(var v = 0; v < numVehicles; ++v) {
                    var msgVehicle = RED.util.cloneMessage(msg)
                    msgVehicle.payload = json[v];
                    node.send(msgVehicle);
                  }
                }

                if (node.as === "single") {
                  msg.payload = json;
                  node.send(msg);
                }

          		}
          		catch(err) {
          			node.warn("Failed to parse data " + data + ", error " + err);
          		}
            }, function onError(err) {
              node.warn("Failed to read list of vehicles:" + err);
            });

          },
          function onError(err) {
            node.warn("Failed to read token:" + err);
          }
        );

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
    this.vin = config.vin;
    this.datatype = config.datatype;


    var node = this;
    if (this.configNode) {

  		// Input handler, called on incoming flow
      this.on('input', function(msg) {

        var config = {
          'username': node.configNode.credentials.username,
          'password': node.configNode.credentials.password
        }

        tokenmanager.initialize(config,
          function onSuccess(token, tokenType) {

            var vin = node.vin;
            if (msg.hasOwnProperty('vin')) { vin = node.vin || msg.vin; }
            var path = '/api/vehicle/' + node.datatype + '/v1/' + vin;

            if (node.configNode.debug) {
              node.log("Token init completed: " + "\nToken: " + token + "\nTokenType: " + tokenType);
              node.log("Path: " + path);
            }

            bmwrequest.call(node.configNode.server, path , '', token, tokenType, function(data) {
            	try	{
                var json = JSON.parse(data);
                msg.payload = json;
                msg.title = node.datatype;
                msg.vin = vin;
                node.send(msg);
          		}
          		catch(err) {
          			node.warn("Failed to parse data " + data + ", error " + err);
          		}
            }, function onError(err) {
              node.warn("Failed to get data of vehicle:" + err);
            });

          },
          function onError(err) {
            node.warn("Failed to read token:" + err);
          }
        );

      });

    } else {
      this.error(RED._("car-bmw.errors.missing-config"));
    }
  }
  RED.nodes.registerType("car-bmw-get", CarBmwNodeGet);

};
