# agita — AI 통화 동반자 "온"

밤마다 사용자가 전화를 걸어 하루를 털어놓는 음성 통화 AI.
통화는 자연스럽게 흐르고, 끝나면 대화록을 요약해 일기로 기록한다.

상세 설계: `companion_master_spec.md` (외부 문서)

## 아키텍처

```
통화 ─▶ VAD ─▶ STT(RTZR) ─▶ [감정신호] 주입 ─▶ Claude Sonnet ─▶ TTS(ElevenLabs) ─▶ 통화
                                                          │
                              (통화 종료) ────────────────┴─▶ 일기 생성(Claude) ─▶ DB
                                                                     │
              (주기적/통화 전) ◀── 장기 프로필 갱신 ◀── 누적 일기 ───┘
```

- 두뇌는 텍스트 Claude(상위 모델). 음성 realtime 모델 대신 STT/TTS를 분리해 페르소나·규칙 이행 확보.
- 퀄리티 > 비용 (spec § 0). 통화도 Sonnet.
- `[상태]`(AI 기분) · `[프로필]`(장기 기억) · `[지난 기록]` · `[다음 화제]`를 서버가 시스템 프롬프트에 주입.

## 셋업

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.local.example .env.local
# .env.local 에 키들 채우기

python companion_call_bot.py
```

## 스모크 테스트 (first light)

파이프라인이 실제로 도는지 확인하는 최소 절차. 실제 제품 UI는 Phase 1 후반에 별도.

1. **Daily 룸 만들기**
   - https://dashboard.daily.co/ 가입 → Rooms → Create Room
   - 룸 URL을 `.env.local`의 `DAILY_ROOM_URL`에 넣기
   - Developers → API Keys 에서 키 받아서 Meeting Token 발급 → `DAILY_TOKEN`
2. **다른 키들 채우기** (`ANTHROPIC_API_KEY`, `RTZR_API_TOKEN`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`)
3. **봇 실행** — 한 터미널에서:
   ```bash
   .venv/bin/python companion_call_bot.py
   ```
   봇이 룸에 들어가 사용자 입장을 기다림.
4. **클라이언트 열기** — 다른 터미널에서 정적 서버 띄우고 브라우저로 접속:
   ```bash
   python -m http.server 8000
   # 브라우저: http://localhost:8000/call.html
   ```
   처음 한 번 룸 URL 입력 → Join → 마이크 권한 → "온"이 인사하면 성공.

## 필요한 API

| 용도 | 서비스 | URL |
|------|--------|-----|
| LLM (실시간 + 일기 + 프로필) | Anthropic Claude (Sonnet 4.6) | https://console.anthropic.com |
| 한국어 STT | RTZR / VITO | https://developers.rtzr.ai/ |
| TTS | ElevenLabs (eleven_flash_v2_5) | https://elevenlabs.io/ |
| 통화 transport (MVP) | Daily.co (앱 내 VoIP) | https://dashboard.daily.co/ |

## 로드맵

### Phase 1 (MVP) — 지금 작업 중
- 앱 내 VoIP **인바운드 통화만**
- STT → Claude → TTS + 감정신호 주입 (`prosody.py`, numpy 기반 가벼운 라벨러)
- SQLite 영속화 (`db.py`) — 일기/프로필/통화기록
- 일기 자동 생성·열람
- `[지난 기록]` 주입 (단기 기억)
- 안전 가드레일 (위기 시 109 안내, `safety_flag`)
- ⏳ 실제 제품 UI (Next.js + Daily SDK) — 스모크 테스트(`call.html`) 통과 후

### Phase 1.5
- 장기 프로필 갱신 (7일 주기)
- AI `[상태]`(기분) 주입
- "온" 전용 보이스 클로닝

### Phase 2 (보류)
- 실제 **070 1인 1번호** (유료 플랜, 통신사 SIP transport)
- **카카오톡 채널 챗봇** (낮시간 텍스트)
- **먼저 전화 걸기 / 가끔 거절** 행동 레이어 (프롬프트 § 3.4는 이미 보관)

## 남은 작업 (TODO)

- [ ] `RTZRSTTService` — 인증·메시지 포맷을 RTZR 문서 기준으로 검증
- [ ] `ProsodyAnalyzer.feed()` — 실제 prosody 분석으로 교체
- [ ] DB 연동 — `load_last_diary` / `save_diary` / `load_user_profile` / `save_user_profile` / `load_recent_diaries` (SQLite로 시작 권장)
- [ ] ElevenLabs `voice` ID — "온" 전용 한국어 보이스 클로닝
- [ ] Pipecat import 경로 — 설치 버전 검증
- [ ] `on_first_participant_joined` 첫 인사 트리거 — system 메시지 방식 vs 빈 user marker 비교
- [ ] 7일 주기 프로필 갱신 잡 (cron / scheduler)
- [ ] 녹음 고지 — 앱 UI 동의 화면 + 첫 응답 한 줄 보조
- [ ] 위기 알림 (`notify_operator_of_safety`) 채널 — 이메일/슬랙

## 이전 코드

이전 Next.js 텍스트 채팅 버전 ("같이 욕해주는 친구")은 `_legacy/` 폴더에 보존됨.
