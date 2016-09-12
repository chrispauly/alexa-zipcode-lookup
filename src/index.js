require('dotenv').config({silent: true});
var AlexaSkill = require('./AlexaSkill');
var converter = require('number-to-words');
var postal = require('postal-abbreviations');
var googleAPIKEY = process.env.G_APIKEY;

var newSessionMsg = "Tell me a zipcode, or a city and state.";
var helpMsg = "You can tell me a five digit zipcode and I will tell you what city that is for.  Or you "
            + "can tell me a city and state and I will tell you the zipcode or zipcodes associated with that city.";

String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
};

var ZipCode = function () {
    AlexaSkill.call(this, process.env.ASK_APPID);
};

// Extend AlexaSkill
ZipCode.prototype = Object.create(AlexaSkill.prototype);
ZipCode.prototype.constructor = ZipCode;

ZipCode.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    response.ask(newSessionMsg);
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

    "AMAZON.HelpIntent": function (intent, session, response) {
        response.ask(helpMsg);
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
            var cardContent = "I did not find a location for the zipcode " + zip;
            var imageUrl = { cardSmallImage: undefined, cardLargeImage: undefined };
            if(httpGet.statusCode === 200) {
                var oZip = JSON.parse(str);
                if(oZip.places) {
                    helloMessage = "That zipcode is for " + oZip.places[0]["place name"] + ", " + oZip.places[0]["state"];
                    cardContent = helloMessage;
                    imageUrl = buildImageUrl(zip);
                }
            }
            response.tellWithCard(helloMessage, zip, cardContent, imageUrl.cardSmallImage, imageUrl.cardLargeImage);
        });

        httpGet.on('error', function (err) {
            response.tell("There was a problem using the zippopotamus api service, status code: " + httpGet.statusCode);
        });
    }

    http.request(options, callback).end();
}

function zipLookup(city, stateName, stateAbbrev, response, finalTry) {
    city = city.toProperCase();
    var cantFindMessage =  "I couldn't find a zipcode for " + city + ", " + stateName;
    var http = require('http');
    var options = {
        host: 'api.zippopotam.us',
        path: '/us/' + stateAbbrev + '/' + city.replace(/ /g, "%20")
    };

    callback = function(httpGet) {
        var str = '';

        httpGet.on('data', function (chunk) {
            str += chunk;
        });

        httpGet.on('end', function () {
            var helloMessage = undefined;
            if(httpGet.statusCode === 200) {
                var oZip = JSON.parse(str);
                if(oZip.places) {                    
                    helloMessage = buildCityMessage(oZip.places, city);
                }
            }

            if(finalTry) {
                response.tellWithCard(cantFindMessage,  city + ", " + stateAbbrev.toUpperCase(), cantFindMessage);
            }

            if(!helloMessage) {
                // See if Google can help predict the correct spelling of the city name
                var https = require('https');
                var cityLookup = city.replace(/ /g, "%20") + ',' + stateAbbrev;            
                var goptions = {
                    host: 'maps.googleapis.com',
                    path: '/maps/api/place/autocomplete/json?input=' + cityLookup + '&types=(cities)&key=' + googleAPIKEY
                };

                var gcallback = function(httpsGet) {
                    var str = '';

                    httpsGet.on('data', function (chunk) {
                        str += chunk;
                    });

                    httpsGet.on('end', function () {
                        if(httpsGet.statusCode === 200 && str) {
                            var gresponse = JSON.parse(str);
                            console.log("autocomplete (" + city + "): ", str);
                            zipLookup(gresponse["predictions"][0]["description"].split(",")[0], stateName, stateAbbrev, response, true);
                        } else {
                            response.tellWithCard(cantFindMessage,  city + ", " + stateAbbrev.toUpperCase(), cantFindMessage);
                        }
                    });
                }
                https.request(goptions, gcallback).end();
            } else {
                var imageUrl = buildImageUrl(city.replace(/ /g, "%20") + "," + stateAbbrev);
                response.tellWithCard(helloMessage, city + ", " + stateAbbrev.toUpperCase(), helloMessage.cardContent, imageUrl.cardSmallImage, imageUrl.cardLargeImage);
            }
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
    var cardContent = undefined;
    
    if(places.length === 1) {
        hello = "The zipcode for " + city + " is <say-as interpret-as=\"digits\">" + places[0]["post code"] + ".</say-as>";
        cardContent = cleanCardMessage(hello);
    } else if(places.length === 2) {
        hello = "The zipcodes for " + city + " are <say-as interpret-as=\"digits\">" + places[0]["post code"] + " and " + places[1]["post code"] + ".</say-as>";
        cardContent = cleanCardMessage(hello);
    } else if(places.length > 5) {
        // tell the first and last zipcodes... and the count
        hello = "There are " + places.length + " zipcodes for " + city + ", between ";
        hello += "<say-as interpret-as=\"digits\">" + places[0]["post code"] + " and " + places[places.length-1]["post code"] + ".</say-as>";
        cardContent = "Zipcodes: " + buildZipCodeListMessage(getZips(places));
    } else {
        // assemble the small list together
        hello = "I found " + places.length + " zipcodes for " + city + ".";
        hello += "  <say-as interpret-as=\"digits\">" + buildZipCodeListMessage(getZips(places)) + "</say-as>";
        cardContent = "Zipcodes: " + buildZipCodeListMessage(getZips(places));
    }

    return {
                speech: "<speak>" + hello + "</speak>",
                type: AlexaSkill.speechOutputType.SSML,
                cardContent: cardContent
            };
}

function cleanCardMessage(message) {
    return message.replace(/<.*?>/g,"");
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

function buildImageUrl(center) {
    return {
        cardSmallImage: "https://maps.googleapis.com/maps/api/staticmap?center=" + center + "&zoom=13&size=720x480&maptype=roadmap&key=" + googleAPIKEY,
        cardLargeImage: "https://maps.googleapis.com/maps/api/staticmap?center=" + center + "&zoom=12&size=1200x800&maptype=roadmap&key=" + googleAPIKEY
    };
}

exports.handler = function (event, context) {
    var zipCode = new ZipCode();
    zipCode.execute(event, context);
};

