//Library imports
const tmi = require('tmi.js');
const configuration = require('./configs/configTest'); //CHANGE THIS FOR TESTING/PRODUCTIONS
var bannedWords = require('./configs/bannedWords');
const axios = require('axios');


const ngrokURL = "https://typically-quick-kingfish.ngrok-free.app";
let access_token = "";
const addRewardName = "7TV ADD";
const removeRewardName = "7TV REMOVE";
var redeemId = [];

//Creation of the Chatbot instance
const chatbot = new tmi.client(configuration);
chatbot.on("message", chatMessageHandler); //calls chatMessageHandler upon receiving a chat message
chatbot.connect();

function sendTwitchChatMessage(userName, emotePrefix, message){
    chatbot.action(configuration.channels[0], emotePrefix + "@"+ userName + " " + message);
}

//Handles closing the terminal and unsubbing from streams.
process.on("SIGINT", ()=>{
    removeCustomReward();
    endAllSubbedStreams();
    waitForUnsubBeforeTerminate();
});

function waitForUnsubBeforeTerminate(){
    setTimeout(function(){
        process.exit(0)
    }, 1000);
}
//Config for the different event type subs for twitch
//#region Twitch Events + Configs
const eventTypesConfig = {
    "channel.follow": {
        "type": "channel.follow",
        "version": "2",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id,
            "moderator_user_id": configuration.broadcaster_id
        }
    },
    "channel.ban": {
        "type": "channel.ban",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.unban": {
        "type": "channel.unban",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.channel_points_custom_reward.add": {
        "type": "channel.channel_points_custom_reward.add",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.channel_points_custom_reward.update": {
        "type": "channel.channel_points_custom_reward.update",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.channel_points_custom_reward.remove": {
        "type": "channel.channel_points_custom_reward.remove",
        "version": "1",
        "condition":
            {
                "broadcaster_user_id": configuration.broadcaster_id
            }
    },
    "channel.channel_points_custom_reward_redemption.add": {
        "type": "channel.channel_points_custom_reward_redemption.add",
        "version": "1",
        "condition":
            {
                "broadcaster_user_id": configuration.broadcaster_id
            }
    },
    "channel.channel_points_custom_reward_redemption.update": {
        "type": "channel.channel_points_custom_reward_redemption.update",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.poll.begin": {
        "type": "channel.poll.begin",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.poll.progress": {
        "type": "channel.poll.progress",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.poll.end": {
        "type": "channel.poll.end",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.prediction.begin": {
        "type": "channel.prediction.begin",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.prediction.progress": {
        "type": "channel.prediction.progress",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.prediction.lock": {
        "type": "channel.prediction.lock",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "channel.prediction.end": {
        "type": "channel.prediction.end",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "stream.online": {
        "type": "stream.online",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    },
    "stream.offline": {
        "type": "stream.offline",
        "version": "1",
        "condition": {
            "broadcaster_user_id": configuration.broadcaster_id
        }
    }
};
const eventTypes = [
    // "channel.follow",
    // "channel.ban",
    // "channel.unban",
    "channel.channel_points_custom_reward.add",
    "channel.channel_points_custom_reward.update",
    "channel.channel_points_custom_reward.remove",
    "channel.channel_points_custom_reward_redemption.add",
    "channel.channel_points_custom_reward_redemption.update",
    // "channel.poll.begin",
    // "channel.poll.progress",
    // "channel.poll.end",
    // "channel.prediction.begin",
    // "channel.prediction.progress",
    // "channel.prediction.lock",
    // "channel.prediction.end",
    "stream.online",
    "stream.offline",
];
//#endregion

function addCustomReward(){
    var data = {
        "title":addRewardName,
        "cost": 1, //CHANGE THIS BEFORE LAUNCHING ON MONCHIS STREAM.
        "is_user_input_required": true,
        "prompt": "Please enter the 7TV emote link you would like to add. No sexual emotes. If you manage to outsmart me, a mod will remove the emote. Refunds will be automatic on failed requests.",
        "is_global_cooldown_enabled": true,
        "global_cooldown_seconds": 5, //CHANGE THIS BEFORE LAUNCHING ON MONCHIS STREAM. VALUE IS IN SECONDS
        "background_color": "#00FFFF"
    };

    var data2 = {
        "title":removeRewardName,
        "cost": 1, //CHANGE THIS BEFORE LAUNCHING ON MONCHIS STREAM.
        "is_user_input_required": true,
        "prompt": "Please enter the 7TV emote link you would like to remove.",
        "is_global_cooldown_enabled": true,
        "global_cooldown_seconds": 5, //CHANGE THIS BEFORE LAUNCHING ON MONCHIS STREAM. VALUE IS IN SECONDS
        "background_color": "#FF0000"
    };

    //This creates the ADD reward
    axios.post("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id,
    data,
        {
            headers: {
                "Content-Type": "application/json",
                "Client-ID": configuration.CLIENT_ID,
                "Authorization": "Bearer " + configuration.OAUTH_TOKEN
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
                "Authorization": "Bearer " + configuration.OAUTH_TOKEN
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
                "Authorization": "Bearer " + configuration.OAUTH_TOKEN
            }
        })
    .then(response => console.log("Removed custom reward with status: "+response.status))
    .catch(error => console.log(error));

    axios.delete("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id+"&id="+redeemId[1],
    {
        headers: {
            "Content-Type": "application/json",
            "Client-ID": configuration.CLIENT_ID,
            "Authorization": "Bearer " + configuration.OAUTH_TOKEN
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
                "Authorization": "Bearer " + configuration.OAUTH_TOKEN
            }
        }
    )
    .then(response => console.log("Update redemption status:"+response.status))
    .catch(error => console.log(error));
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

function chatMessageHandler(channel, userState, message, self) {
    const wordArray = message.split(" ");

    if (wordArray[0].toLowerCase() === "!endstream") {
       endAllSubbedStreams();
    }
}




//Gets a list of managable redeems
axios.get("https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id="+configuration.broadcaster_id+"&only_manageable_rewards=true",
    {
        headers:{
            "Content-Type": "application/json",
            "Client-ID": configuration.CLIENT_ID,
            "Authorization": "Bearer " + access_token
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