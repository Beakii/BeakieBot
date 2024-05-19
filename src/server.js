const axios = require('axios');
const configuration = require('./configs/configTest');
const twitchEvents = require('./twitchEvents');
const DBConfig = require('./configs/dbConfig');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const bodyParser = require("body-parser");
const httpsApp = express();
const httpsServer = require('https').createServer({ 
    key: fs.readFileSync("cert/key.pem"), 
    cert: fs.readFileSync("cert/cert.pem")
}, httpsApp);
const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const TYPES = require('tedious').TYPES;

const ngrokURL = "https://typically-quick-kingfish.ngrok-free.app";
let access_token = "";


var connection = new Connection(DBConfig);  
connection.connect();

connection.on('connect', function(err) {  
    // If no error, then good to proceed.
    if(err){
        console.log(err);
    }
    else{
        console.log("////////// DATABASE CONNECTION OPENED //////////")  
        executeQuery("WRITE","INSERT INTO Config(ConfigType, ConfigData) VALUES ('SomeValueHere', 'SomeValueHere')", false);
        setTimeout(()=>{executeQuery("READ","SELECT * FROM Config", true)}, 1000);
        
    }
});

function executeQuery(typeOfQuery, query, closeConnection){
    let request = new Request(query, function(err){
        if(err){
            console.log("query error");
            console.log(err);
        }
    });

    if(typeOfQuery === "READ"){
        let result = "";
        request.on('row', function(columns){
            columns.forEach(function(column){
                if(column.value === null){
                    console.log("null");
                }
                else{
                    result += column.value + " ";
                }
            });
            console.log(result);
            result = "";
        });
    }
    else if(typeOfQuery === "WRITE"){
        request.addParameter("configType", TYPES.NVarChar);
        request.addParameter("configData", TYPES.NVarChar);

        request.on('row', function(column){
            if(column.value === null){
                console.log("null")
            }
            else{
                console.log("Product id of inserted item is " + column.value); 
            }
        });
    }

    request.on('done', function(rowCount, more){
        console.log(rowCount + ' rows returned FROM DONE');
    });
    request.on('doneProc', function(rowCount, more){
        console.log(rowCount + ' rows returned FROM DONEPROC');
    });
    request.on('doneInProc', function(rowCount, more){
        console.log(rowCount + ' rows returned FROM DONEINPROC');
    });

    request.on('requestCompleted', function(rowCount, more){
        if(closeConnection){
            console.log("////////// DATABASE CONNECTION CLOSED //////////")        
            connection.close();
        }
    })

    connection.execSql(request);
}

//Handles closing the terminal and unsubbing from streams.
process.on("SIGINT", ()=>{
    endAllSubbedStreams();
    process.exit(0);
});

