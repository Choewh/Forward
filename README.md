# 금칙어 게임 (Taboo Word Game)

웹 기반 금칙어 게임 애플리케이션입니다. 친구들과 함께 온라인으로 금칙어 게임을 즐길 수 있습니다.

## 기능

- 방 만들기 및 참여하기
- 고유한 방 번호를 통한 접속
- 플레이어 준비 상태 표시
- 실시간 채팅
- 금칙어 설정 및 감지
- 반응형 디자인

## 게임 규칙

1. **금칙어 정하기**: 게임 시작 전 방장이 각 참가자의 금칙어를 설정합니다.
2. **질문 & 대화 진행**: 참가자들은 채팅을 통해 자유롭게 대화하고 질문합니다.
3. **금칙어 말하면 탈락**: 자신에게 설정된 금칙어를 사용하면 바로 감지되어 알림이 표시됩니다.

## 설치 방법

1. 저장소 클론:
```
git clone https://github.com/your-username/taboo-game.git
cd taboo-game
```

2. 의존성 설치:
```
npm install
```

3. 환경 변수 파일(.env) 생성 (필요한 경우)
   - 기본적으로 .env 파일이 필요하다면 예시를 참고하여 직접 생성하세요.
   - 예시:
     ```env
     # .env 예시
     PORT=3000
     # 기타 환경 변수
     ```

4. 업로드 폴더 생성
   - 업로드 이미지를 저장할 폴더가 필요합니다.
   - 아래 명령어로 폴더를 만드세요:
     ```bash
     mkdir -p public/uploads
     ```

5. 서버 실행:
```
npm start
```

6. 웹 브라우저에서 `http://localhost:3000` 접속

## 기술 스택

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **실시간 통신**: Socket.IO

## 개발자

이 프로젝트는 [귀하의 이름]에 의해 개발되었습니다.

## 라이센스

이 프로젝트는 MIT 라이센스 하에 있습니다.

## 프로젝트 시작 가이드

1. **저장소 클론**
   ```bash
   git clone https://github.com/your-username/taboo-game.git
   cd taboo-game
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경 변수 파일(.env) 생성 (필요한 경우)**
   - 기본적으로 .env 파일이 필요하다면 예시를 참고하여 직접 생성하세요.
   - 예시:
     ```env
     # .env 예시
     PORT=3000
     # 기타 환경 변수
     ```

4. **업로드 폴더 생성**
   - 업로드 이미지를 저장할 폴더가 필요합니다.
   - 아래 명령어로 폴더를 만드세요:
     ```bash
     mkdir -p public/uploads
     ```

5. **서버 실행**
   ```bash
   npm start
   ```

6. **웹 브라우저에서 접속**
   - [http://localhost:3000](http://localhost:3000) 으로 접속

--- 