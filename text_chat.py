"""
text_chat.py — 온 페르소나 텍스트 테스트
음성·STT·TTS·Daily 다 빼고 터미널에서 대화. 페르소나·메모리 주입·일기 생성을 *지금* 검증.

사용:
  .venv/bin/python text_chat.py
  > 안녕
  온: ...
  > /e 톤 낮음, 한숨
  > 오늘 좀 지쳤어
  온: ...
  > /quit
  [일기 생성 → DB 저장]

명령:
  /e <라벨>   다음 한 메시지에 [감정신호: ...] 붙임
  /quit       대화 종료 + 일기 생성
  /nodiary    일기 생성 없이 종료
  /reset      DB의 이 사용자 데이터 초기화 (다음 실행부터 적용)
"""

from __future__ import annotations

import asyncio
import os
import sys

from anthropic import AsyncAnthropic
from dotenv import load_dotenv

import db
from companion_call_bot import (
    build_system_prompt,
    compute_ai_mood_state,
    pick_next_topic,
    generate_diary,
)

USER_ID = os.getenv("AGITA_TEST_USER_ID", "text_test_user")
MODEL = "claude-sonnet-4-6"


def fmt_context(label: str, value) -> str:
    if value is None or value == [] or value == {} or value == "":
        return f"  {label}: (없음)"
    if isinstance(value, (dict, list)):
        import json
        return f"  {label}: {json.dumps(value, ensure_ascii=False)[:200]}"
    return f"  {label}: {value}"


async def stream_assistant(client, messages, system_prompt) -> str:
    print("\n온: ", end="", flush=True)
    full = ""
    async with client.messages.stream(
        model=MODEL,
        max_tokens=512,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            print(text, end="", flush=True)
            full += text
    print()
    return full


async def chat():
    load_dotenv(".env.local")
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY가 없어요. .env.local 확인.", file=sys.stderr)
        sys.exit(1)

    db.init_db()
    db.ensure_user(USER_ID, "테스터")

    intensity = (input("강도 (담백/다정/설렘) [다정]: ").strip() or "다정")
    db.upsert_companion(USER_ID, name="온", intensity=intensity)

    last_diary = db.load_last_diary(USER_ID)
    user_profile = db.load_user_profile(USER_ID)
    ai_mood_state = compute_ai_mood_state(USER_ID)
    next_topic = pick_next_topic(USER_ID)

    system_prompt = build_system_prompt(
        "온", last_diary, user_profile, ai_mood_state, next_topic, intensity
    )

    print()
    print("━" * 50)
    print(" 주입된 컨텍스트")
    print("━" * 50)
    print(fmt_context("지난 기록", last_diary))
    print(fmt_context("프로필", user_profile))
    print(fmt_context("상태", ai_mood_state))
    print(fmt_context("다음 화제", next_topic))
    print(fmt_context("강도", intensity))
    print()
    print(" 명령: /e <라벨>  /quit  /nodiary  /reset")
    print("━" * 50)

    client = AsyncAnthropic()
    messages: list[dict] = []
    transcript_lines: list[str] = []
    next_emotion: str | None = None
    call_id = db.start_call(USER_ID)
    should_make_diary = True

    # 첫 인사 트리거 — 통화 연결 마커. transcript엔 안 넣음(일기에 잡음).
    messages.append({"role": "user", "content": "(통화 연결됨)"})
    greeting = await stream_assistant(client, messages, system_prompt)
    messages.append({"role": "assistant", "content": greeting})
    transcript_lines.append(f"온: {greeting}")

    try:
        while True:
            try:
                line = input("\n> ").strip()
            except EOFError:
                break
            if not line:
                continue
            if line == "/quit":
                break
            if line == "/nodiary":
                should_make_diary = False
                break
            if line == "/reset":
                print("(다음 실행부터 적용됩니다. 지금 세션은 그대로.)")
                with db.connect() as conn:
                    conn.execute("DELETE FROM diaries WHERE user_id = ?", (USER_ID,))
                    conn.execute("DELETE FROM profiles WHERE user_id = ?", (USER_ID,))
                    conn.execute("DELETE FROM calls WHERE user_id = ?", (USER_ID,))
                continue
            if line.startswith("/e "):
                next_emotion = line[3:].strip()
                print(f"  ↳ 다음 메시지에 [감정신호: {next_emotion}] 붙임")
                continue

            user_text = line
            if next_emotion:
                user_text = f"[감정신호: {next_emotion}] {line}"
                next_emotion = None

            messages.append({"role": "user", "content": user_text})
            transcript_lines.append(f"사용자: {line}")

            reply = await stream_assistant(client, messages, system_prompt)
            messages.append({"role": "assistant", "content": reply})
            transcript_lines.append(f"온: {reply}")
    except KeyboardInterrupt:
        print("\n(중단)")

    transcript = "\n".join(transcript_lines)
    db.end_call(call_id, transcript)

    if not should_make_diary or not transcript.strip():
        print("\n(일기 생성 건너뜀)")
        return

    print("\n" + "━" * 50)
    print(" 일기 생성 중…")
    print("━" * 50)
    diary = await generate_diary(transcript, USER_ID, call_id)
    print()
    print(f"  date:        {diary.get('date')}")
    print(f"  mood:        {diary.get('mood')}")
    print(f"  safety_flag: {diary.get('safety_flag')}")
    print(f"  diary:       {diary.get('diary')}")
    print(f"  followups:   {diary.get('followups')}")


if __name__ == "__main__":
    asyncio.run(chat())
