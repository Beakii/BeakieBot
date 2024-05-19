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
const clientCredentialsPost = "https://id.twitch.tv/oauth2/token?client_id=" + configuration.CLIENT_ID + "&client_secret=" + configuration.CLIENT_SECRET + "&grant_type=client_credentials&scope=channel:manage:redemptions channel:read:redemptions chat:edit chat:read"
let access_token = "";
let oauth_token = "";
var connection = new Connection(DBConfig);


function createNewDBConnection(){
    connection = new Connection(DBConfig); 
}

//Read all access tokens from DB to code
connection.connect();
connection.on('connect', function(err) {  
    // If no error, then good to proceed.
    if(err){
        console.log(err);
    }
    else{
        console.log("////////// DATABASE CONNECTION OPENED //////////")
        executeQuery("INIT","SELECT * FROM Config");
    }
});


function executeQuery(typeOfQuery, query){
    let request = new Request(query, function(err){
        if(err){
            console.log("query error");
            console.log(err);
        }
    });

    if(typeOfQuery === "INIT"){
        let prevColumn = "";
        request.on('row', function(columns){
            columns.forEach((column) => {
                if(column.value === null){
                    console.log("null");
                }
                else{
                    switch(prevColumn){
                        case "client_credentials_access_token":
                            access_token = column.value;
                            break;
                        
                        case "user_oauth_token":
                            oauth_token = column.value;
                            break;
    
                        case "seventv_auth_token":
                            sevenTv_token = column.value;
                    }
                }
                prevColumn = column.value;
            });
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
    request.on('doneInProc', function(rowCount, more){
        console.log(rowCount + ' rows returned');
    });

    request.on('requestCompleted', function(rowCount, more){
        console.log("////////// DATABASE CONNECTION CLOSED //////////")
        if(typeOfQuery === "INIT"){
            checkTokens();
        }   
        connection.close();
    })

    connection.execSql(request);
}

//Handles closing the terminal and unsubbing from streams.
process.on("SIGINT", ()=>{
    endAllSubbedStreams();
    process.exit(0);
});

function checkTokens(){
    console.log("Access Token: "+access_token);
    console.log("OAuth Token: "+oauth_token);
}

function twitchTokenValidate(token){
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
}

function twitchTokenGet(){
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

        // createNewDBConnection();
        // connection.connect();

        // connection.on('connect', function(err) {  
        //     // If no error, then good to proceed.
        //     if(err){
        //         console.log(err);
        //     }
        //     else{
        //         console.log("////////// DATABASE CONNECTION OPENED //////////")
        //         executeQuery("WRITE","INSERT INTO Config(ConfigType, ConfigData) VALUES ('client_credentials_access_token', '"+access_token+"')");
        //     }
        // });

        for(let i = 0; i < twitchEvents.types.length; i++){
            axios.post(ngrokURL + "/createWebhook?eventType=" + twitchEvents.types[i])
                .then(() => {console.log(i, "Webhook established :" + twitchEvents.types[i])})
                .catch(webhookError => {console.log("Webhook creation error: " + webhookError)})
        }
    })
    .catch(error => {console.log(error)});
}

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

httpsApp.get("/bot-functions", function(request, response){
    response.sendFile(__dirname + "/html/botFunctions.html");
})

httpsApp.route("/auth").get((req, res) => {
    res.sendFile(__dirname + "/html/authRedirect.html");
    //Returns OAuth Token
    axios.post("https://id.twitch.tv/oauth2/token?client_id="+configuration.CLIENT_ID+
    "&client_secret="+configuration.CLIENT_SECRET+
    "&code="+req.query.code+"&grant_type=authorization_code&redirect_uri="+ngrokURL+"/auth").then(res => {
        console.log(res);
    })
})

httpsApp.get("/", function(request, response){
    response.sendFile(__dirname + "/html/appAccessRedirect.html");
    console.log(request.query);
})

httpsApp.get("/redirect/callback", function(request, response){

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
if(access_token === ""){

}
else{
    console.log("Access Token Already in DB: " + access_token);
}







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