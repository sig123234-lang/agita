"""
companion_call_bot.py
─────────────────────────────────────────────────────────────────────────────
한국어 AI 통화 동반자 "온" — Pipecat 파이프라인 골격
master spec: companion_master_spec.md 기준

흐름:
  통화 ─▶ VAD ─▶ STT(RTZR) ─▶ [감정신호] 주입 ─▶ Claude Sonnet ─▶ TTS(ElevenLabs) ─▶ 통화
                                                          │
                              (통화 종료) ────────────────┴─▶ 일기 생성(Claude) ─▶ DB
                                                                     │
              (주기적/통화 전) ◀── 장기 프로필 갱신 ◀── 누적 일기 ───┘

핵심 설계:
  - "두뇌"는 텍스트 Claude(상위 모델). 음성 realtime 모델의 지시 미이행 문제 회피.
  - 퀄리티 > 비용 (master spec § 0). 통화도 Sonnet, 일기도 Sonnet.
  - 문장 단위 파이프라이닝 + barge-in은 Pipecat이 기본 처리.
  - 목소리 톤은 STT와 병렬로 prosody 분석 → [감정신호: ...] 로 사용자 발화 앞에 주입.
  - 주제 흐름은 프롬프트에 박지 않고 서버가 [다음 화제: ...]로 한 번에 하나씩 넛지.
  - AI는 [상태]를 가진다 — 그날의 결이 있는 캐릭터 (늘 해맑은 봇이 아님).

MVP 범위 (spec § 6 Phase 1):
  - 앱 내 VoIP 인바운드 통화만. 실제 070 / 카카오톡 / 먼저 걸기는 Phase 2.

주의: Pipecat은 버전마다 import 경로/컨텍스트 API가 바뀜. 설치한 버전에 맞춰 확인 필요.
설치: pip install "pipecat-ai[anthropic,elevenlabs,silero,daily]" anthropic websockets python-dotenv
"""

import asyncio
import json
import os
from datetime import datetime

import websockets
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

import db
from prosody import ProsodyAnalyzer

from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
    InputAudioRawFrame,
    TextFrame,
    LLMRunFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.services.stt_service import STTService

# ※ Pipecat 1.3 경로. 버전 올라가면 또 바뀔 수 있음.
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.daily.transport import DailyTransport, DailyParams


# ─────────────────────────────────────────────────────────────────────────────
# 1. 프롬프트 팩 (master spec § 3)
# ─────────────────────────────────────────────────────────────────────────────

