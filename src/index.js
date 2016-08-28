var AlexaSkill = require('./AlexaSkill');
var converter = require('number-to-words');
var postal = require('postal-abbreviations');

var ZipCode = function () {
    AlexaSkill.call(this);
};

// Extend AlexaSkill
ZipCode.prototype = Object.create(AlexaSkill.prototype);
ZipCode.prototype.constructor = ZipCode;

ZipCode.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    response.ask("Tell me a zipcode, or a city and state.");
};

ZipCode.prototype.intentHandlers = {
    "GetZipCodeIntent": function (intent, session, response) {
        console.log(JSON.stringify(intent));
        var zip = buildZip(intent);
        console.log(zip);
        cityLookup(zip, response);
    },

    "GetCityIntent": function (intent, session, response) {
        console.log(JSON.stringify(intent));

        var city = intent.slots.usCity.value;
        var cityNumberChecker = city.split(" ");
        for (i = 0; i < cityNumberChecker.length; i++) {
            if(!isNaN(cityNumberChecker[i])) {
                cityNumberChecker[i] = converter.toWords(cityNumberChecker[i]);
            }
        }
        city = cityNumberChecker.join(" ");

        var state = intent.slots.usState.value;
        if(state && state.length > 2) {
            stateName = state;
            stateAbbrev = postal.toAbbreviation(state);
        }
        else {
            stateName = postal.toName(state);
            stateAbbrev = state;
        }

        zipLookup(city, stateName, stateAbbrev, response);
    },

    "AMAZON.StopIntent": function (intent, session, response) {
        response.tell("");
    },

    "AMAZON.CancelIntent": function (intent, session, response) {
        response.tell("");
    },
};

function buildZip(intent) {
    return '' + (intent.slots.zipA.value || '') 
              + (intent.slots.zipB.value || '')
              + (intent.slots.zipC.value || '')
              + (intent.slots.zipD.value || '')
              + (intent.slots.zipE.value || '');
}

function cityLookup(zip, response) {
    var http = require('http');
    var options = {
        host: 'api.zippopotam.us',
        path: '/us/' + zip
    };

    callback = function(httpGet) {
        var str = '';

        httpGet.on('data', function (chunk) {
            str += chunk;
        });

        httpGet.on('end', function () {
            console.log('Statuscode: ' + httpGet.statusCode +'  Zipcode: ' + str);
            var helloMessage = { 
                                speech: "<speak>I did not find a location for the zipcode <say-as interpret-as=\"digits\">" + zip + "</say-as>.</speak>",
                                type: AlexaSkill.speechOutputType.SSML
                                }
            if(httpGet.statusCode === 200) {
                var oZip = JSON.parse(str);
                if(oZip.places)
                    helloMessage = "That zipcode is for " + oZip.places[0]["place name"] + ", " + oZip.places[0]["state"];
            }

            response.tell(helloMessage);
        });

        httpGet.on('error', function (err) {
            response.tell("There was a problem using the zippopotamus api service, status code: " + httpGet.statusCode);
        });
    }

    http.request(options, callback).end();
}

function zipLookup(city, stateName, stateAbbrev, response) {
    var http = require('http');
    var options = {
        host: 'api.zippopotam.us',
        path: '/us/' + stateAbbrev + '/' + city.replace(" ", "%20")
    };

    callback = function(httpGet) {
        var str = '';

        httpGet.on('data', function (chunk) {
            str += chunk;
        });

        httpGet.on('end', function () {
            var helloMessage = "I couldn't find a zipcode for " + city + ", " + stateName;
            if(httpGet.statusCode === 200) {
                var oZip = JSON.parse(str);
                if(oZip.places) {                    
                    helloMessage = buildCityMessage(oZip.places, city);
                }
            }

            response.tell(helloMessage);
        });

        httpGet.on('error', function (err) {
            response.tell("There was a problem using the zippopotamus api service, status code: " + httpGet.statusCode);
        });
    }

    http.request(options, callback).end();
}

function buildCityMessage(places, city) {
    console.log(JSON.stringify(places));
    var hello = '';
    if(places.length === 1) {
         hello = "The zipcode for " + city + " is <say-as interpret-as=\"digits\">" + places[0]["post code"] + "</say-as>";
    } else if(places.length > 5) {
        // tell the first and last zipcodes... and the count
        hello = "There are " + places.length + " zipcodes for " + city + ", between ";
        hello += "<say-as interpret-as=\"digits\">" + places[0]["post code"] + " and " + places[places.length-1]["post code"] + ".</say-as>";
    } else {
        // assemble the small list together
        hello = "I found " + places.length + " zipcodes for " + city + ".";
        hello += "  <say-as interpret-as=\"digits\">" + buildZipCodeListMessage(getZips(places)) + "</say-as>";
    }

    return {
                speech: "<speak>" + hello + "</speak>",
                type: AlexaSkill.speechOutputType.SSML
            };
}

function getZips(places, start, count) {
    start = start || 0;
    var end = start + (count || places.length);
    var zips = [];
    for (i = start; i < end; i++) {
        zips.push(places[i]["post code"]);
    } 
    return zips;
}

function buildZipCodeListMessage(zips) {
    var message = "";
    for (i = 0; i < zips.length; i++) {
        if(i === (zips.length - 1))
            message += "and " + zips[i] + ".";
        else
            message += zips[i] + ", ";
    }
    return message;
}

exports.handler = function (event, context) {
    var zipCode = new ZipCode();
    zipCode.execute(event, context);
};

