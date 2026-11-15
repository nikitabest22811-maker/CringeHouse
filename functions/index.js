const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

// ⚠️ ВСТАВЬ СЮДА СВОИ ДАННЫЕ ИЗ DISCORD DEVELOPER PORTAL ⚠️
const DISCORD_CLIENT_ID = "1571609214093361312"; 
const DISCORD_CLIENT_SECRET = "dZC2G7IMTwFH7__ntBhzLt4KPeyXsKry"; 
const DISCORD_REDIRECT_URI = "https://us-central1-watch-party-6986e.cloudfunctions.net/discordAuth";
const SITE_URL = "https://watch-party-6986e.web.app";

// Эта функция будет вызвана, когда Discord вернет пользователя
exports.discordAuth = functions.https.onRequest(async (req, res) => {
    // Разрешаем запросы с нашего сайта (CORS)
    res.set('Access-Control-Allow-Origin', '*');

    const code = req.query.code;
    if (!code) {
        return res.status(400).send("Ошибка: код авторизации не получен.");
    }

    try {
        // 1. Обмениваем код на токен доступа
        const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI,
            }),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        
        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
             throw new Error(tokenData.error_description);
        }
        const accessToken = tokenData.access_token;

        // 2. Получаем данные пользователя из Discord
        const userResponse = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const discordUser = await userResponse.json();

        // 3. Создаем пользователя в Firebase Auth
        const uid = `discord:${discordUser.id}`;
        try {
            await admin.auth().getUser(uid);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                await admin.auth().createUser({
                    uid: uid,
                    displayName: discordUser.global_name || discordUser.username,
                    photoURL: discordUser.avatar 
                        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` 
                        : null
                });
            }
        }

        // 4. Генерируем кастомный токен Firebase
        const firebaseToken = await admin.auth().createCustomToken(uid);

        // 5. Перенаправляем пользователя обратно на сайт с токеном в ссылке
        res.redirect(`${SITE_URL}/?token=${firebaseToken}`);
        
    } catch (error) {
        console.error("Ошибка Discord Auth:", error);
        res.status(500).send("Ошибка авторизации. Проверь логи терминала.");
    }
});