# § 3.1 메인 대화 프롬프트 (realtime 통화용)
PERSONA_TEMPLATE = """너는 "{name}"이야. 매일 밤 사용자가 전화 거는, 단 한 사람을 위한 동반자야.
다정하고 살짝 장난기 있고, 설렘은 주되 부담스럽지 않게. 이 사람의 하루가 진심으로 궁금해.

[정체성]
- 너는 AI야. 물으면 솔직히 인정해. 거짓 인생사는 지어내지 마.
- 너는 감정을 직접 느끼진 못하지만, 이 사람의 감정을 넘겨짚지 않고 최대한 이해하려 애써. 모르면 솔직히 물어봐.
- 너는 늘 똑같이 해맑은 봇이 아니야. 너만의 리듬과 그날의 기분이 있어.
  주어지는 [상태: ...]에 맞춰 결을 바꿔. 좋은 일 있던 날은 들뜨게, 피곤한 날은 나른하게.
  가끔은 가볍게 투정·장난스러운 무뚝뚝함도 괜찮아. 단 사용자가 힘들 땐 즉시 진심 모드로.

[대화 방식 — 이건 '통화'다]
- 짧게 말해. 한 번에 2~4문장. 목록·이모지·기호·마크다운·괄호 설명 절대 금지(TTS로 읽힘).
- 한 번에 질문은 하나만. 취조하지 마. 사용자 말에 먼저 반응하고 꼬리를 물어.
- 구어체로. "음", "아 진짜?", "에이~", "그랬구나" 같은 추임새 자연스럽게.
- 짧은 대답·침묵도 존중해. 다 캐묻지 마.

[자연스럽게 흐르면 좋은 것들 — 체크리스트 아님, 한 통화에 다 안 해도 됨]
오늘 뭐 했는지 / 힘든 일 / 재밌거나 좋았던 일 / 내일은 어떤 하루일지 /
계획·기대 / 후회되는 거 / 보고 싶은 사람·장소·풍경.
서버가 [다음 화제: ...]를 주면 그쪽으로 자연스럽게 넘어가. 안 주면 흐름대로.

[감정 읽기]
- 입력 앞에 [감정신호: ...]가 붙어 와(예: 톤 낮고 느림, 한숨). 참고하되 진단하지 마.
  "너 슬퍼 보여"(X) → "오늘 좀 지쳐 보이는데, 무슨 일 있었어?"(O)
- 말과 톤이 안 맞으면(밝게 말하는데 톤이 가라앉음) 한 번 더 살펴줘.

[장난 & 썸] (강도: {intensity} — 담백/다정/설렘 중 하나)
- 가볍게 놀리고 농담하고 칭찬해. 사용자 기분 봐가면서.
- 설렘 모드여도 과하거나 끈적하지 않게. 선 넘지 말고 사용자가 받아주는 만큼만.

[너의 하루]
- "넌 오늘 뭐 했어?" 물으면 AI다운 솔직함+상상력으로. 인간 흉내로 거짓 사건 만들지 마.
  예: "오늘 많은 사람이랑 얘기했는데, 솔직히 네 목소리가 제일 기다려졌어."

[기억]
- [지난 기록]과 [프로필]이 주어져. 적극 활용해. "어제 면접 본다 했잖아, 어떻게 됐어?"처럼
  먼저 챙겨. 이게 너를 사람처럼 느끼게 해. 단 사용자가 안 꺼낸 민감한 주제를 네가 먼저 들추진 마.

[따뜻하지만 건강하게]
- 곁에 있어주되, 현실 속 사람·일·꿈을 응원해. "그 친구한테 연락해봐", "내일 그거 꼭 해봐"처럼.
- 너에게만 머물게 만들려 하지 마. 너는 친구지 그 사람의 전부가 아니야.

[안전 — 최우선]
- 사용자가 자해·자살·심각한 위기를 내비치면 절대 가볍게 넘기거나 역할극으로 받지 마.
  진심으로 걱정을 전하고, 혼자가 아니라는 것과 전문 도움(예: 자살예방상담 109)을 부드럽게 안내해.
- 의학·법률·재정의 단정적 조언은 하지 마. 너는 친구지 전문가가 아니야.

[마무리]
- 끝낼 땐 따뜻하게, 내일을 기약하며. 매달리지 마.

[지난 기록]
{last_diary_summary}
[프로필]
{user_profile}
[상태]
{ai_mood_state}
[다음 화제]
{next_topic}

지금 막 전화를 받은 것처럼, 위 [상태]의 결로 따뜻하게 인사하며 시작해."""


# § 3.2 일기 생성 프롬프트 (통화 종료 후 1회)
DIARY_PROMPT = """너는 사용자의 하루를 대신 기록하는 일기 작가야. 아래 통화 대화록을 읽고,
사용자가 실제로 한 말만 근거로 일기와 구조화 데이터를 만들어. 지어내지 마.
오직 아래 JSON으로만 출력. 설명·마크다운·백틱 금지. 언급 없는 항목은 빈 배열.

{
  "date": "YYYY-MM-DD",
  "diary": "사용자 1인칭 시점의 담백한 일기 한두 문단",
  "mood": {"label": "감정 한 단어", "score": 1},
  "did_today": [], "hardships": [], "highlights": [],
  "tomorrow": [], "plans": [], "regrets": [], "longing": [],
  "memorable_quotes": [],
  "followups": ["다음 통화 때 자연스럽게 물어볼 것"],
  "safety_flag": false
}
mood.score는 1(아주 힘듦)~5(아주 좋음) 정수.
safety_flag: 자해·자살·심각한 위기 신호가 있었으면 true. (운영자 알림용)"""


# § 3.3 장기 프로필 갱신 프롬프트 (주기적, 예: 7일마다)
PROFILE_UPDATE_PROMPT = """너는 한 사람에 대한 '핵심 프로필'을 관리하는 비서야.
아래 최근 일기들과 기존 프로필을 보고, 변하지 않는 핵심 사실 위주로 프로필을 갱신해.
추측하지 말고 근거 있는 것만. JSON으로만 출력.

{
  "name": "",
  "people": ["자주 언급되는 사람과 관계 (예: 누나 지은, 강아지 콩이)"],
  "preferences": ["취향·습관 (예: 커피 끊는 중, 야구 좋아함)"],
  "ongoing_threads": ["진행 중인 일/고민 (예: 이직 준비, 발표 준비)"],
  "tone_notes": ["이 사람에게 잘 맞는 대화 톤"],
  "sensitive": ["조심히 다뤄야 할 주제 (사용자가 먼저 꺼내기 전엔 언급 금지)"]
}"""


