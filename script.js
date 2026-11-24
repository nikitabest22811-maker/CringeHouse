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
document.getElementById("roomId").textContent = ROOM_ID || "—";

let userName = localStorage.getItem("wp_userName");
let myAvatar = localStorage.getItem("wp_avatar") || "";
let myColor = localStorage.getItem("wp_color") || "#7c5cff";
let myHat = localStorage.getItem("wp_hat") || "";
let myRole = "user";
let roomHostId = null;
let myXp = parseInt(localStorage.getItem("wp_xp")) || 0;

// --- Функция уровней ---
function getLevelInfo(xp) {
  const level = Math.floor(xp / 100) + 1;
  const progress = xp % 100;
  
  let title = "Новичок";
  let frameColor = "#7c5cff";
  
  if (level >= 20) { title = "Бог CringeHouse"; frameColor = "#00ffcc"; }
  else if (level >= 15) { title = "Легенда"; frameColor = "#ffd700"; }
  else if (level >= 10) { title = "Кинокритик"; frameColor = "#c0c0c0"; }
  else if (level >= 5) { title = "Завсегдатай"; frameColor = "#cd7f32"; }
  else if (level >= 3) { title = "Зритель"; }
  
  return { level, progress, title, frameColor };
}

// Функция начисления XP
function gainXp(amount) {
  myXp += amount;
  localStorage.setItem("wp_xp", myXp);
  
  const newLevel = Math.floor(myXp / 100) + 1;
  const oldLevel = Math.floor((myXp - amount) / 100) + 1;
  
  if (newLevel > oldLevel) {
    addSystemMessage(`🎉 Поздравляем! Вы достигли ${newLevel} уровня!`);
  }
}

// --- ТЕМЫ ---
const themes = ['', 'theme-light', 'theme-neon', 'theme-midnight'];
let currentThemeIndex = parseInt(localStorage.getItem("wp_theme")) || 0;
document.body.className = themes[currentThemeIndex];

const themeBtn = document.getElementById("themeBtn");
const themeModal = document.getElementById("themeModal");
const closeThemeModalBtn = document.getElementById("closeThemeModalBtn");

if (themeBtn) themeBtn.addEventListener("click", () => {
  themeModal.style.display = "flex";
  document.querySelectorAll(".theme-card").forEach(card => {
    card.classList.toggle("active", parseInt(card.dataset.theme) === currentThemeIndex);
  });
});
if (closeThemeModalBtn) {
  closeThemeModalBtn.addEventListener("click", () => { themeModal.style.display = "none"; });
  themeModal.addEventListener("click", (e) => { if (e.target === themeModal) themeModal.style.display = "none"; });
}
document.querySelectorAll(".theme-card").forEach(card => {
  card.addEventListener("click", () => {
    currentThemeIndex = parseInt(card.dataset.theme);
    document.body.className = themes[currentThemeIndex];
    localStorage.setItem("wp_theme", currentThemeIndex);
    document.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    setTimeout(() => { themeModal.style.display = "none"; }, 300);
  });
});

// --- Парсинг ссылок (Shorts) ---
function parseVideoUrl(url) {
  url = url.trim();
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  if (ytMatch) return { type: "youtube", id: ytMatch[1] };
  return { type: "unknown", url };
}

// --- Системные сообщения ---
function addSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "chat-message";
  el.innerHTML = `<div class="msg-system">${text}</div>`;
  document.getElementById("chatMessages").appendChild(el);
  document.getElementById("chatMessages").scrollTop = document.getElementById("chatMessages").scrollHeight;
}

// --- Инициализация YouTube ---
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
  if (myRole === 'host' || myRole === 'moderator') {
    const videoId = ytPlayer.getVideoData().video_id;
    if (!videoId) return;
    window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState'), {
      videoId: videoId, state: event.data, time: ytPlayer.getCurrentTime(), timestamp: Date.now()
    });
  }
}

