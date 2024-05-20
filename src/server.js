const axios = require('axios');
const configuration = require('./configs/configProduction');
// const configuration = require('./configs/configTest');
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
const tmi = require('tmi.js');
var bannedWords = require('./configs/bannedWords');

const ngrokURL = "https://typically-quick-kingfish.ngrok-free.app";
let access_token = "";
let oauth_token = "";
let oauth_refresh_token = "";
let expiresIn = new Date();
const addRewardName = "7TV ADD";
const removeRewardName = "7TV REMOVE";
var redeemId = [];
var connection = new Connection(DBConfig);


const chatbot = new tmi.client(configuration);
chatbot.on("message", chatMessageHandler); //calls chatMessageHandler upon receiving a chat message
chatbot.connect();

function createNewDBConnection(){
    connection = new Connection(DBConfig); 
}

//Start of Program
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

//Programatically restart
function reinitializeApp(){
    twitchClientTokenGet();
    twitchGetOAuthToken(oauth_refresh_token);

    setTimeout(() => {
        checkTokens(true);
        startAllSubStreams();
    }, 5000);
}


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
                        case "oauth_refresh_token":
                            oauth_refresh_token = column.value;
                            break;
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
        if(typeOfQuery === "INIT" && oauth_refresh_token !== ""){
            reinitializeApp();
        }
        else{
            console.log("No OAuth refresh token: Cannot proceed with application. User MUST authenticate. BOT WILL NOT WORK")
        }   
        connection.close();
    })

    connection.execSql(request);
}

//Handles closing the terminal and unsubbing from streams.
process.on("SIGINT", ()=>{
    endAllSubbedStreams();
    removeCustomReward();
    setTimeout(()=>{
        process.exit(0);
    }, 5000)
});

function checkTokens(isInit){
    twitchTokenValidate(access_token).then(res => {
        console.log("Client Access Token: "+res.status)
        console.log(res.data)
        if(res.status !== 200){
            twitchClientTokenGet();
        }
    });
    twitchTokenValidate(oauth_token).then(res => {
        console.log("OAuth Token: "+res.status)
        console.log(res.data)
        if(res.status !== 200){
            twitchGetOAuthToken(oauth_refresh_token);
        }
    });

    if(isInit){
        getListOfManagableRedeems();
    }
}

// Requires OAuth token
// Gets a list of managable redeems
function getListOfManagableRedeems(){
    axios.get("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id+"&only_manageable_rewards=true",
        {
            headers:{
                "Content-Type": "application/json",
                "Client-ID": configuration.CLIENT_ID,
                "Authorization": "Bearer " + oauth_token
            }
        })
        .then(response => {        
            //Checking if there is any managable redeems returns
            if(response.data.data.length === 0){
                console.log("No manageable redeems")
                addCustomReward();
            }
            else{
                console.log("manageable redeems.")
                redeemId[0] = response.data.data[0].id;
                redeemId[1] = response.data.data[1].id;
                console.log(response.data)
            }
        })
        .catch(error => {console.log(error)});
}

function twitchTokenValidate(token){
    // Validate a token
    console.log(token);
    return axios.get("https://id.twitch.tv/oauth2/validate",
    {
        headers:{
            "Authorization": "Bearer "+token
        }
    })
    .then(response => {
        console.log("////////// Client Token Auth Response //////////");
        return response;
    })
}

