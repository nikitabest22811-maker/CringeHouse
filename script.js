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
let isRemoteVolumeChange = false;

window.onYouTubeIframeAPIReady = function() {
  console.log("YouTube API загружен, создаем плеер...");
  ytPlayer = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: { 'playsinline': 1, 'rel': 0, 'origin': window.location.origin },
    events: {
      'onReady': (event) => {
        console.log("✅ Плеер готов!");
        
        // Слушаем изменение громкости нашим пользователем
        event.target.addEventListener('onVolumeChange', () => {
            const vol = event.target.getVolume();
            if (!isRemoteVolumeChange && typeof window.firebaseSet !== 'undefined') {
                window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/volume'), vol);
            }
        });
      },
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

// ---------- Загрузка видео с лоадером ----------
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

  const loader = document.getElementById("videoLoader");
  if (loader) loader.style.display = "flex";

  ytPlayer.loadVideoById(parsed.id);
  
  setTimeout(() => {
    if (loader) loader.style.display = "none";
  }, 3000);

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

// ---------- Копирование ссылки с приглашением ----------
document.getElementById("copyLink").addEventListener("click", () => {
  const roomUrl = window.location.href;
  const inviteText = `🎬 Залетай в CringeHouse! Будем смотреть кино вместе: ${roomUrl}`;
  
  navigator.clipboard.writeText(inviteText).then(() => {
    const btn = document.getElementById("copyLink");
    const originalText = btn.textContent;
    
    btn.textContent = "Скопировано ✓";
    btn.classList.add("copied");
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove("copied");
    }, 2000);
  }).catch(err => {
    console.error("Ошибка копирования:", err);
    alert("Не удалось скопировать ссылку. Попробуй вручную.");
  });
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

  // --- 1. ПРОФИЛЬ И АВАТАР ---
  function updateProfileUI() {
    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn) {
      const currentAvatar = localStorage.getItem("wp_avatar") || '👤';
      profileBtn.textContent = `${currentAvatar} ${userName}`;
    }
  }
  updateProfileUI();

  const userPresenceRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${sessionId}`);
  
  const avatars = ['👤', '🦊', '🐼', '🐸', '🐯', '🐨', '🦁', '🐵', '🐧', '🦉', '🦄', '🐙', '🦖', '🐺', '🐻', '🐷'];
  let myAvatar = localStorage.getItem("wp_avatar") || '👤';

  const profileModal = document.getElementById("profileModal");
  const modalNameInput = document.getElementById("modalNameInput");
  const avatarGrid = document.getElementById("avatarGrid");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const cancelProfileBtn = document.getElementById("cancelProfileBtn");

  let selectedAvatar = myAvatar;
  avatars.forEach(emoji => {
    const div = document.createElement("div");
    div.className = `avatar-option ${emoji === myAvatar ? 'selected' : ''}`;
    div.textContent = emoji;
    div.onclick = () => {
      document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedAvatar = emoji;
    };
    avatarGrid.appendChild(div);
  });

  document.getElementById("profileBtn").addEventListener("click", () => {
    modalNameInput.value = userName;
    selectedAvatar = myAvatar;
    document.querySelectorAll('.avatar-option').forEach(el => {
      if (el.textContent === myAvatar) el.classList.add('selected');
      else el.classList.remove('selected');
    });
    profileModal.style.display = "flex";
  });

  cancelProfileBtn.onclick = () => {
    profileModal.style.display = "none";
  };

  saveProfileBtn.onclick = () => {
    const newName = modalNameInput.value.trim();
    if (!newName) {
      alert("Имя не может быть пустым!");
      return;
    }

    if (newName !== userName) {
      userName = newName;
      localStorage.setItem("wp_userName", userName);
      addSystemMessage(`✏️ Вы сменили имя на: ${userName}`);
    }

    if (selectedAvatar !== myAvatar) {
      myAvatar = selectedAvatar;
      localStorage.setItem("wp_avatar", myAvatar);
      addSystemMessage(`🖼️ Вы сменили аватар на ${myAvatar}`);
    }

    window.firebaseSet(userPresenceRef, { name: userName, avatar: myAvatar, joinedAt: Date.now() });
    updateProfileUI();
    profileModal.style.display = "none";
  };

  // --- 2. УЧАСТНИКИ И УВЕДОМЛЕНИЯ ---
  window.firebaseSet(userPresenceRef, { name: userName, avatar: myAvatar, joinedAt: Date.now() });
  
  const systemMessagesRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/messages');
  
  window.firebasePush(systemMessagesRef, {
    author: "Система",
    text: `👋 ${userName} присоединился к комнате`,
    timestamp: Date.now(),
    isSystem: true
  });

  window.onDisconnect(userPresenceRef).remove();
  
  const disconnectMessageRef = window.firebasePush(systemMessagesRef); 
  window.onDisconnect(disconnectMessageRef).set({
    author: "Система",
    text: `🚪 ${userName} покинул комнату`,
    timestamp: Date.now(),
    isSystem: true
  });

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
      const userAvatar = user.avatar || '👤';
      li.innerHTML = `${userAvatar} ${user.name} ${isMe ? '<span style="color: var(--accent); font-size: 12px;">(Вы)</span>' : ''}`;
      usersListElement.appendChild(li);
    });
  });

  // --- 3. СИНХРОНИЗАЦИЯ ВИДЕО И ГРОМКОСТИ ---
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

  // Синхронизация громкости
  const volumeRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/volume');
  window.firebaseOnValue(volumeRef, (snapshot) => {
    const vol = snapshot.val();
    if (vol !== null && ytPlayer && typeof ytPlayer.setVolume === 'function') {
      isRemoteVolumeChange = true; 
      ytPlayer.setVolume(vol);
      showVolumeIndicator(vol);
      setTimeout(() => { isRemoteVolumeChange = false; }, 100);
    }
  });

  function showVolumeIndicator(vol) {
    let indicator = document.getElementById('volume-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'volume-indicator';
      indicator.className = 'volume-indicator';
      document.body.appendChild(indicator);
    }
    indicator.textContent = `🔊 Громкость: ${vol}%`;
    indicator.style.display = 'block';
    setTimeout(() => { indicator.style.display = 'none'; }, 2000);
  }

  // --- 4. ЧАТ С ИСТОРИЕЙ И РЕАКЦИЯМИ ---
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const messagesRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/messages');

  const reactionEmojis = ['❤️', '😂', '🔥', '👍', '😮', '😢', '🎉'];

  const contextMenu = document.createElement('div');
  contextMenu.className = 'reaction-context-menu';
  contextMenu.style.display = 'none';
  reactionEmojis.forEach(emoji => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.onclick = (e) => {
      e.stopPropagation();
      const msgId = contextMenu.dataset.msgId;
      if (msgId) window.toggleReaction(msgId, emoji);
      contextMenu.style.display = 'none';
    };
    contextMenu.appendChild(span);
  });
  document.body.appendChild(contextMenu);

  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  function renderMessage(msgId, data) {
    if (document.getElementById(`msg-${msgId}`)) return;

    const el = document.createElement("div");
    el.className = "chat-message";
    el.id = `msg-${msgId}`;
    
    if (data.isSystem) {
      el.innerHTML = `<div class="msg-system">${data.text}</div>`;
      chatMessages.appendChild(el);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return;
    }

    const isMe = data.author === userName;
    if (isMe) el.classList.add("my-message");

    const authorAvatar = data.avatar || '👤';

    let reactionsHtml = '';
    if (data.reactions) {
      const reactionCounts = {};
      Object.values(data.reactions).forEach(emoji => {
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
      });

      for (const [emoji, count] of Object.entries(reactionCounts)) {
        const myReaction = data.reactions[sessionId] === emoji;
        reactionsHtml += `<div class="reaction-badge ${myReaction ? 'my-reaction' : ''}" onclick="window.toggleReaction('${msgId}', '${emoji}')">${emoji} ${count}</div>`;
      }
    }

    el.innerHTML = `
      <div class="msg-author">${authorAvatar} ${data.author}</div>
      <div class="msg-text">${data.text}</div>
      <div class="msg-reactions-display">${reactionsHtml}</div>
    `;
    
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu.dataset.msgId = msgId;
      const rect = el.getBoundingClientRect();
      const menuWidth = contextMenu.offsetWidth || 250;
      let leftPos = rect.left + (rect.width / 2) - (menuWidth / 2);
      let topPos = rect.top - 45;
      if (leftPos < 10) leftPos = 10;
      if (topPos < 10) topPos = rect.bottom + 10;
      contextMenu.style.left = `${leftPos + window.scrollX}px`;
      contextMenu.style.top = `${topPos + window.scrollY}px`;
      contextMenu.style.display = 'flex';
    });

    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  window.firebaseOnValue(messagesRef, (snapshot) => {
    const messagesData = snapshot.val();
    if (!messagesData) return;

    const sortedMessages = Object.entries(messagesData).sort((a, b) => a[1].timestamp - b[1].timestamp);

    chatMessages.innerHTML = ""; 
    sortedMessages.forEach(([id, data]) => {
      renderMessage(id, data);
    });
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    
    window.firebasePush(messagesRef, { 
      author: userName, 
      avatar: myAvatar,
      text: text, 
      timestamp: Date.now(),
      reactions: {}
    });
    
    chatInput.value = "";
  });

  window.toggleReaction = function(msgId, emoji) {
    const reactionRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/messages/${msgId}/reactions/${sessionId}`);
    window.firebaseSet(reactionRef, emoji);
  };

  // --- 5. ЭМОДЗИ ДЛЯ ВВОДА ТЕКСТА ---
  const emojiList = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🔥', '💯', '💢', '💥', '💫', '💦', '💨', '🕳', '💣', '💬', '👁️‍🗨️'
  ];

  const emojiBtn = document.getElementById('emojiBtn');
  const emojiPicker = document.getElementById('emojiPicker');
  const chatInputElement = document.getElementById('chatInput');

  if (emojiPicker && emojiBtn) {
    emojiList.forEach(emoji => {
      const span = document.createElement('span');
      span.textContent = emoji;
      span.addEventListener('click', () => {
        chatInputElement.value += emoji; 
        chatInputElement.focus();        
      });
      emojiPicker.appendChild(span);
    });

    emojiBtn.addEventListener('click', (e) => {
      e.preventDefault(); 
      emojiPicker.style.display = (emojiPicker.style.display === 'none' || emojiPicker.style.display === '') ? 'grid' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.style.display = 'none';
      }
    });
  }
});