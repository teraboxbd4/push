const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// গুরুত্বপূর্ণ: এখানে আপনার নতুন এবং সুরক্ষিত বট টোকেনটি বসান
const BOT_TOKEN = "8210843423:AAH29oQdtBdpv4mxVDRYEaYt9TG4pXb76vo";
const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

async function sendMessage(chatId, message) {
  try {
    await axios.post(TELEGRAM_API_URL, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(`Failed to send message to ${chatId}:`, error.message);
  }
}

exports.sendPushNotification = functions.database
  .ref("/push_notifications_queue/{pushId}")
  .onCreate(async (snapshot, context) => {
    const notificationData = snapshot.val();
    if (!notificationData) return null;

    const { target, title, message, specificUserId } = notificationData;
    const fullMessage = `<b>${title}</b>\n\n${message}`;
    let chatIds = [];

    // ইউজারের chat_id ডাটাবেসে সেভ করা থাকতে হবে
    const usersSnapshot = await admin.database().ref("/users").once("value");
    const allUsers = usersSnapshot.val();
    if (!allUsers) return snapshot.ref.remove();

    if (target === "specific" && specificUserId) {
      chatIds.push(specificUserId);
    } else {
      for (const userId in allUsers) {
        const user = allUsers[userId];
        const chatId = user.chat_id || userId; // chat_id না থাকলে userId ব্যবহার করবে

        if (target === "global") {
          chatIds.push(chatId);
        } else if (target === "inactive") {
          const settingsSnapshot = await admin.database().ref("/admin/settings").once("value");
          const inactivityDays = settingsSnapshot.val().inactivityThresholdDays || 7;
          const threshold = inactivityDays * 24 * 60 * 60 * 1000;

          if (user.lastActive && (Date.now() - new Date(user.lastActive).getTime() > threshold)) {
            chatIds.push(chatId);
          }
        }
      }
    }

    if (chatIds.length > 0) {
      const uniqueChatIds = [...new Set(chatIds)];
      console.log(`Sending notification to ${uniqueChatIds.length} users.`);
      const promises = uniqueChatIds.map(id => sendMessage(id, fullMessage));
      await Promise.all(promises);
    }

    return snapshot.ref.remove();
  });
