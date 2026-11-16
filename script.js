// ---------- Утилиты ----------
function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  let room = params.get("room");
  if (!room) {
    room = Math.random().toString(36).substring(2, 8);
    params.set("room", room);
    window.history.replaceState({}, "", "?" + params.toString());
  }
  return room;
}

const ROOM_ID = getRoomId();
document.getElementById("roomId").textContent = ROOM_ID;

let userName = localStorage.getItem("wp_userName");
if (!userName) {
  userName = "Гость" + Math.floor(Math.random() * 1000);
  localStorage.setItem("wp_userName", userName);
}

// ---------- Парсинг ссылок ----------
function parseVideoUrl(url) {
  url = url.trim();
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  if (ytMatch) return { type: "youtube", id: ytMatch[1] };
  return { type: "unknown", url };
}

// ---------- Системные сообщения ----------
function addSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "chat-message";
  el.innerHTML = `<div class="msg-system">${text}</div>`;
  document.getElementById("chatMessages").appendChild(el);
  document.getElementById("chatMessages").scrollTop = document.getElementById("chatMessages").scrollHeight;
}

// ---------- Инициализация YouTube ----------
let ytPlayer = null;
let isRemoteAction = false;

window.onYouTubeIframeAPIReady = function() {
  console.log("YouTube API загружен, создаем плеер...");
  ytPlayer = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: { 'playsinline': 1, 'rel': 0, 'origin': window.location.origin },
    events: {
      'onReady': () => console.log("✅ Плеер готов!"),
      'onStateChange': onPlayerStateChange
    }
  });
};

function onPlayerStateChange(event) {
  if (!ytPlayer || isRemoteAction) {
    if (isRemoteAction) isRemoteAction = false;
    return;
  }
  const videoId = ytPlayer.getVideoData().video_id;
  if (!videoId) return;
  const currentTime = ytPlayer.getCurrentTime();
  
  window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState'), {
    videoId: videoId,
    state: event.data, 
    time: currentTime,
    timestamp: Date.now()
  });
}

// ---------- Загрузка видео ----------
document.getElementById("loadVideo").addEventListener("click", () => {
  const url = document.getElementById("videoUrl").value;
  if (!ytPlayer) {
    alert("Плеер ещё загружается. Подожди 2 секунды.");
    return;
  }
  const parsed = parseVideoUrl(url);
  if (!parsed || parsed.type !== 'youtube') {
    alert("Пока поддерживается только YouTube");
    return;
  }
  ytPlayer.loadVideoById(parsed.id);
  
  if (typeof window.firebaseSet !== 'undefined') {
      window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState'), {
        videoId: parsed.id,
        state: 1,
        time: 0,
        timestamp: Date.now()
      });
  }
  addSystemMessage(`▶ Загружено видео: ${url}`);
});

document.getElementById("videoUrl").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("loadVideo").click();
});

// ---------- Копирование ссылки и Табы ----------
document.getElementById("copyLink").addEventListener("click", () => {
  navigator.clipboard.writeText(window.location.href);
  const btn = document.getElementById("copyLink");
  btn.textContent = "Скопировано ✓";
  setTimeout(() => (btn.textContent = "Скопировать ссылку"), 1500);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab + "Tab").classList.add("active");
  });
});


