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
let myAvatar = localStorage.getItem("wp_avatar") || "";

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
  ytPlayer = new YT.Player('player', {
    height: '100%', width: '100%', videoId: '',
    playerVars: { 'playsinline': 1, 'rel': 0, 'origin': window.location.origin },
    events: { 'onReady': () => console.log("✅ Плеер готов!"), 'onStateChange': onPlayerStateChange }
  });
};

function onPlayerStateChange(event) {
  if (!ytPlayer || isRemoteAction) {
    if (isRemoteAction) isRemoteAction = false;
    return;
  }
  const videoId = ytPlayer.getVideoData().video_id;
  if (!videoId) return;
  
  window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState'), {
    videoId: videoId, state: event.data, time: ytPlayer.getCurrentTime(), timestamp: Date.now()
  });
}

// ---------- Загрузка видео ----------
document.getElementById("loadVideo").addEventListener("click", () => {
  const url = document.getElementById("videoUrl").value;
  if (!ytPlayer) { alert("Плеер ещё загружается."); return; }
  const parsed = parseVideoUrl(url);
  if (!parsed || parsed.type !== 'youtube') { alert("Поддерживается только YouTube"); return; }

  const loader = document.getElementById("videoLoader");
  if (loader) loader.style.display = "flex";

  ytPlayer.loadVideoById(parsed.id);
  setTimeout(() => { if (loader) loader.style.display = "none"; }, 3000);

  if (typeof window.firebaseSet !== 'undefined') {
      window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState'), {
        videoId: parsed.id, state: 1, time: 0, timestamp: Date.now()
      });
  }
  addSystemMessage(`▶ Загружено видео: ${url}`);
});

document.getElementById("videoUrl").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("loadVideo").click();
});

// ---------- Копирование и Табы ----------
document.getElementById("copyLink").addEventListener("click", () => {
  const inviteText = `🎬 Залетай в CringeHouse! Будем смотреть кино вместе: ${window.location.href}`;
  navigator.clipboard.writeText(inviteText).then(() => {
    const btn = document.getElementById("copyLink");
    btn.textContent = "Скопировано ✓"; btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Скопировать ссылку"; btn.classList.remove("copied"); }, 2000);
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
// FIREBASE
// =====================================================================
window.addEventListener('firebase-ready', () => {
  const sessionId = Math.random().toString(36).substring(2, 9);
  const userPresenceRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${sessionId}`);

  // --- 1. ПРОФИЛЬ ---
  const profileModal = document.getElementById("profileModal");
  const modalNameInput = document.getElementById("modalNameInput");
  const modalAvatarPreview = document.getElementById("modalAvatarPreview");
  const avatarFileInput = document.getElementById("avatarFileInput");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const profileBtn = document.getElementById("profileBtn");

  function updateProfileUI() {
    if (profileBtn) {
      if (myAvatar) {
        profileBtn.innerHTML = `<img src="${myAvatar}" class="msg-avatar-img" style="width:20px;height:20px;"> ${userName || 'Гость'}`;
      } else {
        profileBtn.textContent = `👤 ${userName || 'Гость'}`;
      }
    }
  }

  if (!userName) {
    profileModal.style.display = "flex";
  } else {
    updateProfileUI();
  }

  avatarFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => { modalAvatarPreview.src = event.target.result; };
      reader.readAsDataURL(file);
    }
  });

  profileBtn.addEventListener("click", () => {
    modalNameInput.value = userName || "";
    modalAvatarPreview.src = myAvatar || "";
    profileModal.style.display = "flex";
  });

  saveProfileBtn.onclick = () => {
    const newName = modalNameInput.value.trim();
    if (!newName) { alert("Введите никнейм!"); return; }
    
    userName = newName;
    localStorage.setItem("wp_userName", userName);

    if (modalAvatarPreview.src && modalAvatarPreview.src !== myAvatar) {
      myAvatar = modalAvatarPreview.src;
      localStorage.setItem("wp_avatar", myAvatar);
    }

    window.firebaseSet(userPresenceRef, { name: userName, avatar: myAvatar, joinedAt: Date.now() });
    updateProfileUI();
    profileModal.style.display = "none";
    addSystemMessage(`✏️ Профиль обновлен: ${userName}`);
  };

  // --- 2. ПРОСМОТР ПРОФИЛЯ УЧАСТНИКА ---
  const userProfileModal = document.getElementById("userProfileModal");
  const closeUserProfileBtn = document.getElementById("closeUserProfileBtn");
  const viewAvatar = document.getElementById("viewAvatar");
  const viewName = document.getElementById("viewName");

  closeUserProfileBtn.onclick = () => {
    userProfileModal.style.display = "none";
  };

  // Закрытие по клику на свободное поле (фон)
  userProfileModal.addEventListener("click", (e) => {
    if (e.target === userProfileModal) {
      userProfileModal.style.display = "none";
    }
  });

  // --- 3. УЧАСТНИКИ ---
  window.firebaseSet(userPresenceRef, { name: userName || "Гость", avatar: myAvatar, joinedAt: Date.now() });
  
  const systemMessagesRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/messages');
  if (userName) {
    window.firebasePush(systemMessagesRef, {
      author: "Система", text: `👋 ${userName} присоединился`, timestamp: Date.now(), isSystem: true
    });
  }

  window.onDisconnect(userPresenceRef).remove();
  const disconnectMessageRef = window.firebasePush(systemMessagesRef); 
  window.onDisconnect(disconnectMessageRef).set({
    author: "Система", text: `🚪 ${userName || "Гость"} покинул комнату`, timestamp: Date.now(), isSystem: true
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
      
      let avatarHtml = user.avatar ? `<img src="${user.avatar}" class="user-list-avatar">` : '👤';
      li.innerHTML = `${avatarHtml} ${user.name} ${isMe ? '<span style="color: var(--accent); font-size: 12px;">(Вы)</span>' : ''}`;
      
      // Разрешаем клик по любому участнику (включая себя)
      li.addEventListener("click", () => {
        viewAvatar.src = user.avatar || "https://via.placeholder.com/150x150?text=No+Photo";
        viewName.textContent = user.name + (isMe ? " (Вы)" : "");
        userProfileModal.style.display = "flex";
      });

      usersListElement.appendChild(li);
    });
  });

  // --- 4. СИНХРОНИЗАЦИЯ ВИДЕО ---
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
      isRemoteAction = true; ytPlayer.pauseVideo(); ytPlayer.seekTo(data.time);
    } else if (data.state === 1 && currentState === 2) { 
      isRemoteAction = true; ytPlayer.seekTo(data.time); ytPlayer.playVideo();
    }
  });

  // --- 5. ЧАТ ---
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
  document.addEventListener('click', () => { contextMenu.style.display = 'none'; });

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

    const avatarHtml = data.avatar ? `<img src="${data.avatar}" class="msg-avatar-img">` : '👤';

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
      <div class="msg-author">${avatarHtml} ${data.author}</div>
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
    sortedMessages.forEach(([id, data]) => renderMessage(id, data));
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    
    window.firebasePush(messagesRef, { 
      author: userName || "Гость", 
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

  // --- 6. ЭМОДЗИ ---
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
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.style.display = 'none';
    });
  }
});