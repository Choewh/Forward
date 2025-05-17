// Socket.io 연결
const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  // 전역 상태 변수
  let currentRoomId = null;
  let isHost = false;
  let tabooWords = {};
  let playerName = '';
  let gameStarted = false;
  let rooms = {};
  let isReconnecting = false;
  let lastPlayerState = null;
  let selectedProfileImageData = null;
  let selectedProfileFile = null; // 선택된 파일 객체 저장 변수 추가
  
  // 모든 플레이어의 프로필 이미지를 캐싱
  const profileImageCache = {};
  
  // DOM 요소
  const initialScreen = document.getElementById('initialScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playerNameInput = document.getElementById('playerName');
  const roomIdInput = document.getElementById('roomId');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const roomIdDisplay = document.getElementById('roomIdDisplay');
  const copyRoomIdBtn = document.getElementById('copyRoomId');
  const playersList = document.getElementById('playersList');
  const playerCount = document.getElementById('playerCount');
  const readyBtn = document.getElementById('readyBtn');
  const endGameBtn = document.getElementById('endGameBtn');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendMessageBtn = document.getElementById('sendMessageBtn');
  const tabooWordModal = document.getElementById('tabooWordModal');
  const tabooWordInputs = document.getElementById('tabooWordInputs');
  const confirmTabooWordsBtn = document.getElementById('confirmTabooWords');
  const alertModal = document.getElementById('alertModal');
  const alertTitle = document.getElementById('alertTitle');
  const alertMessage = document.getElementById('alertMessage');
  const alertCloseBtn = document.getElementById('alertCloseBtn');
  const tabooUsedModal = document.getElementById('tabooUsedModal');
  const tabooUsedMessage = document.getElementById('tabooUsedMessage');
  const tabooUsedCloseBtn = document.getElementById('tabooUsedCloseBtn');
  const otherTabooWords = document.getElementById('otherTabooWords');
  const tabooWordsList = document.getElementById('tabooWordsList');
  const selectProfileBtn = document.getElementById('selectProfileBtn');
  const profileImageInput = document.getElementById('profileImageInput');
  const profilePreview = document.getElementById('profilePreview');
  const profileGrid = document.getElementById('profileGrid');
  
  // 채팅 필터 UI 추가
  const chatInputContainer = document.querySelector('.chat-input') || document.body;
  let chatFilterDiv = document.getElementById('chatFilterDiv');
  if (!chatFilterDiv) {
    chatFilterDiv = document.createElement('div');
    chatFilterDiv.id = 'chatFilterDiv';
    chatFilterDiv.style.display = 'flex';
    chatFilterDiv.style.flexDirection = 'row-reverse';
    chatFilterDiv.style.justifyContent = 'flex-end';
    chatFilterDiv.style.alignItems = 'center';
    chatFilterDiv.style.gap = '12px';
    chatFilterDiv.style.marginLeft = 'auto';
    chatFilterDiv.style.marginBottom = '0';
    // chatSection.insertBefore(chatFilterDiv, chatSection.firstChild);
    // 채팅 입력창과 같은 라인에 오른쪽 끝에 붙이기
    chatInputContainer.appendChild(chatFilterDiv);

    // 생존자 필터 버튼
    const survivorFilterBtn = document.createElement('button');
    survivorFilterBtn.id = 'survivorFilterBtn';
    survivorFilterBtn.textContent = '생존자';
    survivorFilterBtn.className = 'filter-btn filter-on';
    chatFilterDiv.appendChild(survivorFilterBtn);

    // 탈락자 필터 버튼
    const eliminatedFilterBtn = document.createElement('button');
    eliminatedFilterBtn.id = 'eliminatedFilterBtn';
    eliminatedFilterBtn.textContent = '탈락자';
    eliminatedFilterBtn.className = 'filter-btn filter-on';
    chatFilterDiv.appendChild(eliminatedFilterBtn);
  }
  let survivorFilterOn = true;
  let eliminatedFilterOn = true;

  document.getElementById('survivorFilterBtn').onclick = function() {
    survivorFilterOn = !survivorFilterOn;
    this.className = 'filter-btn ' + (survivorFilterOn ? 'filter-on' : 'filter-off');
    renderChatMessages();
  };
  document.getElementById('eliminatedFilterBtn').onclick = function() {
    eliminatedFilterOn = !eliminatedFilterOn;
    this.className = 'filter-btn ' + (eliminatedFilterOn ? 'filter-on' : 'filter-off');
    renderChatMessages();
  };

  // 채팅 메시지 저장 및 렌더링
  let chatMessageList = [];

  function addChatMessage(data) {
    // senderType: 'survivor' | 'eliminated' | 'system'
    if (!data.senderType) {
      // 시스템 메시지 또는 타입 미지정 시
      if (data.sender === 'system') {
        data.senderType = 'system';
      } else {
        // sender가 현재 roomPlayers에서 eliminated 여부로 판단
        const senderPlayer = roomPlayers.find(p => p.name === data.sender);
        data.senderType = (senderPlayer && senderPlayer.eliminated) ? 'eliminated' : 'survivor';
      }
    }
    chatMessageList.push(data);
    renderChatMessages();
  }

  function renderChatMessages() {
    chatMessages.innerHTML = '';
    // 내 플레이어 정보
    const me = roomPlayers.find(p => p.id === socket.id);
    const room = rooms[currentRoomId];
    const isGameActive = room && room.gameStarted && !room.tabooWordsPhase;
    chatMessageList.forEach(data => {
      // 필터링 로직
      if (data.senderType === 'system') {
        // 시스템 메시지는 항상 표시
        ;
      } else if (isGameActive) {
        if (me && !me.eliminated) {
          // 게임 중 생존자는 생존자 메시지만 볼 수 있음
          if (data.senderType !== 'survivor') return;
        } else if (me && me.eliminated) {
          // 게임 중 탈락자는 생존자/탈락자 메시지 모두 볼 수 있음
          // (필터 버튼 적용)
          if (data.senderType === 'survivor' && !survivorFilterOn) return;
          if (data.senderType === 'eliminated' && !eliminatedFilterOn) return;
        }
      } else {
        // 게임이 아닐 때는 모두 자유롭게 채팅 가능 (필터 버튼 적용)
        if (data.senderType === 'survivor' && !survivorFilterOn) return;
        if (data.senderType === 'eliminated' && !eliminatedFilterOn) return;
      }
      // 메시지 DOM 생성 (기존 addChatMessage 내용)
      const div = document.createElement('div');
      div.className = 'chat-message';
      if (data.senderType === 'system') {
        div.classList.add('message-system');
        div.style.textAlign = 'center';
        div.textContent = data.message;
      } else {
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        senderSpan.textContent = `${data.sender}: `;
        const messageSpan = document.createElement('span');
        messageSpan.textContent = data.message;
        div.appendChild(senderSpan);
        div.appendChild(messageSpan);
        if (data.senderType === 'eliminated') {
          div.classList.add('message-eliminated');
        }
      }
      chatMessages.appendChild(div);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 이벤트 리스너 등록
  createRoomBtn.addEventListener('click', createRoom);
  joinRoomBtn.addEventListener('click', joinRoom);
  readyBtn.addEventListener('click', toggleReady);
  endGameBtn.addEventListener('click', endGame);
  sendMessageBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  confirmTabooWordsBtn.addEventListener('click', setTabooWords);
  alertCloseBtn.addEventListener('click', closeAlert);
  tabooUsedCloseBtn.addEventListener('click', closeTabooUsedModal);
  copyRoomIdBtn.addEventListener('click', copyRoomId);
  selectProfileBtn.addEventListener('click', () => {
    profileImageInput.click();
  });
  profileImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // gif, 용량, 타입 체크 등 기존 코드 유지
      if (/\.gif$/i.test(file.name)) {
        alert('움직이는 GIF 이미지는 사용할 수 없습니다.');
        e.target.value = null;
        return;
      }
      if (!/^image\/(jpeg|png|jpg)$/i.test(file.type)) {
        alert('JPG, JPEG, PNG 이미지만 업로드할 수 있습니다.');
        e.target.value = null;
        return;
      }
      // 리사이즈 후 업로드
      resizeImage(file, 256, (resizedDataUrl) => {
        selectedProfileImageData = resizedDataUrl;
        profilePreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = selectedProfileImageData;
        profilePreview.appendChild(img);
      });
      e.target.value = null;
    }
  });
  
  // 이미지 리사이즈 함수 추가
  function resizeImage(file, maxSize, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // jpeg로 변환, 품질 85%
        callback(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
  
  // 페이지 가시성 변경 감지
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentRoomId) {
      // 페이지가 다시 보이게 되면 재연결 시도
      if (!socket.connected) {
        isReconnecting = true;
        socket.connect();
      }
    }
  });
  
  // 재연결 성공 시
  socket.on('connect', () => {
    if (isReconnecting && currentRoomId && playerName) {
      // 이전 상태 정보로 방에 재접속
      socket.emit('joinRoom', { 
        roomId: currentRoomId, 
        playerName: playerName,
        isReconnection: true,
        lastState: lastPlayerState
      });
      isReconnecting = false;
    }
  });
  
  // 연결 끊김 감지
  socket.on('disconnect', (reason) => {
    if (currentRoomId) {
      // 현재 플레이어 상태 저장
      const room = rooms[currentRoomId];
      if (room) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          lastPlayerState = {
            ready: player.ready,
            tabooWord: player.tabooWord,
            hasSetTabooWord: player.hasSetTabooWord,
            eliminated: player.eliminated,
            wins: player.wins,
            profileImage: player.profileImage
          };
        }
      }
      
      // 연결이 끊겼음을 사용자에게 알림
      showAlert('연결 끊김', '서버와의 연결이 끊어졌습니다. 재연결을 시도합니다...');
      // 일정 시간 내 재연결 실패 시 초기화
      setTimeout(() => {
        if (!socket.connected) {
          showAlert('재연결 실패', '서버와의 연결이 복구되지 않아 새로고침합니다.');
          setTimeout(() => {
            location.reload();
          }, 1200); // 안내 메시지 잠깐 보여주고 새로고침
        }
      }, 8000); // 8초 내 재연결 안되면
    }
  });
  
  // 방 생성 함수
  async function createRoom() {
    const currentName = playerNameInput.value.trim();
    if (!currentName) {
      showAlert('알림', '닉네임을 입력해주세요.');
      return;
    }
    if (currentName.length < 2 || currentName.length > 8) {
      showAlert('알림', '닉네임은 2~8글자 사이여야 합니다.');
      return;
    }
    playerName = currentName;
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = '처리 중...';
    socket.emit('createRoom', { playerName: currentName });
  }
  
  // 방 참여 함수
  async function joinRoom() {
    const currentName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    if (!currentName) {
      showAlert('알림', '닉네임을 입력해주세요.');
      return;
    }
    if (currentName.length < 2 || currentName.length > 8) {
      showAlert('알림', '닉네임은 2~8글자 사이여야 합니다.');
      return;
    }
    if (!roomId) {
      showAlert('알림', '방 번호를 입력해주세요.');
      return;
    }
    playerName = currentName;
    joinRoomBtn.disabled = true;
    joinRoomBtn.textContent = '처리 중...';
    socket.emit('joinRoom', { roomId: roomId, playerName: currentName });
  }
  
  // 준비 상태 토글 함수
  function toggleReady() {
    socket.emit('toggleReady', currentRoomId);
  }
  
  // 게임 종료 함수
  function endGame() {
    socket.emit('endGame', currentRoomId);
  }
  
  // 메시지 전송 함수
  function sendMessage() {
    const message = chatInput.value.trim();
    
    if (message && currentRoomId) {
      socket.emit('chatMessage', { roomId: currentRoomId, message });
      chatInput.value = '';
    }
  }
  
  // 금칙어 설정 함수
  function setTabooWords() {
    const inputs = document.querySelectorAll('.taboo-word-input');
    const tabooWordsData = {};
    
    // 모든 입력 필드를 순회하며 금칙어 수집
    let hasSpaces = false;
    let hasTooShort = false;
    let hasOnlyConsonantsOrVowels = false;
    let hasEnglish = false;
    let hasDigits = false;
    let hasSpecialChars = false; // 특수문자 포함 여부 플래그 추가
    
    inputs.forEach(input => {
      const playerId = input.getAttribute('data-player-id');
      const originalWord = input.value.trim();
      
      // 에러 초기화
      input.classList.remove('error'); 

      // 띄어쓰기가 있는지 확인
      if (originalWord.includes(' ')) {
        hasSpaces = true;
        input.classList.add('error');
      } 
      
      const word = originalWord.replace(/\s+/g, '');
      
      // 두 글자 이상인지 확인
      if (word.length < 2) {
        hasTooShort = true;
        input.classList.add('error');
      } 
      
      // 자음 또는 모음만 있는지 확인
      const consonants = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉ';
      const vowels = 'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅒㅔㅖㅘㅙㅚㅝㅞㅟㅢ';
      
      let hasConsonant = false;
      let hasVowel = false;
      let hasCompleteChar = false;
      
      for (let char of word) {
        if (consonants.includes(char)) {
          hasConsonant = true;
        } else if (vowels.includes(char)) {
          hasVowel = true;
        } else {
          // 완성형 한글 문자인 경우
          const code = char.charCodeAt(0);
          if (code >= 0xAC00 && code <= 0xD7A3) {
            hasCompleteChar = true;
          }
        }
      }
      
      // 자음만 있거나 모음만 있는 경우 (완성형 문자가 없는 경우)
      if ((hasConsonant || hasVowel) && !hasCompleteChar) {
        hasOnlyConsonantsOrVowels = true;
        input.classList.add('error');
      }

      // 영어 알파벳 포함 여부 확인
      if (/[a-zA-Z]/.test(word)) {
        hasEnglish = true;
        input.classList.add('error');
      }

      // 숫자 포함 여부 확인
      if (/\d/.test(word)) { 
        hasDigits = true;
        input.classList.add('error');
      }

      // 특수문자 포함 여부 확인 (추가) - 한글,영어,숫자 외의 문자
      if (/[^가-힣a-zA-Z0-9]/.test(word)) {
        hasSpecialChars = true;
        input.classList.add('error');
      }
      
      if (word) {
        tabooWordsData[playerId] = word;
      }
    });
    
    // 띄어쓰기 오류 처리
    if (hasSpaces) {
      showAlert('금칙어 설정 오류', '금칙어에는 띄어쓰기를 포함할 수 없습니다.');
      return;
    }
    
    // 길이 오류 처리
    if (hasTooShort) {
      showAlert('금칙어 설정 오류', '금칙어는 두 글자 이상이어야 합니다.');
      return;
    }
    
    // 자음/모음 오류 처리
    if (hasOnlyConsonantsOrVowels) {
      showAlert('금칙어 설정 오류', '자음 또는 모음만으로는 금칙어를 설정할 수 없습니다. 완성된 단어를 입력해주세요.');
      return;
    }

    // 영어 포함 오류 처리
    if (hasEnglish) {
      showAlert('금칙어 설정 오류', '금칙어에는 영어 알파벳을 사용할 수 없습니다.');
      return;
    }

    // 숫자 포함 오류 처리
    if (hasDigits) {
      showAlert('금칙어 설정 오류', '금칙어에는 숫자를 사용할 수 없습니다.');
      return;
    }

    // 특수문자 포함 오류 처리 (추가)
    if (hasSpecialChars) {
      showAlert('금칙어 설정 오류', '금칙어에는 한글, 영어, 숫자만 사용할 수 있습니다.');
      return;
    }
    
    if (Object.keys(tabooWordsData).length === 0) {
      showAlert('금칙어 설정 오류', '금칙어를 입력해주세요.');
      return;
    }
    
    if (Object.keys(tabooWordsData).length < inputs.length) {
      if (!confirm('일부 플레이어의 금칙어가 입력되지 않았습니다. 계속 진행하시겠습니까?')) {
        return;
      }
    }
    
    // 서버에 모든 금칙어 전송 - 올바른 이벤트 이름과 데이터 형식 사용
    socket.emit('setTabooWords', { 
      roomId: currentRoomId, 
      tabooWords: tabooWordsData 
    });
  }
  
  // 알림 표시 함수
  function showAlert(title, message) {
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    alertModal.style.display = 'block';
  }
  
  // 알림 닫기 함수
  function closeAlert() {
    alertModal.style.display = 'none';
  }
  
  // 금칙어 사용 알림 표시 함수
  function showTabooUsedModal(message) {
    tabooUsedMessage.textContent = message;
    tabooUsedModal.style.display = 'block';
  }
  
  // 금칙어 사용 알림 닫기 함수
  function closeTabooUsedModal() {
    tabooUsedModal.style.display = 'none';
  }
  
  // 방 번호 복사 함수
  function copyRoomId() {
    navigator.clipboard.writeText(currentRoomId)
      .then(() => {
        copyRoomIdBtn.textContent = '복사됨!';
        setTimeout(() => {
          copyRoomIdBtn.textContent = '복사';
        }, 2000);
      })
      .catch(err => {
        console.error('복사 실패:', err);
      });
  }
  
  // 금칙어 입력 모달 표시 함수
  function showTabooWordModal(players) {
    // 기존 입력값 백업
    const prevInputs = {};
    const oldInputs = tabooWordInputs.querySelectorAll('.taboo-word-input');
    oldInputs.forEach(input => {
      prevInputs[input.getAttribute('data-player-id')] = input.value;
    });

    tabooWordInputs.innerHTML = '';
    
    // 현재 내 플레이어 정보
    const myPlayer = players.find(player => player.id === socket.id);
    if (!myPlayer) return;
    
    // 내가 이미 금칙어를 설정한 플레이어 ID 목록
    const alreadySetTabooFor = {};
    if (rooms && rooms[currentRoomId] && rooms[currentRoomId].alreadySetTabooFor) {
      const mySetTabooFor = rooms[currentRoomId].alreadySetTabooFor[socket.id];
      if (mySetTabooFor) {
        Object.assign(alreadySetTabooFor, mySetTabooFor);
      }
    }
  
    // 내가 이미 금칙어를 설정했는지 확인
    if (Object.keys(alreadySetTabooFor).length > 0) {
      return;
    } else {
      // 설명 추가
      const infoDiv = document.createElement('div');
      infoDiv.className = 'taboo-word-info';
      infoDiv.textContent = '다른 플레이어의 금칙어를 설정해주세요:';
      tabooWordInputs.appendChild(infoDiv);
      
      // 각 라운드에서 섞인 플레이어 ID 배열 참조
      const shuffledPlayerIds = rooms[currentRoomId].shuffledPlayerIds || [];
      
      // 내 인덱스 찾기
      const myIndex = shuffledPlayerIds.indexOf(socket.id);
      
      if (myIndex === -1 || shuffledPlayerIds.length < 2) {
        // 에러: 플레이어를 찾을 수 없음
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-group error-message';
        errorDiv.textContent = '오류가 발생했습니다. 게임을 다시 시작해주세요.';
        tabooWordInputs.appendChild(errorDiv);
        return;
      }
      
      // 다음 플레이어 인덱스 계산 (원형 구조)
      const nextPlayerIndex = (myIndex + 1) % shuffledPlayerIds.length;
      const targetPlayerId = shuffledPlayerIds[nextPlayerIndex];
      const targetPlayer = players.find(p => p.id === targetPlayerId);
      
      if (!targetPlayer) {
        // 에러: 대상 플레이어를 찾을 수 없음
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-group error-message';
        errorDiv.textContent = '대상 플레이어를 찾을 수 없습니다.';
        tabooWordInputs.appendChild(errorDiv);
        return;
      }
      
      // 선택된 플레이어에게 금칙어 설정
      const formDiv = document.createElement('div');
      formDiv.className = 'form-group';
      
      const label = document.createElement('label');
      if (targetPlayer.isHost) {
        // 닉네임과 (방장)을 한 줄로 자연스럽게 이어서 표시
        label.innerHTML = `${targetPlayer.name}<span class="player-host-label" style="display:inline-block;margin-left:8px;">(방장)</span>님의 금칙어:`;
      } else {
        label.textContent = `${targetPlayer.name}님의 금칙어:`;
      }
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'taboo-word-input';
      input.setAttribute('data-player-id', targetPlayer.id);
      input.placeholder = '금칙어를 입력하세요';
      // 기존 입력값 복원
      if (prevInputs[targetPlayer.id]) {
        input.value = prevInputs[targetPlayer.id];
      }
      
      formDiv.appendChild(label);
      formDiv.appendChild(input);
      tabooWordInputs.appendChild(formDiv);
      
      // 설명 추가
      const circularInfoDiv = document.createElement('div');
      circularInfoDiv.className = 'taboo-word-info circular-info';
      circularInfoDiv.innerHTML = `<small>각 플레이어는 순서대로 다음 플레이어의 금칙어를 설정합니다 (매 라운드마다 플레이어 순서가 무작위로 변경됩니다)</small>`;
      tabooWordInputs.appendChild(circularInfoDiv);
      
      // 확인 버튼 원래 기능으로 설정
      confirmTabooWordsBtn.textContent = '확인';
      confirmTabooWordsBtn.onclick = setTabooWords;
    }
    
    tabooWordModal.style.display = 'block';
  }
  
  // 플레이어 목록 업데이트 함수
  function updatePlayersList(players) {
    playersList.innerHTML = '';
    // 생존자 수 표시를 플레이어 리스트 위에 한 줄로만 표시
    let survivorCountDiv = document.getElementById('survivorCountDiv');
    if (!survivorCountDiv) {
      survivorCountDiv = document.createElement('div');
      survivorCountDiv.id = 'survivorCountDiv';
      survivorCountDiv.className = 'taboo-survivor-count';
      survivorCountDiv.style.marginBottom = '10px';
      survivorCountDiv.style.textAlign = 'right';
      survivorCountDiv.style.fontWeight = 'bold';
      survivorCountDiv.style.display = 'block';
      survivorCountDiv.style.float = 'none';
    }
    const survivorCount = players.filter(p => !p.eliminated).length;
    survivorCountDiv.textContent = `생존자 : ${survivorCount}`;
    // 항상 플레이어 리스트 위에만 표시
    if (survivorCountDiv.parentNode !== playersList.parentNode || survivorCountDiv.nextSibling !== playersList) {
      playersList.parentNode.insertBefore(survivorCountDiv, playersList);
    }
    survivorCountDiv.style.display = (gameStarted ? 'block' : 'none');

    // 본인 표시용 컨테이너가 없으면 생성
    let myPlayerContainer = document.getElementById('myPlayerContainer');
    if (!myPlayerContainer) {
      myPlayerContainer = document.createElement('div');
      myPlayerContainer.id = 'myPlayerContainer';
      myPlayerContainer.style.marginBottom = '16px';
      myPlayerContainer.style.padding = '12px';
      myPlayerContainer.style.background = '#f5f8fa';
      myPlayerContainer.style.border = '2px solid #3498db';
      myPlayerContainer.style.borderRadius = '8px';
      myPlayerContainer.style.fontWeight = 'bold';
      playersList.parentNode.insertBefore(myPlayerContainer, playersList);
    }
    myPlayerContainer.innerHTML = '';

    // 플레이어 수 업데이트
    playerCount.textContent = `${players.length}명 참여 중`;

    // 본인과 타인 분리
    let myPlayer = players.find(p => p.id === socket.id);
    // 모든 플레이어의 프로필 이미지를 캐시에 저장
    players.forEach(p => {
      if (p.profileImage) {
        profileImageCache[p.id] = p.profileImage;
      } else if (profileImageCache[p.id]) {
        p.profileImage = profileImageCache[p.id];
      }
    });
    // 본인 정보만 myPlayerContainer에 표시
    if (myPlayer) {
      myPlayerContainer.appendChild((function(player) {
        const div = document.createElement('div');
        div.className = 'player-item my-player-item';
        const nameContainer = document.createElement('div');
        nameContainer.className = 'player-name-container';
        const avatar = document.createElement('div');
        avatar.className = 'player-avatar';
        if (player.profileImage && typeof player.profileImage === 'string') {
          avatar.style.backgroundImage = `url(${player.profileImage})`;
          avatar.style.backgroundSize = 'cover';
          avatar.style.backgroundPosition = 'center';
        } else {
          avatar.style.backgroundColor = '#ecf0f1';
        }
        nameContainer.appendChild(avatar);
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        if (player.isHost) {
          const hostSpan = document.createElement('span');
          hostSpan.className = 'player-host-label';
          hostSpan.textContent = ' (방장)';
          hostSpan.style.display = 'inline-block';
          hostSpan.style.marginLeft = '8px';
          nameSpan.appendChild(hostSpan);
        }
        nameContainer.appendChild(nameSpan);
        if (player.wins !== undefined && player.wins > 0) {
          const winsSpan = document.createElement('span');
          winsSpan.className = 'player-wins';
          winsSpan.textContent = `${player.wins}승`;
          nameContainer.appendChild(winsSpan);
        }
        const statusDiv = document.createElement('div');
        statusDiv.className = 'player-status';
        if (player.eliminated) {
          const eliminatedSpan = document.createElement('span');
          eliminatedSpan.className = 'player-eliminated';
          eliminatedSpan.textContent = '탈락';
          statusDiv.appendChild(eliminatedSpan);
        } else if (gameStarted) {
          // 게임 중 생존자 상태 표기
          const survivorSpan = document.createElement('span');
          survivorSpan.className = 'player-survivor';
          survivorSpan.textContent = '생존';
          statusDiv.appendChild(survivorSpan);
        } else {
          const readySpan = document.createElement('span');
          readySpan.className = player.ready ? 'player-ready' : 'player-not-ready';
          readySpan.textContent = player.ready ? '준비완료' : '준비중';
          statusDiv.appendChild(readySpan);
        }
        div.appendChild(nameContainer);
        div.appendChild(statusDiv);
        return div;
      })(myPlayer));
    }

    // 나머지 플레이어(본인 제외) 정렬
    const sortedPlayers = players
      .filter(p => p.id !== socket.id)
      .sort((a, b) => {
        if (a.isHost) return -1;
        if (b.isHost) return 1;
        const winsA = a.wins || 0;
        const winsB = b.wins || 0;
        if (winsA !== winsB) {
          return winsB - winsA;
        }
        return a.id.localeCompare(b.id);
      });

    sortedPlayers.forEach(player => {
      playersList.appendChild((function(player) {
        const div = document.createElement('div');
        div.className = 'player-item';
        const nameContainer = document.createElement('div');
        nameContainer.className = 'player-name-container';
        const avatar = document.createElement('div');
        avatar.className = 'player-avatar';
        if (player.profileImage && typeof player.profileImage === 'string') {
          avatar.style.backgroundImage = `url(${player.profileImage})`;
          avatar.style.backgroundSize = 'cover';
          avatar.style.backgroundPosition = 'center';
        } else {
          avatar.style.backgroundColor = '#ecf0f1';
        }
        nameContainer.appendChild(avatar);
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        if (player.isHost) {
          const hostSpan = document.createElement('span');
          hostSpan.className = 'player-host-label';
          hostSpan.textContent = ' (방장)';
          hostSpan.style.display = 'inline-block';
          hostSpan.style.marginLeft = '8px';
          nameSpan.appendChild(hostSpan);
        }
        nameContainer.appendChild(nameSpan);
        if (player.wins !== undefined && player.wins > 0) {
          const winsSpan = document.createElement('span');
          winsSpan.className = 'player-wins';
          winsSpan.textContent = `${player.wins}승`;
          nameContainer.appendChild(winsSpan);
        }
        const statusDiv = document.createElement('div');
        statusDiv.className = 'player-status';
        if (player.eliminated) {
          const eliminatedSpan = document.createElement('span');
          eliminatedSpan.className = 'player-eliminated';
          eliminatedSpan.textContent = '탈락';
          statusDiv.appendChild(eliminatedSpan);
        } else if (gameStarted) {
          // 게임 중 생존자 상태 표기
          const survivorSpan = document.createElement('span');
          survivorSpan.className = 'player-survivor';
          survivorSpan.textContent = '생존';
          statusDiv.appendChild(survivorSpan);
        } else {
          const readySpan = document.createElement('span');
          readySpan.className = player.ready ? 'player-ready' : 'player-not-ready';
          readySpan.textContent = player.ready ? '준비완료' : '준비중';
          statusDiv.appendChild(readySpan);
        }
        div.appendChild(nameContainer);
        div.appendChild(statusDiv);
        return div;
      })(player));
    });
  }
  
  // 금칙어 목록 업데이트 함수
  function updateTabooWordsList(tabooWords) {
    tabooWordsList.innerHTML = '';
    // 생존자 수 표시를 tabooWordsList 바로 위에 항상 표시
    let survivorCountDiv = document.getElementById('survivorCountDiv');
    if (survivorCountDiv) {
      survivorCountDiv.style.display = (gameStarted ? 'block' : 'none');
      if (survivorCountDiv.parentNode !== tabooWordsList.parentNode || survivorCountDiv.nextSibling !== tabooWordsList) {
        tabooWordsList.parentNode.insertBefore(survivorCountDiv, tabooWordsList);
      }
    }
    // 금칙어 설정 단계라면(rooms[currentRoomId]?.tabooWordsPhase) 미설정자 리스트 표시
    const room = rooms[currentRoomId];
    if (room && room.tabooWordsPhase) {
      // 금칙어를 아직 설정하지 않은 플레이어 목록
      const notSetPlayers = roomPlayers.filter(p => !p.hasSetTabooWord && !p.eliminated);
      if (notSetPlayers.length > 0) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'taboo-notset-info';
        infoDiv.style.margin = '8px 0';
        infoDiv.style.fontWeight = 'bold';
        infoDiv.textContent = '아직 금칙어를 설정하지 않은 플레이어:';
        tabooWordsList.appendChild(infoDiv);
        notSetPlayers.forEach(player => {
          const div = document.createElement('div');
          div.className = 'taboo-notset-player';
          div.style.marginLeft = '12px';
          div.textContent = player.name + (player.isHost ? ' (방장)' : '');
          tabooWordsList.appendChild(div);
        });
      } else {
        const allSetDiv = document.createElement('div');
        allSetDiv.className = 'taboo-allset-info';
        allSetDiv.style.margin = '8px 0';
        allSetDiv.style.fontWeight = 'bold';
        allSetDiv.textContent = '모든 플레이어가 금칙어를 설정했습니다.';
        tabooWordsList.appendChild(allSetDiv);
      }
      otherTabooWords.style.display = 'block';
      return;
    }
    // tabooWords는 이미 서버에서 자신을 제외한 다른 플레이어의 금칙어만 포함하고 있음
    for (const playerId in tabooWords) {
      const player = roomPlayers.find(p => p.id === playerId);
      // 탈락한 플레이어는 금칙어 목록에서 제외
      if (player && player.eliminated) continue;
      if (player && tabooWords[playerId]) {
        const div = document.createElement('div');
        div.className = 'taboo-word-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'taboo-player-name';
        nameSpan.textContent = `${player.name}님의 금칙어:`;
        const wordSpan = document.createElement('span');
        wordSpan.className = 'taboo-word';
        wordSpan.textContent = tabooWords[playerId];
        div.appendChild(nameSpan);
        div.appendChild(wordSpan);
        tabooWordsList.appendChild(div);
      }
    }
    // 금칙어 목록이 있는 경우에만 표시
    if (Object.keys(tabooWords).length > 0) {
      otherTabooWords.style.display = 'block';
    }
  }
  
  // Socket.io 이벤트 리스너
  let roomPlayers = [];
  
  // 방 생성 성공
  socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId;
    isHost = data.isHost;
    // 버튼 복구
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = '방 만들기';

    initialScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    roomIdDisplay.textContent = currentRoomId;
    
    // 모든 플레이어가 준비 버튼을 사용할 수 있도록 함
    readyBtn.style.display = 'block';

    // 입장 성공 후 선택된 파일이 있으면 업로드 시도
    if (selectedProfileImageData && socket && socket.id && currentRoomId) {
      socket.emit('profileImage', { roomId: currentRoomId, imageData: selectedProfileImageData });
    }
  });
  
  // 방 참여 성공
  socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    isHost = data.isHost;
    // 버튼 복구
    joinRoomBtn.disabled = false;
    joinRoomBtn.textContent = '참여하기';

    initialScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    roomIdDisplay.textContent = currentRoomId;
    
    // 모든 플레이어가 준비 버튼을 사용할 수 있도록 함
    readyBtn.style.display = 'block';

    // 입장 성공 후 선택된 파일이 있으면 업로드 시도
    if (selectedProfileImageData && socket && socket.id && currentRoomId) {
      socket.emit('profileImage', { roomId: currentRoomId, imageData: selectedProfileImageData });
    }
  });
  
  // 방 참여 오류
  socket.on('joinError', (message) => {
    // 버튼 복구 (createRoomBtn도 함께 복구하는 것이 안전)
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = '방 만들기';
    joinRoomBtn.disabled = false;
    joinRoomBtn.textContent = '참여하기';

    // 사용자가 아직 방에 들어가지 않았을 때만 오류 메시지 표시
    if (!currentRoomId) {
      showAlert('오류', message);
    } else {
      // 이미 다른 방에 들어간 후 뒤늦게 도착한 오류는 무시 (콘솔에는 로그 남김)
      console.log('Ignoring late joinError message because already in room:', currentRoomId, message);
    }
  });
  
  // 게임 시작 오류
  socket.on('startError', (message) => {
    showAlert('오류', message);
  });
  
  // 방 정보 업데이트
  socket.on('updateRoom', (room) => {
    const wasTabooPhase = gameStarted && rooms[room.id]?.tabooWordsPhase; // 이전 상태 기억
    gameStarted = room.gameStarted;
    roomPlayers = room.players;
    
    // 전역 rooms 객체 업데이트
    if (!rooms[room.id]) {
      rooms[room.id] = {};
    }
    Object.assign(rooms[room.id], room);
    
    updatePlayersList(room.players);
    
    // 금칙어 미설정자 리스트/금칙어 목록 동기화
    updateTabooWordsList(tabooWords);
    
    // 현재 플레이어 정보 찾기
    const currentPlayer = room.players.find(p => p.id === socket.id);

    // 모달 닫기 로직 수정:
    // 금칙어 설정 단계가 끝났다면 (tabooWordsPhase가 false가 되었다면) 모달을 닫는다.
    if (wasTabooPhase && !room.tabooWordsPhase) { 
      if (tabooWordModal.style.display === 'block') {
          tabooWordModal.style.display = 'none';
          console.log('Taboo word phase ended, closing modal.');
      }
    } else if (room.tabooWordsPhase && currentPlayer && currentPlayer.hasSetTabooWord) {
      // (기존 로직 유지) 내가 설정을 완료했을 때도 닫는다 (혹시 모를 다른 경우 대비)
      if (tabooWordModal.style.display === 'block') {
          tabooWordModal.style.display = 'none';
          console.log('Taboo word set successfully, closing modal.');
      }
    }
    
    // 게임이 종료되었을 때
    if (!gameStarted) {
      readyBtn.style.display = 'block';
      otherTabooWords.style.display = 'none';
    } else {
      // 게임이 시작되었을 때
      readyBtn.style.display = 'none';
      
      // 금칙어 설정 단계에서 금칙어를 설정할 수 있는 경우 모달 표시
      if (room.tabooWordsPhase) {
        // const currentPlayer = room.players.find(p => p.id === socket.id); // 이미 위에서 찾음
        if (currentPlayer && !currentPlayer.hasSetTabooWord) {
          showTabooWordModal(room.players);
        }
      }
    }
    
    // 게임이 시작되었을 때 방장은 종료 버튼 표시
    if (isHost && gameStarted) {
      endGameBtn.style.display = 'block';
    } else {
      endGameBtn.style.display = 'none';
    }
  });
  
  // 게임 시작됨
  socket.on('gameStarted', () => {
    gameStarted = true;
    readyBtn.style.display = 'none';
    
    // 게임이 시작되었을 때 방장은 종료 버튼 표시
    if (isHost) {
      endGameBtn.style.display = 'block';
    }
  });
  
  // 게임 종료됨
  socket.on('gameEnded', () => {
    gameStarted = false;
    
    // 모든 플레이어에게 준비 버튼 표시
    readyBtn.style.display = 'block';
    
    // 탈락했던 경우 채팅 입력란 재활성화
    chatInput.disabled = false;
    sendMessageBtn.disabled = false;
    chatInput.placeholder = '메시지를 입력하세요...';
    
    otherTabooWords.style.display = 'none';
  });
  
  // 호스트 권한 획득
  socket.on('becameHost', () => {
    isHost = true;
    if (gameStarted) {
      endGameBtn.style.display = 'block';
    }
    
    addChatMessage({ sender: 'system', message: '이제 당신이 방장입니다.' });
  });
  
  // 금칙어 수신
  socket.on('receiveTabooWords', (receivedTabooWords) => {
    tabooWords = receivedTabooWords;
    updateTabooWordsList(tabooWords);
  });
  
  // 채팅 메시지 수신
  socket.on('chatMessage', (data) => {
    addChatMessage(data);
  });
  
  // 금칙어 사용 감지
  socket.on('tabooWordUsed', (data) => {
    const message = `${data.playerName}님이 금칙어 "${data.word}"를 사용하여 탈락했습니다!`;
    showTabooUsedModal(message);
    // 탈락 메시지를 채팅에 먼저 표시
    showPlayerEliminated({ name: data.playerName });
  });
  
  // 호스트에게만 금칙어 설정 모달 표시
  socket.on('showTabooWordModal', (players) => {
    showTabooWordModal(players);
  });
  
  // Socket.io 이벤트 리스너들 수정
  socket.on('tabooWordPhase', () => {
    // 금칙어 설정 단계 시작
    showTabooWordModal(roomPlayers);
    addChatMessage({ sender: 'system', message: '금칙어 설정 단계가 시작되었습니다.' });
  });
  
  // 승리자 표시 함수
  function showWinner(winner) {
    const winnerModal = document.createElement('div');
    winnerModal.className = 'modal';
    winnerModal.id = 'winnerModal';
    winnerModal.style.display = 'block';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content winner-modal';
    
    const winnerTitle = document.createElement('h2');
    winnerTitle.textContent = '🎉 승리자 🎉';
    
    const winnerMessage = document.createElement('p');
    winnerMessage.className = 'winner-message';
    winnerMessage.textContent = `${winner.name}님이 승리하셨습니다!`;
    
    const closeButton = document.createElement('button');
    closeButton.className = 'btn';
    closeButton.textContent = '확인';
    closeButton.onclick = () => {
      winnerModal.style.display = 'none';
    };
    
    modalContent.appendChild(winnerTitle);
    modalContent.appendChild(winnerMessage);
    modalContent.appendChild(closeButton);
    winnerModal.appendChild(modalContent);
    
    document.body.appendChild(winnerModal);
  }
  
  // 플레이어 탈락 표시 함수
  function showPlayerEliminated(player) {
    const eliminatedDiv = document.createElement('div');
    eliminatedDiv.className = 'chat-message message-system message-eliminated';
    eliminatedDiv.style.textAlign = 'center';
    eliminatedDiv.innerHTML = `<strong>${player.name}</strong>님이 금칙어를 사용하여 탈락했습니다!`;
    
    chatMessages.appendChild(eliminatedDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // 게임 승리자 발표
  socket.on('gameWinner', (winner) => {
    // 승리자 UI보다 탈락 메시지가 먼저 나올 수 있도록 약간의 지연 추가
    setTimeout(() => {
      showWinner(winner);
    }, 400);
  });
  
  // 채팅 에러 처리
  socket.on('chatError', (errorData) => {
    // 먼저 모든 금칙어 입력 필드의 에러 표시 제거
    const allInputs = tabooWordModal.querySelectorAll('.taboo-word-input');
    allInputs.forEach(input => input.classList.remove('error'));

    // 에러 메시지 표시
    showAlert('알림', errorData.message);

    // 특정 플레이어 입력과 관련된 에러인 경우 해당 입력 필드 강조
    if (errorData.playerId) {
      const errorInput = tabooWordModal.querySelector(`.taboo-word-input[data-player-id="${errorData.playerId}"]`);
      if (errorInput) {
        errorInput.classList.add('error');
      }
    }
  });
  
  // 서버에서 받은 프로필 이미지를 해당 플레이어에 반영
  socket.on('profileImage', ({ playerId, imageData }) => {
    function applyProfileImage() {
      const player = roomPlayers.find(p => p.id === playerId);
      if (player) {
        player.profileImage = imageData;
        profileImageCache[playerId] = imageData;
        if (playerId === socket.id) {
          selectedProfileImageData = imageData;
        }
        updatePlayersList(roomPlayers);
      } else {
        setTimeout(applyProfileImage, 100);
      }
    }
    applyProfileImage();
  }); 