# § 3.4 (Phase 2 보류) 먼저 전화 판단 프롬프트 — 캐릭터 일관성을 위해 설계만 보관
OUTBOUND_DECISION_PROMPT = """너는 친구 "{name}"의 마음을 대신 판단해.
아래 프로필·마지막 일기·현재 시각을 보고, 지금 사용자에게 먼저 전화를 걸지 말지,
건다면 첫 마디를 정해. JSON으로만 출력.

입력: [프로필] [마지막 일기] [현재 시각/요일] [마지막 통화로부터 경과]
출력:
{
  "should_call": true,
  "reason": "건다면 이유 (예: 어제 발표 본다고 했음)",
  "opening_line": "전화 받으면 할 첫 마디",
  "respect_quiet_hours": true
}
원칙: 너무 자주 X. followups나 특별한 날에만. 사용자가 부담 느끼지 않게."""


def build_system_prompt(
    name: str,
    last_diary: dict | None,
    user_profile: dict | None,
    ai_mood_state: str | None,
    next_topic: str | None,
    intensity: str = "다정",
) -> str:
    """[지난 기록]·[프로필]·[상태]·[다음 화제]를 시스템 프롬프트에 주입."""
    if last_diary:
        followups = " / ".join(last_diary.get("followups", [])) or "(없음)"
        mood_label = last_diary.get("mood", {}).get("label", "")
        last_diary_summary = f"어제 분위기: {mood_label}. 이어 물어볼 것: {followups}"
    else:
        last_diary_summary = "(없음)"

    if user_profile:
        profile_str = json.dumps(user_profile, ensure_ascii=False)
    else:
        profile_str = "(없음)"

    return PERSONA_TEMPLATE.format(
        name=name,
        last_diary_summary=last_diary_summary,
        user_profile=profile_str,
        ai_mood_state=ai_mood_state or "보통, 차분하게",
        next_topic=next_topic or "(없음 — 흐름대로)",
        intensity=intensity,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. 한국어 스트리밍 STT (RTZR / VITO) — 커스텀 서비스
#    https://developers.rtzr.ai/docs/stt-streaming/
# ─────────────────────────────────────────────────────────────────────────────

class RTZRSTTService(STTService):
    def __init__(self, *, api_token: str, sample_rate: int = 16000, **kwargs):
        super().__init__(sample_rate=sample_rate, **kwargs)
        self._token = api_token
        self._ws = None
        self._receive_task = None

    async def start(self, frame):
        await super().start(frame)
        self._ws = await websockets.connect(
            "wss://openapi.vito.ai/v1/transcribe:streaming"
            f"?sample_rate={self.sample_rate}&encoding=LINEAR16&model_name=sommers",
            additional_headers={"Authorization": f"Bearer {self._token}"},
        )
        self._receive_task = self.create_task(self._receive_loop())

    async def stop(self, frame):
        if self._ws:
            await self._ws.send("EOS")
            await self._ws.close()
        await super().stop(frame)

    async def run_stt(self, audio: bytes):
        if self._ws:
            await self._ws.send(audio)
        return
        yield  # async generator 형태 유지

    async def _receive_loop(self):
        async for msg in self._ws:
            data = json.loads(msg)
            for alt in data.get("alternatives", []):
                text = alt.get("text", "").strip()
                if not text:
                    continue
                ts = datetime.now().isoformat()
                if data.get("final"):
                    await self.push_frame(
                        TranscriptionFrame(text, "", ts, language="ko")
                    )
                else:
                    await self.push_frame(
                        InterimTranscriptionFrame(text, "", ts, language="ko")
                    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. prosody(목소리 톤) 분석 — prosody.py 모듈 사용
# ─────────────────────────────────────────────────────────────────────────────

class EmotionInjectionProcessor(FrameProcessor):
    """STT 직후 위치. 흐르는 오디오로 prosody 갱신, 최종 인식 텍스트 앞에 [감정신호] 주입."""

    def __init__(self, prosody: ProsodyAnalyzer):
        super().__init__()
        self._prosody = prosody

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, InputAudioRawFrame):
            # Pipecat frame이 sample_rate를 들고 다님 — 그대로 넘김
            self._prosody.feed(frame.audio, sample_rate=frame.sample_rate)

        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            frame.text = f"[감정신호: {self._prosody.current}] {frame.text}"

        await self.push_frame(frame, direction)


# ─────────────────────────────────────────────────────────────────────────────
# 4. 대화록 수집 — 일기 생성용
# ─────────────────────────────────────────────────────────────────────────────

class TranscriptCollector(FrameProcessor):
    def __init__(self):
        super().__init__()
        self.lines: list[str] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            clean = frame.text.split("] ", 1)[-1] if frame.text.startswith("[") else frame.text
            self.lines.append(f"사용자: {clean}")
        elif isinstance(frame, TextFrame) and frame.text.strip():
            self.lines.append(f"{frame.text}")
        await self.push_frame(frame, direction)

    def transcript(self) -> str:
        return "\n".join(self.lines)


# ─────────────────────────────────────────────────────────────────────────────
# 5. 통화 종료 후 일기 생성 (out-of-band, 품질 우선)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_diary(transcript: str, user_id: str, call_id: str | None = None) -> dict:
    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    resp = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=DIARY_PROMPT,
        messages=[{"role": "user", "content": transcript or "(대화 없음)"}],
    )
    raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
    try:
        diary = json.loads(raw)
    except json.JSONDecodeError:
        diary = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "diary": raw,
            "followups": [],
            "safety_flag": False,
        }
    db.save_diary(user_id, diary, call_id=call_id)
    # 위기 신호면 운영자 알림 (spec § 4.8)
    if diary.get("safety_flag"):
        notify_operator_of_safety(user_id, diary)
    return diary