function twitchGetOAuthToken(refreshToken){
    axios({
        url: 'https://id.twitch.tv/oauth2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        method: 'post',
        data: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${configuration.CLIENT_ID}&client_secret=${configuration.CLIENT_SECRET}`
    }).then(res => {
        oauth_token = res.data.access_token;
        oauth_refresh_token = res.data.refresh_token;
        expiresIn = res.data.expires_in;

        console.log("Refresh token will expire in: "+expiresIn/60+" minutes");

        //Wait 5 seconds to run this to negate race conditions
        setTimeout(() => {
            console.log("gonna write to the DB now: "+ refreshToken);
            createNewDBConnection();
            connection.on('connect', function(err) {  
                // If no error, then good to proceed.
                if(err){
                    console.log(err);
                }
                else{
                    console.log("////////// DATABASE CONNECTION OPENED //////////")
                    executeQuery("WRITE","UPDATE Config SET ConfigData = "+refreshToken+" WHERE ConfigType = 'oauth_refresh_token'");
                }
            });        
        }, 2000);
    }).catch(error => {
        console.log(error);
    })
}

function twitchClientTokenGet(){
    axios.post("https://id.twitch.tv/oauth2/token" +
        "?client_id=" + configuration.CLIENT_ID +
        "&client_secret=" + configuration.CLIENT_SECRET +
        "&grant_type=client_credentials" +
        "&scope=" +
        "channel:manage:redemptions channel:read:redemptions " +
        "chat:edit chat:read")
    .then(response => {
        access_token = response.data.access_token;
    })
    .catch(error => {console.log(error)});
}

function startAllSubStreams(){
    for(let i = 0; i < twitchEvents.types.length; i++){
        axios.post(ngrokURL + "/createWebhook?eventType=" + twitchEvents.types[i])
            .then(() => {
                console.log(i, "Webhook established :" + twitchEvents.types[i])
            })
            .catch(webhookError => {console.log("Webhook creation error: " + webhookError)})
    }
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
        console.log(res.data.access_token);

        //asign the tokens to code variables
        oauth_token = res.data.access_token;
        oauth_refresh_token = res.data.refresh_token;

        createNewDBConnection();
        connection.connect();

        connection.on('connect', function(err) {  
            // If no error, then good to proceed.
            if(err){
                console.log(err);
            }
            else{
                console.log("////////// DATABASE CONNECTION OPENED //////////")
                executeQuery("WRITE","INSERT INTO Config(ConfigType, ConfigData) VALUES ('oauth_refresh_token', '"+oauth_refresh_token+"')");

                setTimeout(()=>{
                    reinitializeApp();
                },1000)
            }
        });
    })
})

httpsApp.get("/", function(request, response){
    response.sendFile(__dirname + "/html/appAccessRedirect.html");
})

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

//
//#region Twitch Event
//Creation of the Chatbot instance

function sendTwitchChatMessage(userName, emotePrefix, message){
    chatbot.action(configuration.channels[0], emotePrefix + "@"+ userName + " " + message);
}

function addCustomReward(){
    var data = {
        "title":addRewardName,
        "cost": 15000, 
        "is_user_input_required": true,
        "prompt": "Please enter the link for the 7TV emote you would like to add. No sexual emotes. If you manage to outsmart me, a mod will remove the emote. Refunds will be automatic on failed requests.",
        "is_max_per_user_per_stream_enabled": true,
        "max_per_user_per_stream": 10,
        "is_global_cooldown_enabled": true,
        "global_cooldown_seconds": 10, //CHANGE THIS BEFORE LAUNCHING ON MONCHIS STREAM. VALUE IS IN SECONDS
        "background_color": "#00FFFF"
    };

    var data2 = {
        "title":removeRewardName,
        "cost": 15000,
        "is_user_input_required": true,
        "prompt": "Please enter the link for the 7TV emote you would like to remove.",
        "is_max_per_user_per_stream_enabled": true,
        "max_per_user_per_stream": 10,
        "is_global_cooldown_enabled": true,
        "global_cooldown_seconds": 10, //CHANGE THIS BEFORE LAUNCHING ON MONCHIS STREAM. VALUE IS IN SECONDS
        "background_color": "#FF0000"
    };

    //This creates the ADD reward
    axios.post("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id,
    data,
        {
            headers: {
                "Content-Type": "application/json",
                "Client-ID": configuration.CLIENT_ID,
                "Authorization": "Bearer " + oauth_token
            }
        })
    .then(response => {
        redeemId[0] = response.data.data[0].id;
        console.log("Added custom reward with ID:"+response.data.data[0].id)
    })
    .catch(error => console.log(error));

    //This creates the REMOVE reward
    axios.post("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id,
    data2,
        {
            headers: {
                "Content-Type": "application/json",
                "Client-ID": configuration.CLIENT_ID,
                "Authorization": "Bearer " + oauth_token
            }
        })
    .then(response => {
        redeemId[1] = response.data.data[0].id;
        console.log("Added custom reward with ID:"+response.data.data[0].id)
    })
    .catch(error => console.log(error));
}

function removeCustomReward(){
    axios.delete("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id+"&id="+redeemId[0],
        {
            headers: {
                "Content-Type": "application/json",
                "Client-ID": configuration.CLIENT_ID,
                "Authorization": "Bearer " + oauth_token
            }
        })
    .then(response => console.log("Removed custom reward with status: "+response.status))
    .catch(error => console.log(error));

    axios.delete("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id+"&id="+redeemId[1],
    {
        headers: {
            "Content-Type": "application/json",
            "Client-ID": configuration.CLIENT_ID,
            "Authorization": "Bearer " + oauth_token
        }
    })
.then(response => console.log("Removed custom reward with status: "+response.status))
.catch(error => console.log(error));
}

function updateRedemptionStatus(rewardStatus, redemptionId, rewardId){
    var data = {
        "status": rewardStatus,
    };
    axios.patch("https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?broadcaster_id="+configuration.broadcaster_id+"&reward_id="+rewardId+"&id="+redemptionId,
    data,    
        {
            headers: {
                "Content-Type": "application/json",
                "Client-ID": configuration.CLIENT_ID,
                "Authorization": "Bearer " + oauth_token
            }
        }
    )
    .then(response => console.log("Update redemption status:"+response.status))
    .catch(error => console.log(error));
}

//Filters the input text to return an array of valid URL's
function findURLs(userInput) {
    let urlRegex = /(https?:\/\/[^\s]+)/g;
    return userInput.match(urlRegex);
}
    
//Takes the UserInput from a Twitch Event and returns the emote ID for 7tv
function getEmoteId(unCheckedUserInput){
    let urlFiltered = findURLs(unCheckedUserInput);

    console.log(urlFiltered);

    if(urlFiltered !== null){
        if(urlFiltered[0].includes("7tv.app")){
            let startOfId = urlFiltered[0].lastIndexOf("/") +1 ;
            let endOfId = startOfId + 24;
            let checkedEmoteId = urlFiltered[0].slice(startOfId, endOfId);
            return checkedEmoteId;
        }
        else{
            return "No URL Found";
        }
    }
    else{
        return "No URL Found";
    }
}

function postRequestToSevenTv(methodToSend, emoteIDToSend){
    console.log("we are sending this id: "+emoteIDToSend)
    return axios.post("https://7tv.io/v3/gql", {
        "operationName": "ChangeEmoteInSet",
        "variables": {
            "action": methodToSend,
            "id": configuration.seventv_USER_ID,
            "emote_id": emoteIDToSend,
            "name": ""
        },
        "query": "mutation ChangeEmoteInSet($id: ObjectID!, $action: ListItemAction!, $emote_id: ObjectID!, $name: String) {\n  emoteSet(id: $id) {\n    id\n    emotes(id: $emote_id, action: $action, name: $name) {\n      id\n      name\n      __typename\n    }\n    __typename\n  }\n}"
    },{
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + configuration.seventv_AUTH
        }
    }
    )
        .then(response => {
            return response.data;
        })
        .catch(error => {return error});
}

//Returns a PROMISE
//Sends get request to 7TV to get the emote data to check if the emote is publically listed or not
function getEmote(emoteId){
    const response = axios.get("https://7tv.io/v3/emotes/"+emoteId)
                        .then(response => {
                            let object = {
                                hasError: false,
                                data: response.data
                            }
                            return object;
                        })
                        .catch(response => {
                            let object = {
                                hasError: true,
                                data: response.response.data
                            }
                            return object;
                        });

    return response;
}

//Contains logic to check if the emote name + id is valid to send to 7tv.
function isValidToSend(emoteId, eventUserName){
    console.log("Emote ID to check: "+emoteId);

    //IsEmoteListed returns a promise; The promise contains the response.data from 7TV
    return getEmote(emoteId).then(returned7TVEmoteObject => {
        console.log(returned7TVEmoteObject);

        if(!returned7TVEmoteObject.hasError){
            let isPubliclyListed = returned7TVEmoteObject.data.listed;
            let emoteName = returned7TVEmoteObject.data.name.toLowerCase();
            let isBannedEmoteName = bannedWords.some(i =>  emoteName.includes(i));

            console.log("Emote name contains banned word:"+isBannedEmoteName);

            //Check emote name against banned words list
            if(isBannedEmoteName){
                console.log("emote name is banned")
                sendTwitchChatMessage(eventUserName, "frfr ", "that emote name contains a banned word. I'll refund your points.");
                return false;
            }
            else{
                //Check if the emote is publicly listed
                if(!isPubliclyListed){
                    console.log("emote is not publicly listed. ask mod to review")
                    sendTwitchChatMessage(eventUserName, "frfr ", "hat emote is not publicly listed, ask a mod to review it. I'll refund your points.");
                    return false;
                }
                else{
                    console.log("Redeem emote ID is valid")
                    return true
                }
            }

        }
        else{
            if(returned7TVEmoteObject.data.status_code === 400){
                sendTwitchChatMessage(eventUserName, "How2Read ", "Sorry I couldn't find an emote with that. I'll refund your points.");
            }
            return false;
        }
    })
}

//Contains logic for handling Twitch events
function twitchWebhookEventHandler(webhookEvent){
    console.log("//////////////////// Twitch Webhook Handler Listening... ////////////////////");

    //Logic for handeling Channel Point Redeems (custom redeem rewards only)
    if (webhookEvent.subscription.type === "channel.channel_points_custom_reward_redemption.add") {
        if(webhookEvent.event.reward.title === addRewardName){ //THIS IS FOR 7TV ADD
            let emoteID = getEmoteId(webhookEvent.event.user_input);

            if(emoteID !== "No URL Found"){
                //isValidToSend returns a promise that contains the boolean of if the request is valid to send to 7TV
                isValidToSend(emoteID, webhookEvent.event.user_name).then(returnedIsValid => {
                    if(!returnedIsValid){
                        console.log("Emote was not added because returnedIsValid contains value:"+returnedIsValid)
                        updateRedemptionStatus("CANCELED", webhookEvent.event.id, redeemId[0]);
                    }
                    else{
                        postRequestToSevenTv("ADD", emoteID).then(postRequestResponseData => {
                            let hasErrors = typeof postRequestResponseData.errors

                            //If there is errors returned from posting to 7TV
                            if(hasErrors !== "undefined"){ //REFUND POINTS
                                console.log("Error from 7TV: "+postRequestResponseData.errors[0].message)

                                updateRedemptionStatus("CANCELED", webhookEvent.event.id, redeemId[0]);
                                if(postRequestResponseData.errors[0].message === "704611 Emote Already Enabled"){
                                    console.log("emote already enabled")
                                    sendTwitchChatMessage(webhookEvent.event.user_name, "Saddies ", "that emote is already enabled here. I'll refund your points.");
                                }
                                else if(postRequestResponseData.errors[0].message === "704612 Emote Name Conflict"){
                                    sendTwitchChatMessage(webhookEvent.event.user_name, "Saddies ", "that emote is the same name as an existing emote. I can't automatically add it. I'll refund your points.");
                                }
                                else if(postRequestResponseData.errors[0].message === "704620 No Space Available: This set does not have enough slots"){
                                    sendTwitchChatMessage(webhookEvent.event.user_name, "Saddies ", "there is no space available to add emotes. I'll refund your points.");
                                }
                                else{
                                    sendTwitchChatMessage(webhookEvent.event.user_name, "Saddies ", "some kind of error occured. I'll refund your points.");
                                }
                            }
                            else{ //FULFILL REQUESTS
                                updateRedemptionStatus("FULFILLED", webhookEvent.event.id, redeemId[0]);
                                console.log("emote added")
                            }
                        });
                    }
                })
            }
            else{
                sendTwitchChatMessage(webhookEvent.event.user_name, "frfr ", "You didn't enter a valid 7TV URL. I'll refund your points.");
                updateRedemptionStatus("CANCELED", webhookEvent.event.id, redeemId[0]);
            }
        }
        else if(webhookEvent.event.reward.title === removeRewardName){ //THIS IS FOR 7TV REMOVE
            let emoteID = getEmoteId(webhookEvent.event.user_input);

            if(emoteID !== "No URL Found"){
                //isValidToSend returns a promise that contains the boolean of if the request is valid to send to 7TV
                isValidToSend(emoteID, webhookEvent.event.user_name).then(returnedIsValid => {
                    if(!returnedIsValid){
                        console.log("Emote was not added because returnedIsValid contains value:"+returnedIsValid)
                        updateRedemptionStatus("CANCELED", webhookEvent.event.id, redeemId[1]);
                    }
                    else{
                        postRequestToSevenTv("REMOVE", emoteID).then(postRequestResponseData => {
                            let hasErrors = typeof postRequestResponseData.errors

                            //If there is errors returned from posting to 7TV
                            if(hasErrors !== "undefined"){ //REFUND POINTS
                                console.log("Error from 7TV: "+postRequestResponseData.errors[0].message)
                                updateRedemptionStatus("CANCELED", webhookEvent.event.id, redeemId[1]);
                                sendTwitchChatMessage(webhookEvent.event.user_name, "Saddies ", "some kind of error occured. I'll refund your points.");
                            }
                            else{ //FULFILL REQUESTS
                                updateRedemptionStatus("FULFILLED", webhookEvent.event.id, redeemId[1]);
                                console.log("emote added")
                            }
                        });
                    }
                })
            }
            else{
                sendTwitchChatMessage(webhookEvent.event.user_name, "frfr ", "You didn't enter a valid 7TV URL. I'll refund your points.");
                updateRedemptionStatus("CANCELED", webhookEvent.event.id, redeemId[1]);
            }
        }  
    }
};

function chatMessageHandler(channel, userState, message, self) {

    //sendTwitchChatMessage("","", "connected");

    // const wordArray = message.split(" ");

    // if (wordArray[0].toLowerCase() === "!endstream") {
    //    endAllSubbedStreams();
    // }
}
//#endregion