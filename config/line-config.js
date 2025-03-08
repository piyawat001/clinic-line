// Line API configuration
require('dotenv').config();

module.exports = {
  channelId: process.env.LINE_CHANNEL_ID,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  notifyToken: process.env.LINE_NOTIFY_TOKEN
};