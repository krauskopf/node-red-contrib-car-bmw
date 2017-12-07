[![npm version](https://badge.fury.io/js/node-red-contrib-car-bmw.svg)](https://badge.fury.io/js/node-red-contrib-car-bmw)
[![Build Status](https://travis-ci.org/krauskopf/node-red-contrib-car-bmw.svg?branch=master)](https://travis-ci.org/krauskopf/node-red-contrib-car-bmw)

[![NPM](https://nodei.co/npm/node-red-contrib-car-bmw.png?compact=true)](https://nodei.co/npm/node-red-contrib-car-bmw/)

# Node-RED nodes for BMW ConnectedDrive
This package contains nodes to easily connect to BMW ConnectedDrive and read out informations about your vehicles.

NOTE: These nodes are unofficial and do NOT COME from BMW AG. Be careful when using these.

Be careful not to send your login and password to anyone other than BMW or you are giving away the authentication details required to control your car.

Also ensure that you don't overwhelm the BMW servers with requests. Calling REST APIs at very high frequency can put substantial load on the servers and might get your IP blocked by BMW.

## Disclaimer
Use these nodes at your own risk. The authors do not guaranteed the proper functioning of these nodes.
This code attempts to use the same interfaces used by the official BMW ConnectedDrive web portal.
However, it is possible that use of this code may cause unexpected damage for which nobody but you are responsible.
Use of these functions can change the settings on your car and may have negative consequences such as (but not limited to)
reducing the available charge in the battery.

## Installation
Install using the managed palette from inside Node-RED.

## Usage
There are 2 new nodes which appear in the category 'BMW' in your Node-Red palette.

![nodes.png](./doc/nodes.png)

#### BMW List
Reads the list of cars, that are assigned to a BMW ConnectedDrive account.

#### BMW Get
Read different informations about your car.

### Additional Information
For these nodes to work you need a car with BMW ConnectedDrive support and remote services.

## History
- 2017-Dez-01: 0.1.0 - First prototype.

## Credits
This project is heavily influenced by the work of:
- Nils Schneider (https://github.com/Lyve1981/BMW-ConnectedDrive-JSON-Wrapper)
- Sergej Müller (https://github.com/sergejmueller/battery.ebiene.de)
- Terence Eden (https://github.com/edent/BMW-i-Remote)
- Sebastian Krauskopf (mail@sebakrau.de)

## Trademarks
- "BMW ConnectedDrive" is a registered trademark of BMW AG.

## License
The MIT License (MIT)

Copyright (c) 2017 sebakrau (mail@sebakrau.de)

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
