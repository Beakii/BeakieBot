# BeakieBot Twitch Event Listener

BeakieBot is a JavaScript based bot that listens to the EventSub API from Twitch and interacts with the 7TV API endpoints.

---
## Functionality - Currently implemented
- **Twitch Specific**
  - Create Channel Point Reward Redemptions
  - Listen to Channel Point Reward Redemptions

- **7TV Specific**
  - Add 7TV Emote
  - Remove 7TV Emote
---
## ToDo
- ~~Refactor to split server/bot functions~~
- Implement database connections to store and read tokens
- Implement OAuth token implicit grant flow
- Redo the error checking flow before making HTTP requests to 7TV
- Extend support for chat-based interactions through a commands list