// --- Загрузка видео (с поддержкой Shorts) ---
document.getElementById("loadVideo").addEventListener("click", () => {
  if (myRole !== 'host' && myRole !== 'moderator') {
    alert("Только ведущий или модератор может запускать видео!");
    return;
  }
  const url = document.getElementById("videoUrl").value;
  if (!ytPlayer) { alert("Плеер ещё загружается."); return; }
  const parsed = parseVideoUrl(url);
  if (!parsed || parsed.type !== 'youtube') { alert("Поддерживается только YouTube"); return; }

  const isShorts = url.includes('/shorts/');
  const playerContainer = document.getElementById("player");
  
  if (isShorts) {
    playerContainer.classList.add("shorts-mode");
  } else {
    playerContainer.classList.remove("shorts-mode");
  }

  const loader = document.getElementById("videoLoader");
  if (loader) loader.style.display = "flex";

  ytPlayer.loadVideoById(parsed.id);
  setTimeout(() => { if (loader) loader.style.display = "none"; }, 3000);

  window.firebaseSet(window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/videoState'), {
    videoId: parsed.id, state: 1, time: 0, timestamp: Date.now()
  });
  addSystemMessage(`▶ Запущено видео: ${url}`);
});

document.getElementById("videoUrl").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("loadVideo").click();
});