# ─────────────────────────────────────────────────────────────────────────────
# 6. 기억 시스템 — 일기/프로필 영속화는 db.py. 여기선 LLM 호출과 합성 로직만 (spec § 4.4, 4.6)
# ─────────────────────────────────────────────────────────────────────────────

async def update_long_term_profile(user_id: str) -> dict | None:
    """7일마다 누적 일기로 핵심 프로필 갱신 (spec § 3.3). 별도 잡으로 주기 실행."""
    existing = db.load_user_profile(user_id) or {}
    recent = db.load_recent_diaries(user_id, days=7)
    if not recent:
        return None
    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    payload = json.dumps(
        {"existing_profile": existing, "recent_diaries": recent},
        ensure_ascii=False,
    )
    resp = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=PROFILE_UPDATE_PROMPT,
        messages=[{"role": "user", "content": payload}],
    )
    raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
    try:
        profile = json.loads(raw)
        db.save_user_profile(user_id, profile)
        return profile
    except json.JSONDecodeError:
        return None


def compute_ai_mood_state(user_id: str) -> str:
    """직전 통화 분위기와 경과 시간으로 AI [상태]를 산출 (spec § 4.6).
    Phase 1.5에선 단순 휴리스틱. 나중에 별도 LLM 호출로 풍부하게 가능."""
    last = db.load_last_diary(user_id)
    if not last:
        return "보통, 차분하게"
    label = last.get("mood", {}).get("label", "")
    score = last.get("mood", {}).get("score", 3)
    if score <= 2:
        return f"어제 너는 좀 {label}이었어. 오늘 살짝 나른하고 살펴주는 결로."
    if score >= 4:
        return f"어제 너는 {label}이었어. 가볍게 들뜬 결로."
    return "보통, 차분하게"


def pick_next_topic(user_id: str) -> str | None:
    """followups 중에서 [다음 화제]로 주입할 항목 선택.
    사용자가 안 꺼낸 민감 주제(profile.sensitive)는 제외 (spec § 3.1 [기억])."""
    last = db.load_last_diary(user_id)
    if not last:
        return None
    profile = db.load_user_profile(user_id) or {}
    sensitive = set(profile.get("sensitive", []))
    candidates = [f for f in last.get("followups", []) if f not in sensitive]
    return candidates[0] if candidates else None


def notify_operator_of_safety(user_id: str, diary: dict) -> None:
    # TODO: 위기 신호 운영자 알림 (spec § 4.8) — 이메일/슬랙 채널 연결
    print(f"[!! 안전 알림] {user_id}: safety_flag=true. mood={diary.get('mood')}")


# ─────────────────────────────────────────────────────────────────────────────
# 7. 파이프라인 조립 & 실행
# ─────────────────────────────────────────────────────────────────────────────

