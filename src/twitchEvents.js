const configuration = require('./configs/configTest');

const typesConfig = {
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

const types = [
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

module.exports = {typesConfig, types};