// --- Копирование и Табы ---
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
  if (!ROOM_ID) return;

  const sessionId = Math.random().toString(36).substring(2, 9);
  const userPresenceRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${sessionId}`);
  const hostRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/hostId`);

  // --- 1. ПРОФИЛЬ ---
  const profileModal = document.getElementById("profileModal");
  const modalNameInput = document.getElementById("modalNameInput");
  const modalAvatarPreview = document.getElementById("modalAvatarPreview");
  const avatarFileInput = document.getElementById("avatarFileInput");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const profileBtn = document.getElementById("profileBtn");
  
  const avatarPreviewContainer = document.getElementById("avatarPreviewContainer");
  const hatPreview = document.getElementById("hatPreview");
  const hatPicker = document.getElementById("hatPicker");

  let tempHat = myHat;

  function applyPreviewStyles() {
    const levelInfo = getLevelInfo(myXp);
    avatarPreviewContainer.style.borderColor = levelInfo.frameColor;
    avatarPreviewContainer.style.boxShadow = `0 0 15px ${levelInfo.frameColor}`;
    
    if (tempHat) { hatPreview.textContent = tempHat; hatPreview.style.display = "block"; }
    else { hatPreview.style.display = "none"; }
  }

  function updateProfileUI() {
    if (profileBtn) {
      const levelInfo = getLevelInfo(myXp);
      if (myAvatar) {
        const hatHtml = myHat ? `<div class="header-hat">${myHat}</div>` : '';
        profileBtn.innerHTML = `
          <div class="header-avatar-container" style="border-color: ${levelInfo.frameColor}; box-shadow: 0 0 10px ${levelInfo.frameColor};">
            <img src="${myAvatar}" class="msg-avatar-img" style="border: none;">
            ${hatHtml}
          </div> 
          <span>${userName || 'Гость'}</span>
        `;
      } else {
        profileBtn.innerHTML = `<span style="font-size:16px;">👤</span> ${userName || 'Гость'}`;
      }
    }
  }

  if (!userName) {
    profileModal.style.display = "flex";
  } else {
    updateProfileUI();
  }

  hatPicker.querySelectorAll(".hat-option").forEach(opt => {
    opt.addEventListener("click", () => {
      hatPicker.querySelectorAll(".hat-option").forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      tempHat = opt.dataset.hat;
      applyPreviewStyles();
    });
  });

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
    tempHat = myHat;
    
    const levelInfo = getLevelInfo(myXp);
    document.getElementById("modalLevelText").textContent = `Уровень ${levelInfo.level}`;
    document.getElementById("modalXpText").textContent = `${levelInfo.progress} / 100 XP`;
    document.getElementById("modalXpBar").style.width = `${levelInfo.progress}%`;
    document.getElementById("modalTitleText").textContent = `Титул: ${levelInfo.title}`;
    
    hatPicker.querySelectorAll(".hat-option").forEach(o => { o.classList.toggle("selected", o.dataset.hat === myHat); });
    applyPreviewStyles();
    profileModal.style.display = "flex";
  });

  saveProfileBtn.onclick = () => {
    const newName = modalNameInput.value.trim();
    if (!newName) { alert("Введите никнейм!"); return; }
    
    userName = newName;
    myHat = tempHat;
    
    localStorage.setItem("wp_userName", userName);
    localStorage.setItem("wp_hat", myHat);

    if (modalAvatarPreview.src && modalAvatarPreview.src !== myAvatar) {
      myAvatar = modalAvatarPreview.src;
      localStorage.setItem("wp_avatar", myAvatar);
    }

    if (!roomHostId) {
      window.firebaseSet(hostRef, sessionId);
      myRole = 'host';
    }

    window.firebaseSet(userPresenceRef, { 
      name: userName, avatar: myAvatar, color: myColor, hat: myHat, role: myRole, xp: myXp, joinedAt: Date.now() 
    });
    
    updateProfileUI();
    profileModal.style.display = "none";
    addSystemMessage(`✏️ Профиль обновлен: ${userName}`);
  };

  // --- 2. ПРОСМОТР ПРОФИЛЯ И РОЛИ ---
  const userProfileModal = document.getElementById("userProfileModal");
  const closeUserProfileBtn = document.getElementById("closeUserProfileBtn");
  const viewAvatar = document.getElementById("viewAvatar");
  const viewName = document.getElementById("viewName");
  const viewAvatarWrapper = document.getElementById("viewAvatarWrapper");
  const viewHat = document.getElementById("viewHat");
  const adminControls = document.getElementById("adminControls");

  let selectedUserId = null;

  closeUserProfileBtn.onclick = () => { userProfileModal.style.display = "none"; };
  userProfileModal.addEventListener("click", (e) => { if (e.target === userProfileModal) userProfileModal.style.display = "none"; });

  document.getElementById("makeHostBtn").onclick = () => {
    if (myRole !== 'host' || !selectedUserId) return;
    window.firebaseSet(hostRef, selectedUserId);
    window.firebaseSet(window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${selectedUserId}/role`), 'host');
    window.firebaseSet(userPresenceRef, { role: 'moderator' }); 
    userProfileModal.style.display = "none";
    addSystemMessage(`👑 Права ведущего переданы!`);
  };

  document.getElementById("makeModBtn").onclick = () => {
    if (myRole !== 'host' || !selectedUserId) return;
    window.firebaseSet(window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${selectedUserId}/role`), 'moderator');
    userProfileModal.style.display = "none";
    addSystemMessage(`🛡️ Назначен новый модератор!`);
  };

  document.getElementById("kickBtn").onclick = () => {
    if (myRole !== 'host' || !selectedUserId) return;
    window.firebaseSet(window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/users/${selectedUserId}`), null);
    userProfileModal.style.display = "none";
    addSystemMessage(`🚫 Пользователь удален из комнаты.`);
  };

  // --- 3. ОПРЕДЕЛЕНИЕ РОЛИ И УЧАСТНИКИ ---
  window.firebaseOnValue(hostRef, (snapshot) => {
    roomHostId = snapshot.val();
    
    if (!roomHostId && userName) {
      window.firebaseSet(hostRef, sessionId);
      myRole = 'host';
      roomHostId = sessionId;
      window.firebaseSet(userPresenceRef, { role: 'host' });
    } else if (roomHostId && roomHostId !== sessionId) {
      if (myRole !== 'moderator' && myRole !== 'host') myRole = 'user';
    }

    const controls = document.getElementById('hostControls');
    const status = document.getElementById('hostStatus');
    if (myRole === 'host' || myRole === 'moderator') {
      controls.style.display = 'flex';
      status.textContent = myRole === 'host' ? 'Вы — Ведущий 👑' : 'Вы — Модератор 🛡️';
    } else {
      controls.style.display = 'none';
    }
  }, { onlyOnce: true });

  if (userName) {
    window.firebaseSet(userPresenceRef, { 
      name: userName, avatar: myAvatar, color: myColor, hat: myHat, role: myRole, xp: myXp, joinedAt: Date.now() 
    });
  }
  
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
    if (!usersData) { usersListElement.innerHTML = '<li style="color: var(--text-muted); font-style: italic;">Пока никого нет...</li>'; return; }
    usersListElement.innerHTML = ""; 
    const users = Object.entries(usersData);
    users.sort((a, b) => a[1].joinedAt - b[1].joinedAt);

    users.forEach(([id, user]) => {
      const li = document.createElement("li");
      const isMe = id === sessionId;
      
      let roleIcon = user.role === 'host' ? '👑 ' : user.role === 'moderator' ? '🛡️ ' : '';
      let avatarHtml = user.avatar ? `<img src="${user.avatar}" class="user-list-avatar" style="border-color: ${user.color || 'var(--border)'};">` : '👤';
      
      const displayName = user.name || "Неизвестный";
      li.innerHTML = `${avatarHtml} <span>${roleIcon}${displayName} ${isMe ? '<span style="color: var(--accent); font-size: 12px;">(Вы)</span>' : ''}</span>`;
      
      li.addEventListener("click", () => {
        selectedUserId = id;
        viewAvatar.src = user.avatar || "https://via.placeholder.com/150x150?text=No+Photo";
        viewAvatarWrapper.style.borderColor = user.color || "var(--accent)";
        viewHat.textContent = user.hat || "";
        viewHat.style.display = user.hat ? "block" : "none";
        viewName.textContent = displayName + (isMe ? " (Вы)" : "");
        
        adminControls.style.display = (myRole === 'host' && !isMe) ? "flex" : "none";
        userProfileModal.style.display = "flex";
      });

      usersListElement.appendChild(li);
    });
  });

  window.firebaseOnValue(userPresenceRef, (snapshot) => {
    const data = snapshot.val();
    if (data && data.role && data.role !== myRole) {
      myRole = data.role;
      document.getElementById('hostControls').style.display = (myRole === 'host' || myRole === 'moderator') ? 'flex' : 'none';
      document.getElementById('hostStatus').textContent = myRole === 'host' ? 'Вы — Ведущий 👑' : (myRole === 'moderator' ? 'Вы — Модератор 🛡️' : '');
    }
  });

  // --- 4. ОЧЕРЕДЬ ---
  const queueRef = window.firebaseRef(window.firebaseDB, 'rooms/' + ROOM_ID + '/queue');
  const queueList = document.getElementById('queueList');
  const queueInput = document.getElementById('queueInput');
  const addToQueueBtn = document.getElementById('addToQueueBtn');

  window.firebaseOnValue(queueRef, (snapshot) => {
    const queueData = snapshot.val();
    if (!queueData) { queueList.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">Очередь пуста...</p>'; return; }
    queueList.innerHTML = '';
    Object.entries(queueData).forEach(([id, item]) => {
      const div = document.createElement('div');
      div.className = 'queue-item';
      const removeBtn = (myRole === 'host' || myRole === 'moderator') ? `<button class="queue-item-remove" onclick="removeFromQueue('${id}')">✕</button>` : '';
      div.innerHTML = `
        <div class="queue-item-info">
          <span class="queue-item-title">🎬 ${item.title || 'Видео'} ${item.isShorts ? '📱' : ''}</span>
          <span class="queue-item-author">Предложил: ${item.addedBy}</span>
        </div>
        ${removeBtn}
      `;
      queueList.appendChild(div);
    });
  });

  addToQueueBtn.addEventListener('click', () => {
    const url = queueInput.value.trim();
    if (!url) return;
    const parsed = parseVideoUrl(url);
    if (!parsed || parsed.type !== 'youtube') { alert("Только YouTube!"); return; }
    
    const isShorts = url.includes('/shorts/');
    gainXp(10); // Начисляем XP за добавление в очередь

    window.firebasePush(queueRef, {
      videoId: parsed.id, 
      title: "Видео " + parsed.id.substring(0, 4), 
      addedBy: userName || "Гость", 
      isShorts: isShorts,
      timestamp: Date.now()
    });
    queueInput.value = "";
  });

  window.removeFromQueue = function(id) {
    if (myRole !== 'host' && myRole !== 'moderator') return;
    window.firebaseSet(window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/queue/${id}`), null);
  };

  document.getElementById('hostSkip').addEventListener('click', () => {
    if (myRole !== 'host' && myRole !== 'moderator') return;
    window.firebaseOnValue(queueRef, (snap) => {
      const items = Object.entries(snap.val() || {});
      if (items.length > 0) {
        const [id, item] = items[0];
        
        const playerContainer = document.getElementById("player");
        if (item.isShorts) {
          playerContainer.classList.add("shorts-mode");
        } else {
          playerContainer.classList.remove("shorts-mode");
        }

        ytPlayer.loadVideoById(item.videoId);
        window.firebaseSet(window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/queue/${id}`), null);
      } else { alert("Очередь пуста!"); }
    }, { onlyOnce: true });
  });

  // --- 5. СИНХРОНИЗАЦИЯ ВИДЕО ---
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
    if (data.state === 2 && currentState === 1) { isRemoteAction = true; ytPlayer.pauseVideo(); ytPlayer.seekTo(data.time); }
    else if (data.state === 1 && currentState === 2) { isRemoteAction = true; ytPlayer.seekTo(data.time); ytPlayer.playVideo(); }
  });

  // --- 6. ЧАТ ---
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
      chatMessages.appendChild(el); chatMessages.scrollTop = chatMessages.scrollHeight; return;
    }
    const isMe = data.author === userName;
    if (isMe) el.classList.add("my-message");

    const authorXp = data.xp || 0;
    const authorLevel = getLevelInfo(authorXp);

    let avatarHtml = '';
    if (data.avatar) {
      const hatHtml = data.hat ? `<div class="chat-hat" style="font-size: 18px;">${data.hat}</div>` : '';
      avatarHtml = `<div class="chat-avatar-container" style="border: 2px solid ${authorLevel.frameColor}; box-shadow: 0 0 5px ${authorLevel.frameColor}; border-radius: 50%;"><img src="${data.avatar}" class="msg-avatar-img" style="border: none;">${hatHtml}</div>`;
    } else { avatarHtml = '👤'; }

    let reactionsHtml = '';
    if (data.reactions) {
      const reactionCounts = {};
      Object.values(data.reactions).forEach(emoji => { reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1; });
      for (const [emoji, count] of Object.entries(reactionCounts)) {
        const myReaction = data.reactions[sessionId] === emoji;
        reactionsHtml += `<div class="reaction-badge ${myReaction ? 'my-reaction' : ''}" onclick="window.toggleReaction('${msgId}', '${emoji}')">${emoji} ${count}</div>`;
      }
    }

    el.innerHTML = `<div class="msg-author">${avatarHtml} ${data.author || "Гость"}</div><div class="msg-text">${data.text}</div><div class="msg-reactions-display">${reactionsHtml}</div>`;
    
    if (data.avatar) {
      el.querySelector('.chat-avatar-container').addEventListener('click', (e) => {
        e.stopPropagation();
        viewAvatar.src = data.avatar;
        viewAvatarWrapper.style.borderColor = authorLevel.frameColor;
        viewHat.textContent = data.hat || ""; viewHat.style.display = data.hat ? "block" : "none";
        viewName.textContent = (data.author || "Гость") + (isMe ? " (Вы)" : "");
        userProfileModal.style.display = "flex";
      });
    }

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
    
    gainXp(5); // Начисляем XP за сообщение

    window.firebasePush(messagesRef, { 
      author: userName || "Гость", avatar: myAvatar, color: myColor, hat: myHat, xp: myXp,
      text: text, timestamp: Date.now(), reactions: {}
    });
    
    chatInput.value = "";
  });

  window.toggleReaction = function(msgId, emoji) {
    const reactionRef = window.firebaseRef(window.firebaseDB, `rooms/${ROOM_ID}/messages/${msgId}/reactions/${sessionId}`);
    window.firebaseSet(reactionRef, emoji);
  };

  // --- 7. ЭМОДЗИ ---
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
      span.addEventListener('click', () => { chatInputElement.value += emoji; chatInputElement.focus(); });
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