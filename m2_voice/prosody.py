"""
prosody.py — 가벼운 prosody(목소리 톤) 라벨러

입력: int16 PCM 청크(bytes) + sample_rate
출력: self.current = "톤 낮음, 느림" 같은 한국어 라벨 (감정신호 주입용)

설계:
- numpy + scipy만 사용. librosa 없이 가볍게.
- realtime audio path에서 호출됨 → feed()는 빠른 append만, 분석은 일정 간격마다 한 번.
- 윈도우 ~2초, 갱신 주기 ~0.5초. 분석 한 번 ~ms 단위로 끝남.
- 특징: RMS(에너지), 평균 ZCR(속도 proxy), 80-400Hz 음성 대역의 dominant FFT bin(피치 proxy).
- spec § 4.3: 텍스트와 톤 불일치 시 가중치는 호출부에서 결정.

한계:
- pitch는 FFT dominant bin 근사 — 실제 F0 검출(YIN/pyin)은 더 정확하지만 비용·복잡도↑.
- 속도는 ZCR 기반 근사 — syllable rate가 더 정확하지만 MVP엔 충분.
- 한숨 탐지는 휴리스틱이 복잡해 보류.
"""

from __future__ import annotations

import numpy as np


class ProsodyAnalyzer:
    """rolling 버퍼에 PCM 누적, 일정 간격마다 분석해 라벨 갱신."""

    def __init__(
        self,
        window_secs: float = 2.0,
        update_secs: float = 0.5,
        default_sample_rate: int = 16000,
    ):
        self.window_secs = window_secs
        self.update_secs = update_secs
        self.sample_rate = default_sample_rate
        self.current: str = "중립"

        self._buffer = np.zeros(0, dtype=np.float32)
        self._samples_since_update = 0
        self._last_features: dict = {}

    # ── public ─────────────────────────────────────────────────────────────

    def feed(self, audio: bytes, sample_rate: int | None = None) -> None:
        """오디오 청크 누적. update_secs마다 분석 자동 트리거."""
        if sample_rate:
            self.sample_rate = sample_rate
        if not audio:
            return
        chunk = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
        if chunk.size == 0:
            return

        self._buffer = np.concatenate([self._buffer, chunk])
        max_samples = int(self.window_secs * self.sample_rate)
        if self._buffer.size > max_samples:
            self._buffer = self._buffer[-max_samples:]
        self._samples_since_update += chunk.size

        if self._samples_since_update >= int(self.update_secs * self.sample_rate):
            self._samples_since_update = 0
            self._analyze()

    def features(self) -> dict:
        """디버깅·튜닝용. 가장 최근 분석의 수치 특징 반환."""
        return dict(self._last_features)

    # ── internals ──────────────────────────────────────────────────────────

    def _analyze(self) -> None:
        sr = self.sample_rate
        buf = self._buffer
        if buf.size < int(0.3 * sr):  # 0.3초 미만이면 분석 안정성 부족
            return

        rms = float(np.sqrt(np.mean(buf * buf)))
        if rms < 0.005:  # 사실상 무음
            self.current = "조용함"
            self._last_features = {"rms": rms}
            return

        zcr_per_sec = self._zcr_per_sec(buf, sr)
        dominant_pitch = self._dominant_pitch_hz(buf, sr, fmin=80, fmax=400)

        self.current = self._labelize(rms, dominant_pitch, zcr_per_sec)
        self._last_features = {
            "rms": rms,
            "pitch_hz": dominant_pitch,
            "zcr_per_sec": zcr_per_sec,
        }

    @staticmethod
    def _zcr_per_sec(buf: np.ndarray, sr: int) -> float:
        signs = np.signbit(buf).astype(np.int8)
        zero_crossings = int(np.sum(np.abs(np.diff(signs))))
        duration = buf.size / sr
        return zero_crossings / duration if duration > 0 else 0.0

    @staticmethod
    def _dominant_pitch_hz(buf: np.ndarray, sr: int, fmin: float, fmax: float) -> float:
        n = buf.size
        window = np.hanning(n)
        spectrum = np.abs(np.fft.rfft(buf * window))
        freqs = np.fft.rfftfreq(n, 1.0 / sr)
        mask = (freqs >= fmin) & (freqs <= fmax)
        if not np.any(mask):
            return 0.0
        sub_spec = spectrum[mask]
        sub_freqs = freqs[mask]
        return float(sub_freqs[int(np.argmax(sub_spec))])

    @staticmethod
    def _labelize(rms: float, pitch_hz: float, zcr_per_sec: float) -> str:
        labels: list[str] = []

        # 톤(피치) — 한국어 평균: 남성 ~110Hz, 여성 ~210Hz 부근
        if pitch_hz > 0:
            if pitch_hz < 130:
                labels.append("톤 낮음")
            elif pitch_hz < 220:
                labels.append("톤 보통")
            else:
                labels.append("톤 높음")

        # 속도(ZCR proxy) — 통상 음성 ZCR 1500-4000/sec 부근
        if zcr_per_sec < 1500:
            labels.append("느림")
        elif zcr_per_sec > 4500:
            labels.append("빠름")

        # 에너지(텐션)
        if rms < 0.02:
            labels.append("힘없음")
        elif rms > 0.12:
            labels.append("들뜸")

        return ", ".join(labels) if labels else "중립"
