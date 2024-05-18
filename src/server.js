const axios = require('axios');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const httpsApp = express();
const httpsServer = require('https').createServer({ 
    key: fs.readFileSync("cert/key.pem"), 
    cert: fs.readFileSync("cert/cert.pem")
}, httpsApp);

//Starts and sets up the HTTPS Server
//#region Https Server init
httpsApp.use(express.urlencoded({ extended: true }));
httpsApp.use(express.static(__dirname + "/html"));
httpsApp.use(express.json({verify: verifyTwitchWebhookSignatures}));

httpsServer.listen(4000, function(){
    console.log("HTTPS client has started.");
})

httpsApp.get("/redirect", function(request, response){
    response.sendFile(__dirname + "/html/appAccessRedirect.html");
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
        ...eventTypesConfig[request.query.eventType],
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
        const responseData = response.data;
        access_token = responseData.access_token;

        for(let i = 0; i < eventTypes.length; i++){
            axios.post(ngrokURL + "/createWebhook?eventType=" + eventTypes[i])
                .then(() => {console.log(i, "Webhook established :" + eventTypes[i])})
                .catch(webhookError => {console.log("Webhook creation error: " + webhookError)})
        }
    })
    .catch(error => {console.log(error)});
//#endregion