// =====================================================================
// ВСЁ, ЧТО СВЯЗАНО С FIREBASE, ЗАПУСКАЕМ ТОЛЬКО ПОСЛЕ ЕГО ЗАГРУЗКИ
// =====================================================================
window.addEventListener('firebase-ready', () => {
  console.log("Firebase готов, настраиваем профиль, участников и чат...");
  
  const sessionId = Math.random().toString(36).substring(2, 9);

  // --- 1. ПРОФИЛЬ ---
  function updateProfileUI() {
    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn) profileBtn.textContent = `👤 ${userName}`;
  }
  updateProfileUI();

  const userPresenceRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${sessionId}`);

  document.getElementById("profileBtn").addEventListener("click", () => {
    const newName = prompt("Введите ваше имя:", userName);
    if (newName && newName.trim() !== "") {
      userName = newName.trim();
      localStorage.setItem("wp_userName", userName);
      updateProfileUI();
      addSystemMessage(`✏️ Вы сменили имя на: ${userName}`);
      
      // ИСПРАВЛЕНО: window.firebaseSet вместо window.set
      window.firebaseSet(userPresenceRef, { name: userName, joinedAt: Date.now() }); 
    }
  });

  // --- 2. УЧАСТНИКИ ---
  // ИСПРАВЛЕНО: window.firebaseSet вместо window.set
  window.firebaseSet(userPresenceRef, { name: userName, joinedAt: Date.now() });
  window.onDisconnect(userPresenceRef).remove();

  const usersListRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users`);
  const usersListElement = document.getElementById("usersList");

  window.firebaseOnValue(usersListRef, (snapshot) => {
    const usersData = snapshot.val();
    if (!usersData) {
      usersListElement.innerHTML = '<li style="color: var(--text-muted); font-style: italic;">Пока никого нет...</li>';
      return;
    }
    usersListElement.innerHTML = ""; 
    const users = Object.values(usersData);
    users.sort((a, b) => a.joinedAt - b.joinedAt);

    users.forEach((user) => {
      const li = document.createElement("li");
      const isMe = user.name === userName;
      li.innerHTML = `👤 ${user.name} ${isMe ? '<span style="color: var(--accent); font-size: 12px;">(Вы)</span>' : ''}`;
      usersListElement.appendChild(li);
    });
  });

  // --- 3. СИНХРОНИЗАЦИЯ ВИДЕО ---
  const videoStateRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState');
  window.firebaseOnValue(videoStateRef, (snapshot) => {
    const data = snapshot.val();
    if (!data || !data.videoId || !ytPlayer) return;

    const currentVideoId = ytPlayer.getVideoData().video_id;
    
    if (currentVideoId !== data.videoId) {
      isRemoteAction = true;
      ytPlayer.loadVideoById(data.videoId, data.time);
      setTimeout(() => {
        if (data.state === 2) ytPlayer.pauseVideo();
        else if (data.state === 1) ytPlayer.playVideo();
      }, 1000);
      return;
    }

    const currentState = ytPlayer.getPlayerState();
    if (data.state === 2 && currentState === 1) { 
      isRemoteAction = true;
      ytPlayer.pauseVideo();
      ytPlayer.seekTo(data.time);
    } else if (data.state === 1 && currentState === 2) { 
      isRemoteAction = true;
      ytPlayer.seekTo(data.time);
      ytPlayer.playVideo();
    }
  });

    // --- 4. ЧАТ С ИСТОРИЕЙ И РЕАКЦИЯМИ ---
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const messagesRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/messages');

  // Функция для отрисовки одного сообщения
  function renderMessage(msgId, data) {
    // Проверяем, нет ли уже такого сообщения на экране (чтобы не дублировать)
    if (document.getElementById(`msg-${msgId}`)) return;

    const el = document.createElement("div");
    el.className = "chat-message";
    el.id = `msg-${msgId}`;
    
    const isMe = data.author === userName;
    if (isMe) el.classList.add("my-message");

    // Считаем лайки (если их нет, то 0)
    const likesCount = data.reactions && data.reactions.like ? data.reactions.like : 0;

    el.innerHTML = `
      <div class="msg-author">${data.author}</div>
      <div class="msg-text">${data.text}</div>
      <div class="msg-reactions">
        <button class="reaction-btn" onclick="toggleLike('${msgId}', ${likesCount})">
          ❤️ <span id="like-count-${msgId}">${likesCount > 0 ? likesCount : ''}</span>
        </button>
      </div>
    `;
    
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Функция для загрузки всех старых сообщений при входе
  window.firebaseOnValue(messagesRef, (snapshot) => {
    const messagesData = snapshot.val();
    if (!messagesData) return;

    // Сортируем сообщения по времени (чтобы старые были сверху)
    const sortedMessages = Object.entries(messagesData).sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Очищаем чат перед загрузкой (чтобы не было дублей при обновлении)
    chatMessages.innerHTML = ""; 
    sortedMessages.forEach(([id, data]) => {
      renderMessage(id, data);
    });
  });

  // Отправка нового сообщения
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    
    window.firebasePush(messagesRef, { 
      author: userName, 
      text: text, 
      timestamp: Date.now(),
      reactions: { like: 0 } // Создаем поле для лайков
    });
    
    chatInput.value = "";
  });

  // Функция для постановки/снятия лайка
  window.toggleLike = function(msgId, currentLikes) {
    const likeRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/messages/${msgId}/reactions/like`);
    
    // Если лайк уже есть (больше 0), уменьшаем, если нет - увеличиваем
    const newCount = currentLikes > 0 ? currentLikes - 1 : 1;
    
    window.firebaseSet(likeRef, newCount);
  };
// ---------- ЭМОДЗИ ДЛЯ ЧАТА ----------
const emojiList = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', 
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', 
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', 
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', 
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', 
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', 
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', 
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', 
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', 
  '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', 
  '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
  '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', 
  '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', 
  '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', 
  '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🔥',
  '💯', '💢', '💥', '💫', '💦', '💨', '🕳', '💣', '💬', '👁️‍🗨️'
];

// Находим элементы
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const chatInputElement = document.getElementById('chatInput');

// Заполняем панель эмодзи
if (emojiPicker) {
  emojiList.forEach(emoji => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.addEventListener('click', () => {
      chatInputElement.value += emoji; // Добавляем эмодзи в поле ввода
      chatInputElement.focus();        // Возвращаем фокус
    });
    emojiPicker.appendChild(span);
  });
}

// Открываем/закрываем панель
if (emojiBtn) {
  emojiBtn.addEventListener('click', (e) => {
    e.preventDefault(); // Чтобы кнопка не отправляла форму
    if (emojiPicker.style.display === 'none' || emojiPicker.style.display === '') {
      emojiPicker.style.display = 'grid';
    } else {
      emojiPicker.style.display = 'none';
    }
  });
}

// Закрываем панель при клике вне её
document.addEventListener('click', (e) => {
  if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.style.display = 'none';
  }
});