function endAllSubbedStreams(){
    axios.get("https://api.twitch.tv/helix/eventsub/subscriptions",
    {
        headers: {
            "Client-Id": configuration.CLIENT_ID,
            Authorization: "Bearer " + access_token
        }
    })
    .then(response => {
        if (response.status === 200) {
            const subscribedEvents = response.data;
            console.log("Number of events to unsubscribe: " + subscribedEvents.data.length);

            for (let i = 0; i < subscribedEvents.data.length; i++) {
                axios.delete("https://api.twitch.tv/helix/eventsub/subscriptions?id=" +
                    subscribedEvents.data[i].id,
                    {
                        headers: {
                            "Client-ID": configuration.CLIENT_ID,
                            Authorization: "Bearer " + access_token
                        }
                    }).then(() => {
                    console.log(i, subscribedEvents.data[i].type + " unsubscribed");
                }).catch(webhookError => {
                    console.log("Webhook unsubscribe error: " + webhookError);
                });
            }
        }
        else {
            console.log(response.status, response.data);
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function verifyTwitchWebhookSignatures(request, response, buffer, encoding){
    const twitchMessageID = request.header("Twitch-Eventsub-Message-Id");
    const twitchTimeStamp = request.header("Twitch-Eventsub-Message-Timestamp");
    const twitchMessageSignature = request.header("Twitch-Eventsub-Message-Signature");
    const currentTimeStamp = Math.floor(new Date().getTime() / 1000);

    if(Math.abs(currentTimeStamp - twitchTimeStamp) > 600){
        throw new Error("Signature is older than 10 minutes. Ignore this request");
    }

    if(!configuration.TWITCH_SIGNING_SECRET){
        throw new Error("The Twitch signing secret is missing.");
    }

    const ourMessageSignature = "sha256=" + crypto
        .createHmac("sha256", configuration.TWITCH_SIGNING_SECRET)
        .update(twitchMessageID + twitchTimeStamp + buffer)
        .digest("hex");

    if(twitchMessageSignature !== ourMessageSignature){
        throw new Error("Invalid signature");
    }
    else{
        console.log("Signature verified");
    }
}

//Starts and sets up the HTTPS Server
//#region Https Server init
httpsApp.use(bodyParser.urlencoded({ extended: true }));
httpsApp.use(express.static(__dirname + "/html"));
httpsApp.use(express.json({verify: verifyTwitchWebhookSignatures}));

httpsApp.get("/redirect", function(request, response){
    response.sendFile(__dirname + "/html/appAccessRedirect.html");
});

httpsApp.post("/redirect", function(request, response){
    console.log(request);
});

httpsApp.post("/twitchwebhooks/callback", async (request, response) => {
    //Handles the twitch webhook challenge
        if (request.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
            console.log("Verifying the Webhook is from Twitch");
            response.writeHeader(200, {"Content-Type": "text/plain"});
            response.write(request.body.challenge);

            return response.end();
        }

    //Handle the twitch event
    const eventBody = request.body;
    console.log("Receiving: " + eventBody.subscription.type + " request for " + eventBody.event.broadcaster_user_name, eventBody);
    twitchWebhookEventHandler(eventBody);
    response.status(200).end();
});

httpsApp.post("/createWebhook", (request, response) => {

    let createWebhookParams = {
        host: "api.twitch.tv",
        path: "helix/eventsub/subscriptions",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Client-ID": configuration.CLIENT_ID,
            "Authorization": "Bearer " + access_token
        }
    };

    let createWebhookBody = {
        ...twitchEvents.typesConfig[request.query.eventType],
        "transport": {
            "method": "webhook",
            "callback": ngrokURL + "/twitchwebhooks/callback",
            "secret": configuration.TWITCH_SIGNING_SECRET
        }
    };

    let responseData = "";

    let webhookRequest = https.request(createWebhookParams, (result) => {
        result.setEncoding("utf8");
        result.on("data", function(data){
            responseData = responseData + data;
        }).on('end', () =>{
            let responseBody = JSON.parse(responseData);
            response.send(responseBody);
        });
    });


    webhookRequest.on("error", (error) => {
        console.log(error);
    });

    webhookRequest.write(JSON.stringify(createWebhookBody));
    webhookRequest.end();
});


httpsServer.listen(4000, function(){
    console.log("HTTPS client has started.");
})
//#endregion

//This returns an access token for the bot to access EventSub API
//Creates the connection to the twitch channel for the substreams
axios.post("https://id.twitch.tv/oauth2/token" +
        "?client_id=" + configuration.CLIENT_ID +
        "&client_secret=" + configuration.CLIENT_SECRET +
        "&grant_type=client_credentials" +
        "&scope=" +
        "channel:manage:redemptions channel:read:redemptions " +
        "chat:edit chat:read")
    .then(response => {
        console.log("twitch connection started")
        access_token = response.data.access_token;

        for(let i = 0; i < twitchEvents.types.length; i++){
            axios.post(ngrokURL + "/createWebhook?eventType=" + twitchEvents.types[i])
                .then(() => {console.log(i, "Webhook established :" + twitchEvents.types[i])})
                .catch(webhookError => {console.log("Webhook creation error: " + webhookError)})
        }
    })
    .catch(error => {console.log(error)});

//Validate a token
// axios.get("https://id.twitch.tv/oauth2/validate",
// {
//     headers:{
//         "Authorization": "Bearer "+access_token
//     }
// })
// .then(response => {
//     console.log("////////// Client Token Auth Response //////////");
//     console.log(response.status);
//     console.log(response.data);
// })



// Requires OAuth token
// Gets a list of managable redeems
// axios.get("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id+"&only_manageable_rewards=true",
//     {
//         headers:{
//             "Content-Type": "application/json",
//             "Client-ID": configuration.CLIENT_ID,
//             "Authorization": "Bearer " + access_token
//         }
//     })
//     .then(response => {        
//         //Checking if there is any managable redeems returns
//         if(response.data.data.length === 0){
//             console.log("No manageable redeems")
//             addCustomReward();
//         }
//         else{
//             console.log("manageable redeems.")
//             redeemId[0] = response.data.data[0].id;
//             redeemId[1] = response.data.data[1].id;
//             console.log(response.data)
//         }
//     })
//     .catch(error => {console.log(error)});