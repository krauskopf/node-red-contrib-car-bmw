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
'use strict';


const Bmw = require('../lib/bmw');


//
// Credentials
//

function getUsername() {
  return process.env.TEST_USERNAME;
}
function getPassword() {
  return process.env.TEST_PASSWORD;
}
function getCaptchaToken() {
  return process.env.TEST_CAPTCHA;
}
function getVin() {
  return process.env.TEST_VIN;
}



//
// Globals
//
let bmw = new Bmw(getUsername(), getPassword(), getCaptchaToken());


//
// Test functions for development
//
async function testAuthentication() {

  try {
    await bmw.updateOrRequestToken();
    console.log("Successfully authenticated");
    await bmw.updateOrRequestToken();
    console.log("Successfully refreshed token");
  } catch (err) {
    console.error('Housten we are in trouble: ' + err);
  }

}


async function testReadAll() {

  try {
    await bmw.updateOrRequestToken();
    console.log("Successfully authenticated");

    // Print the list of registered cars
    let carList = await bmw.getCarList();
    console.log(JSON.stringify(carList));

    // Print the different car infos
    var list = [
      Bmw.GET_STATE,
      Bmw.GET_CHARGING_PROFILE,
      //Bmw.GET_CHARGING_STATISTICS,
      //Bmw.GET_CHARGING_SESSIONS,
    ];

    for (let key in list) {
      console.log(`--- ${list[key]} ---`);
      try {
        let data = await bmw.getCarInfo(getVin(), list[key]);
        console.log(JSON.stringify(data));
      } catch (error) {
        console.log('FAILED', error);
      }
    }

  } catch (err) {
    console.error('Housten we are in trouble: ' + err);
  }

}


async function testCarList() {

  try {
    await bmw.updateOrRequestToken();
    console.log("Successfully authenticated");

    let data = await bmw.getCarList();
    console.log(JSON.stringify(data));

  } catch (err) {
    console.error('Housten we are in trouble: ' + err);
  }

}


async function testSimple() {

  try {
    await bmw.updateOrRequestToken();
    console.log("Successfully authenticated");

    let data = await bmw.getCarInfo(getVin(), Bmw.GET_STATE);
    console.log(JSON.stringify(data));

  } catch (err) {
    console.error('Housten we are in trouble: ' + err);
  }

}


async function develop() {

  try {
    await bmw.updateOrRequestToken();
    console.log("Successfully authenticated");

    let data = await bmw.executeRemoteService(getVin(), Bmw.SERVICE_DOOR_LOCK);
    console.log(JSON.stringify(data));

  } catch (err) {
    console.error('Housten we are in trouble: ' + err);
  }

}


function testCrypto() {
  let pw = "12345";
  let e1 = Bmw._encrypt(pw, "test");
  console.log(e1);
  let e2 = Bmw._encrypt(pw, "test");
  console.log(e2);
  let d1 = Bmw._decrypt(pw, e1);
  let d2 = Bmw._decrypt(pw, e2);
  if (e1 == e2) throw new Error("enc not unique");
  if (e1.indexOf('test') > -1) throw new Error("not encrypted");
  if (d1 != d2) throw new Error("dec not same");
  if (d1 != "test") throw new Error("dec not original");
  console.log("ok");
}


//
// Exports
//
exports.testAuthentication = testAuthentication;
exports.testReadAll = testReadAll;
exports.testSimple = testSimple;
exports.testCarList = testCarList;


//testCrypto();
//testAuthentication();
//testReadAll();
//testSimple();
//testCarList();
//develop();