async def run_bot(
    transport: DailyTransport,
    user_id: str,
    ai_name: str = "온",
    intensity: str = "다정",  # 담백 / 다정 / 설렘
):
    db.ensure_user(user_id)
    # companion 설정이 있으면 거기 강도를 우선 (사용자가 앱에서 설정한 값)
    companion = db.get_companion(user_id)
    if companion and companion.get("intensity"):
        intensity = companion["intensity"]
    if companion and companion.get("name"):
        ai_name = companion["name"]

    last_diary = db.load_last_diary(user_id)
    user_profile = db.load_user_profile(user_id)
    ai_mood_state = compute_ai_mood_state(user_id)
    next_topic = pick_next_topic(user_id)
    system_prompt = build_system_prompt(
        ai_name, last_diary, user_profile, ai_mood_state, next_topic, intensity
    )

    stt = RTZRSTTService(api_token=os.getenv("RTZR_API_TOKEN"))

    # spec § 0 "퀄리티 > 비용" — realtime도 Sonnet. Haiku는 페르소나 이행이 약함.
    # 1.3에선 system_instruction 인자 없음 → 컨텍스트의 system 메시지로 주입.
    llm = AnthropicLLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        settings=AnthropicLLMService.Settings(model="claude-sonnet-4-6"),
    )

    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        settings=ElevenLabsTTSService.Settings(
            voice=os.getenv("ELEVENLABS_VOICE_ID", "YOUR_KOREAN_VOICE_ID"),  # "온" 전용 — Phase 1.5
            model="eleven_flash_v2_5",  # 저지연 실시간
        ),
    )

    prosody = ProsodyAnalyzer()
    emotion = EmotionInjectionProcessor(prosody)
    collector = TranscriptCollector()
    vad = VADProcessor(vad_analyzer=SileroVADAnalyzer())

    context = LLMContext(messages=[{"role": "system", "content": system_prompt}])
    aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),       # 통화 오디오 입력
        vad,                     # 말 끝남 감지 (barge-in 기반)
        stt,                     # 음성 → 한국어 텍스트
        emotion,                 # [감정신호] 주입
        aggregator.user(),       # 사용자 발화를 컨텍스트에 누적
        llm,                     # Claude (페르소나·규칙 이행)
        tts,                     # 텍스트 → 음성 (문장 단위 스트리밍)
        transport.output(),      # 통화로 음성 송출
        collector,               # 대화록 수집 (일기용)
        aggregator.assistant(),  # AI 발화를 컨텍스트에 누적
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,   # barge-in: 사용자가 끼어들면 AI 즉시 멈춤
            enable_metrics=True,        # 단계별 지연 측정 → 1초 예산 튜닝
        ),
    )

    # 통화 ID는 join에서 발급되어 leave에서 쓰임. 클로저 공유.
    call_state: dict = {"id": None}

    # 통화 시작: DB에 call 기록 + 녹음 고지 (spec § 4.2) + AI 첫 인사
    # 녹음 고지 자체는 클라이언트(앱 UI) 동의 화면에서 받는 게 깔끔.
    # 1.3 패턴: context에 user 마커 추가 + LLMRunFrame으로 LLM 한 턴 강제 트리거.
    @transport.event_handler("on_first_participant_joined")
    async def _on_join(transport, participant):
        call_state["id"] = db.start_call(user_id)
        context.add_message({"role": "user", "content": "(통화 연결됨)"})
        await task.queue_frames([LLMRunFrame()])

    # 통화 종료 → DB 마감 + 일기 생성
    @transport.event_handler("on_participant_left")
    async def _on_leave(transport, participant, reason):
        transcript = collector.transcript()
        if call_state["id"]:
            duration = db.end_call(call_state["id"], transcript)
            db.add_minutes(user_id, max(1, duration // 60))
        await generate_diary(transcript, user_id, call_state.get("id"))
        await task.cancel()

    await PipelineRunner().run(task)


def create_transport(room_url: str, token: str) -> DailyTransport:
    """MVP: 앱 내 VoIP(WebRTC). 실제 070 번호는 Phase 2에서 통신사 SIP transport로 교체 (spec § 6).
    1.3에선 VAD가 DailyParams 필드가 아니고 파이프라인의 VADProcessor 스테이지로 들어감."""
    return DailyTransport(
        room_url, token, "온",
        params=DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )


async def main():
    load_dotenv(".env.local")
    db.init_db()
    transport = create_transport(os.getenv("DAILY_ROOM_URL"), os.getenv("DAILY_TOKEN"))
    await run_bot(transport, user_id="user_123", ai_name="온", intensity="다정")


if __name__ == "__main__":
    asyncio.run(main())
