const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 2 * 1024 * 1024 } });

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));
// JSON 파싱 미들웨어
app.use(express.json());

// 게임방 상태 저장
const rooms = {};

// 파일 업로드 라우트
app.post('/upload-profile-image', upload.single('profileImage'), (req, res) => {
  const socketId = req.body.socketId;
  if (!req.file) {
    return res.status(400).send({ message: 'No file uploaded.' });
  }
  if (!socketId) {
    return res.status(400).send({ message: 'Socket ID is required.' });
  }
  const filePath = '/uploads/' + req.file.filename;
  let updated = false;
  let targetRoomId = null;
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const player = room.players.find(p => p.id === socketId);
    if (player) {
      player.profileImage = filePath;
      updated = true;
      targetRoomId = roomId;
      io.to(roomId).emit('updateRoom', room);
      break; 
    }
  }
  if (updated && targetRoomId) {
    res.send({ message: 'File uploaded successfully.', filePath: filePath });
  } else {
    res.status(200).send({ 
        message: 'File uploaded but player not found (maybe disconnected?).', 
        filePath: filePath 
    });
  }
});

// 소켓 연결 처리
io.on('connection', (socket) => {
  console.log('새로운 사용자 연결됨:', socket.id);

  // 방 생성
  socket.on('createRoom', (data) => {
    const playerName = data.playerName;
    const profileImage = data.profileImage || null;
    console.log(`[createRoom] Received playerName: ${playerName}`);
    const roomId = uuidv4().substr(0, 6);
    
    if (!playerName) {
      console.error('Attempted to create room with no playerName', data);
      return; 
    }

    rooms[roomId] = {
      id: roomId,
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName,
        ready: false,
        tabooWord: '',
        isHost: true,
        hasSetTabooWord: false,
        eliminated: false,
        wins: 0,
        profileImage: profileImage
      }],
      gameStarted: false,
      tabooWordsPhase: false,
      tabooWords: {},
      alreadySetTabooFor: {},
      initialNonHostPlayerCount: 0
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, isHost: true });
    io.to(roomId).emit('updateRoom', rooms[roomId]);
    
    console.log(`방 생성됨: ${roomId}`);
  });

  // 방 참여
  socket.on('joinRoom', (data) => {
    const { roomId, playerName, isReconnection, lastState, profileImage } = data;
    
    if (!isReconnection) {
        console.log(`[joinRoom] Received join request for ${playerName} in room ${roomId}`);
    }

    if (!playerName) {
      console.error('Attempted to join room with no playerName', data);
      socket.emit('joinError', '닉네임이 필요합니다.');
      return;
    }
    if (!roomId) {
       console.error('Attempted to join room with no roomId', data);
       socket.emit('joinError', '방 번호가 필요합니다.');
       return;
    }

    if (rooms[roomId]) {
      const room = rooms[roomId];
      
      // 재연결인 경우
      if (isReconnection) {
        const existingPlayer = room.players.find(p => p.name === playerName);
        if (existingPlayer) {
          room.players = room.players.filter(p => p.name !== playerName);
          room.players.push({
            id: socket.id,
            name: playerName,
            ready: (lastState && lastState.ready) || false,
            tabooWord: (lastState && lastState.tabooWord) || '',
            isHost: existingPlayer.isHost,
            hasSetTabooWord: (lastState && lastState.hasSetTabooWord) || false,
            eliminated: (lastState && lastState.eliminated) || false,
            wins: (lastState && lastState.wins) || 0,
            profileImage: (lastState && lastState.profileImage) || null
          });
          if (existingPlayer.isHost) {
            room.host = socket.id;
          }
          socket.join(roomId);
          socket.emit('roomJoined', { roomId, isHost: existingPlayer.isHost });
          io.to(roomId).emit('updateRoom', room);
          io.to(roomId).emit('chatMessage', { sender: 'system', message: `${playerName}님이 재접속했습니다.` });
          return;
        }
      }
      
      // 일반 입장 처리
      if (room.gameStarted) {
        socket.emit('joinError', '이미 게임이 시작된 방입니다.');
        return;
      }
      
      socket.join(roomId);
      
      // 동명이인 처리
      let uniqueName = playerName;
      let nameCounter = 1;
      while (room.players.some(p => p.name === uniqueName)) {
        uniqueName = `${playerName}${nameCounter}`;
        nameCounter++;
      }
      
      room.players.push({
        id: socket.id,
        name: uniqueName,
        ready: false,
        tabooWord: '',
        isHost: false,
        hasSetTabooWord: false,
        eliminated: false,
        wins: 0,
        profileImage: profileImage || null
      });
      
      socket.emit('roomJoined', { roomId, isHost: false });
      io.to(roomId).emit('updateRoom', rooms[roomId]);
      io.to(roomId).emit('chatMessage', { sender: 'system', message: `${uniqueName}님이 입장했습니다.` });
      
      console.log(`${uniqueName}님이 ${roomId} 방에 입장함`);
    } else {
      socket.emit('joinError', '존재하지 않는 방 번호입니다.');
    }
  });

  // 준비 상태 변경
  socket.on('toggleReady', (roomId) => {
    if (rooms[roomId]) {
      const player = rooms[roomId].players.find(p => p.id === socket.id);
      if (player) {
        player.ready = !player.ready;
        
        // 모든 플레이어가 준비 상태인지 확인
        const allPlayersReady = rooms[roomId].players.every(p => p.ready);
        
        // 게임 시작 조건: 모든 플레이어가 준비 상태이고, 2명 이상이고, 게임이 아직 시작되지 않음
        if (allPlayersReady && rooms[roomId].players.length >= 2 && !rooms[roomId].gameStarted) {
          // 게임 자동 시작
          startGame(roomId);
        } else {
          io.to(roomId).emit('updateRoom', rooms[roomId]);
        }
      }
    }
  });

  // 게임 시작 함수
  function startGame(roomId) {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      
      room.gameStarted = true;
      room.tabooWordsPhase = true;
      
      // 게임 시작 시 방장을 제외한 초기 플레이어 수 기록
      const nonHostPlayers = room.players.filter(p => !p.isHost);
      room.initialNonHostPlayerCount = nonHostPlayers.length;
      
      // 각 플레이어의 금칙어 설정 상태 초기화
      room.players.forEach(player => {
        player.hasSetTabooWord = false;
        player.tabooWord = '';
      });
      
      // 금칙어 설정 추적 객체 초기화
      room.alreadySetTabooFor = {};
      room.players.forEach(player => {
        room.alreadySetTabooFor[player.id] = {};
      });
      
      // 금칙어 매핑 정보 초기화
      room.tabooWords = {};
      
      // 플레이어 순서를 섞음 (방장은 항상 첫 번째 위치 유지)
      const host = room.players.find(p => p.isHost);
      const otherPlayers = room.players.filter(p => !p.isHost);
      
      // Fisher-Yates 알고리즘으로 플레이어 배열 섞기
      for (let i = otherPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherPlayers[i], otherPlayers[j]] = [otherPlayers[j], otherPlayers[i]];
      }
      
      // 방장을 첫 번째로 하고 나머지 플레이어를 섞은 순서로 배치
      room.players = [host, ...otherPlayers];
      
      // 섞은 플레이어 ID 순서 저장 (금칙어 설정 순환 구조용)
      room.shuffledPlayerIds = room.players.map(p => p.id);
      
      io.to(roomId).emit('gameStarted');
      io.to(roomId).emit('tabooWordPhase');
      io.to(roomId).emit('updateRoom', room);
    }
  }

  // 금칙어 설정
  socket.on('setTabooWords', ({ roomId, tabooWords }) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === socket.id);
      
      if (!player) return;
      
      // 이미 금칙어를 설정한 경우 중복 설정 방지
      if (player.hasSetTabooWord) {
        return;
      }
      
      // 섞인 플레이어 ID 배열 확인
      if (!room.shuffledPlayerIds || room.shuffledPlayerIds.length < 2) {
        socket.emit('chatError', { message: '플레이어 순서 정보가 없습니다.' });
        return;
      }
      
      // 내 인덱스 찾기
      const myIndex = room.shuffledPlayerIds.indexOf(socket.id);
      if (myIndex === -1) {
        socket.emit('chatError', { message: '플레이어 정보를 찾을 수 없습니다.' });
        return;
      }
      
      // 다음 플레이어 인덱스 계산 (원형 구조)
      const nextPlayerIndex = (myIndex + 1) % room.shuffledPlayerIds.length;
      const targetPlayerId = room.shuffledPlayerIds[nextPlayerIndex];
      
      // 기존 tabooWords 객체에 새 금칙어 추가
      Object.entries(tabooWords).forEach(([playerId, word]) => {
        // 두 글자 이상인지 확인
        if (word.length < 2) {
          socket.emit('chatError', { message: '금칙어는 두 글자 이상이어야 합니다.', playerId: playerId });
          return;
        }
        
        // 영어 알파벳 포함 여부 확인
        if (/[a-zA-Z]/.test(word)) {
          socket.emit('chatError', { message: '금칙어에는 영어 알파벳을 사용할 수 없습니다.', playerId: playerId });
          return;
        }
        
        // 숫자 포함 여부 확인
        if (/\d/.test(word)) {
          socket.emit('chatError', { message: '금칙어에는 숫자를 사용할 수 없습니다.', playerId: playerId });
          return;
        }

        // 특수문자 포함 여부 확인 (추가) - 한글,영어,숫자 외의 문자
        if (/[^가-힣a-zA-Z0-9]/.test(word)) {
          socket.emit('chatError', { message: '금칙어에는 한글, 영어, 숫자만 사용할 수 있습니다.', playerId: playerId });
          return; 
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
          socket.emit('chatError', { message: '자음 또는 모음만으로는 금칙어를 설정할 수 없습니다. 완성된 단어를 입력해주세요.', playerId: playerId });
          return;
        }
        
        // 지정된 대상 플레이어가 맞는지 확인
        if (playerId !== targetPlayerId) {
          socket.emit('chatError', { message: '지정된 대상 플레이어에게만 금칙어를 설정할 수 있습니다.' });
          return;
        }
        
        // 대상 플레이어가 존재하는지 확인
        const targetPlayer = room.players.find(p => p.id === targetPlayerId);
        if (!targetPlayer) {
          socket.emit('chatError', { message: '대상 플레이어를 찾을 수 없습니다.' });
          return;
        }
        
        // 각 플레이어가 설정한 금칙어를 대상 플레이어의 tabooWord 속성에 저장
        targetPlayer.tabooWord = word;
        
        // 이미 설정한 플레이어 추적
        if (!room.alreadySetTabooFor[socket.id]) {
          room.alreadySetTabooFor[socket.id] = {};
        }
        room.alreadySetTabooFor[socket.id][targetPlayerId] = true;
        
        // 금칙어 매핑 정보도 저장 (누가 누구의 금칙어를 설정했는지)
        room.tabooWords[targetPlayerId] = {
          word: word,
          setBy: socket.id
        };
      });
      
      // 플레이어가 금칙어 설정을 완료했음을 표시
      player.hasSetTabooWord = true;
      
      // 모든 플레이어가 금칙어를 받았는지 확인
      const allPlayersHaveTabooWord = room.players.every(p => p.tabooWord && p.tabooWord !== '');
      
      // 모든 플레이어가 금칙어를 설정했는지 확인
      const allPlayersSetTabooWord = room.players.every(p => p.hasSetTabooWord);
      
      // 모든 플레이어가 금칙어를 받았고 모든 플레이어가 금칙어를 설정했으면 본격적인 게임 시작
      if (allPlayersHaveTabooWord && allPlayersSetTabooWord) {
        room.tabooWordsPhase = false;
        
        // 각 플레이어에게 자신을 제외한 다른 플레이어들의 금칙어 전송
        room.players.forEach(player => {
          const otherPlayersTabooWords = {};
          
          // 다른 플레이어들의 금칙어만 추가
          room.players.forEach(otherPlayer => {
            if (otherPlayer.id !== player.id) {
              otherPlayersTabooWords[otherPlayer.id] = otherPlayer.tabooWord;
            }
          });
          
          // 해당 플레이어에게 다른 플레이어들의 금칙어 전송
          io.to(player.id).emit('receiveTabooWords', otherPlayersTabooWords);
        });
        
        io.to(roomId).emit('chatMessage', { sender: 'system', message: '모든 플레이어의 금칙어가 설정되었습니다. 게임이 시작됩니다!' });
      }
      
      // 방 상태 업데이트
      io.to(roomId).emit('updateRoom', room);
    }
  });

  // 채팅 메시지
  socket.on('chatMessage', ({ roomId, message }) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === socket.id);
      if (player && room.gameStarted && !room.tabooWordsPhase) {
        // 금칙어 체크 - 띄어쓰기 제거 후 비교
        const myTabooWord = player.tabooWord.toLowerCase().replace(/\s+/g, '');
        const messageWithoutSpaces = message.toLowerCase().replace(/\s+/g, '');
        if (myTabooWord && messageWithoutSpaces.includes(myTabooWord)) {
          // 금칙어 사용으로 탈락 처리
          player.eliminated = true;
          // 탈락자 준비 상태 해제
          player.ready = false;
          
          // 금칙어 사용 감지 알림
          io.to(roomId).emit('tabooWordUsed', {
            playerId: player.id,
            playerName: player.name,
            word: myTabooWord
          });
          
          io.to(roomId).emit('chatMessage', {
            sender: 'system',
            message: `${player.name}님이 금칙어 "${myTabooWord}"를 사용하여 탈락했습니다!`
          });
          
          // 승리자 확인
          const allPlayers = room.players;
          const remainingPlayers = allPlayers.filter(p => !p.eliminated);
          
          // 초기 플레이어가 2명 이상이고, 남은 플레이어가 1명이면 승리 (방장 포함)
          if (room.players.length >= 2 && remainingPlayers.length === 1) {
            const winner = remainingPlayers[0];
            
            // 승리자의 승리 횟수 증가
            winner.wins++;
            
            // 승리자가 나오면 모든 플레이어의 상태를 준비중으로 변경
            room.players.forEach(p => {
              p.ready = false;
              p.eliminated = false;
              p.tabooWord = '';
              p.hasSetTabooWord = false;
            });
            
            io.to(roomId).emit('gameWinner', winner);
            io.to(roomId).emit('chatMessage', {
              sender: 'system',
              message: `🎉 ${winner.name}님이 최후의 1인으로 승리하셨습니다! 🎉`
            });
            
            // 게임을 자동으로 종료 상태로 변경
            room.gameStarted = false;
            room.tabooWordsPhase = false;
            
            // 금칙어 정보 초기화
            room.tabooWords = {};
            
            // 방 상태 업데이트
            io.to(roomId).emit('gameEnded');
          }
          
          // 방 상태 업데이트
          io.to(roomId).emit('updateRoom', room);
        } else {
          // 정상 메시지 전송
          // 생존자 메시지는 모두에게, 탈락자 메시지는 탈락자끼리만
          const eliminatedGroup = room.players.filter(p => p.eliminated).map(p => p.id);
          if (player.eliminated) {
            // 탈락자 채팅: 탈락자끼리만
            eliminatedGroup.forEach(id => {
              io.to(id).emit('chatMessage', {
                sender: player.name,
                message: message
              });
            });
          } else {
            // 생존자 채팅: 모두에게
            room.players.forEach(p => {
              io.to(p.id).emit('chatMessage', {
                sender: player.name,
                message: message
              });
            });
          }
        }
      } else if (player) {
        // 게임이 시작되지 않은 상태에서는 일반 채팅 (모두에게)
        io.to(roomId).emit('chatMessage', {
          sender: player.name,
          message: message
        });
      }
    }
  });

  // 게임 종료
  socket.on('endGame', (roomId) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
      const room = rooms[roomId];
      room.gameStarted = false;
      room.tabooWordsPhase = false;
      
      // 게임 종료 시 초기 플레이어 수 초기화
      room.initialNonHostPlayerCount = 0;
      
      // 모든 플레이어 준비 상태 및 탈락 상태 초기화
      room.players.forEach(p => {
        p.ready = false;
        p.tabooWord = '';
        p.hasSetTabooWord = false;
        p.eliminated = false;
      });
      
      room.tabooWords = {};
      
      io.to(roomId).emit('gameEnded');
      io.to(roomId).emit('updateRoom', room);
      io.to(roomId).emit('chatMessage', { sender: 'system', message: '게임이 종료되었습니다.' });
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log('사용자 연결 해제:', socket.id);
    
    // 사용자가 속한 방 찾기
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        const playerName = player.name;
        
        room.players.splice(playerIndex, 1);
        
        // 방 호스트가 나간 경우
        if (socket.id === room.host) {
          // 다른 플레이어가 있으면 호스트 권한 이전
          if (room.players.length > 0) {
            room.host = room.players[0].id;
            room.players[0].isHost = true;
            io.to(room.players[0].id).emit('becameHost');
          } else {
            // 모든 플레이어가 나간 경우 방 삭제
            delete rooms[roomId];
            continue;
          }
        }
        
        // 방 업데이트
        io.to(roomId).emit('updateRoom', room);
        io.to(roomId).emit('chatMessage', { sender: 'system', message: `${playerName}님이 퇴장했습니다.` });
      }
    }
  });

  socket.on('profileImage', ({ roomId, imageData }) => {
    if (rooms[roomId]) {
      // 서버의 room.players 내 해당 플레이어의 profileImage 필드 갱신
      const player = rooms[roomId].players.find(p => p.id === socket.id);
      if (player) {
        player.profileImage = imageData;
      }
      // 실시간 전파
      io.to(roomId).emit('profileImage', { playerId: socket.id, imageData });
      // 모든 클라이언트에 최신 상태 동기화
      io.to(roomId).emit('updateRoom', rooms[roomId]);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
}); 