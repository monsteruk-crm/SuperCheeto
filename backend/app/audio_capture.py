from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional


@dataclass
class AudioSourceInfo:
    default_sink: Optional[str]
    default_source: Optional[str]
    default_monitor: Optional[str]
    preferred_monitor: Optional[str]
    preferred_mic: Optional[str]
    monitor_sources: List[str]
    mic_sources: List[str]


def _run_command(command: List[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Command failed")
    return result.stdout


def get_default_sink() -> Optional[str]:
    try:
        output = _run_command(["pactl", "info"])
    except Exception:
        output = None
    if output:
        for line in output.splitlines():
            if line.strip().startswith("Default Sink:"):
                return line.split(":", 1)[1].strip() or None
    if shutil.which("pw-dump"):
        try:
            output = _run_command(["pw-dump"])
        except Exception:
            return None
        sinks, _monitor_sources, _mic_sources = _parse_pw_dump_audio_nodes(output)
        return sinks[0] if sinks else None
    return None


def get_default_source() -> Optional[str]:
    try:
        output = _run_command(["pactl", "info"])
    except Exception:
        output = None
    if output:
        for line in output.splitlines():
            if line.strip().startswith("Default Source:"):
                return line.split(":", 1)[1].strip() or None
    if shutil.which("pw-dump"):
        try:
            output = _run_command(["pw-dump"])
        except Exception:
            return None
        _sinks, _monitor_sources, mic_sources = _parse_pw_dump_audio_nodes(output)
        return mic_sources[0] if mic_sources else None
    return None


def _parse_short_sources(output: str) -> tuple[List[str], List[str]]:
    monitor_sources: List[str] = []
    mic_sources: List[str] = []
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        name = parts[1].strip()
        if not name:
            continue
        if ".monitor" in name:
            monitor_sources.append(name)
        else:
            mic_sources.append(name)
    return monitor_sources, mic_sources


def list_monitor_sources() -> List[str]:
    try:
        output = _run_command(["pactl", "list", "short", "sources"])
    except Exception:
        output = None
    if output:
        monitor_sources, _mic_sources = _parse_short_sources(output)
        if monitor_sources:
            return monitor_sources
    if shutil.which("pw-dump"):
        try:
            output = _run_command(["pw-dump"])
        except Exception:
            return []
        _sinks, monitor_sources, _mic_sources = _parse_pw_dump_audio_nodes(output)
        return monitor_sources
    return []


def list_mic_sources() -> List[str]:
    try:
        output = _run_command(["pactl", "list", "short", "sources"])
    except Exception:
        output = None
    if output:
        _monitor_sources, mic_sources = _parse_short_sources(output)
        if mic_sources:
            return mic_sources
    if shutil.which("pw-dump"):
        try:
            output = _run_command(["pw-dump"])
        except Exception:
            return []
        _sinks, _monitor_sources, mic_sources = _parse_pw_dump_audio_nodes(output)
        return mic_sources
    return []


def _list_sinks_by_index() -> Dict[str, str]:
    try:
        output = _run_command(["pactl", "list", "short", "sinks"])
    except Exception:
        return {}
    sinks: Dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            sinks[parts[0].strip()] = parts[1].strip()
    return sinks


def _extract_prop_value(line: str) -> Optional[str]:
    if "=" not in line:
        return None
    _, value = line.split("=", 1)
    value = value.strip().strip('"')
    return value or None


def _parse_pw_dump_audio_nodes(output: str) -> tuple[List[str], List[str], List[str]]:
    sinks: List[str] = []
    monitor_sources: List[str] = []
    mic_sources: List[str] = []
    try:
        objects = json.loads(output)
    except Exception:
        return sinks, monitor_sources, mic_sources
    if not isinstance(objects, list):
        return sinks, monitor_sources, mic_sources
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        info = obj.get("info")
        if not isinstance(info, dict):
            continue
        props = info.get("props")
        if not isinstance(props, dict):
            props = obj.get("props") if isinstance(obj.get("props"), dict) else {}
        node_name = props.get("node.name")
        media_class = str(props.get("media.class") or "")
        if not isinstance(node_name, str) or not node_name:
            continue
        if media_class.startswith("Audio/Sink"):
            sinks.append(node_name)
        elif media_class.startswith("Audio/Source"):
            if ".monitor" in node_name:
                monitor_sources.append(node_name)
            else:
                mic_sources.append(node_name)
    return sinks, monitor_sources, mic_sources


def get_active_browser_sink() -> Optional[str]:
    try:
        output = _run_command(["pactl", "list", "sink-inputs"])
    except Exception:
        return None

    sinks_by_index = _list_sinks_by_index()
    browser_hints = ("firefox", "chrome", "chromium", "brave", "edge", "youtube")

    current_sink: Optional[str] = None
    context_tokens: List[str] = []

    def pick_from_current() -> Optional[str]:
        if not current_sink:
            return None
        context = " ".join(context_tokens).lower()
        if any(hint in context for hint in browser_hints):
            return sinks_by_index.get(current_sink)
        return None

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if line.startswith("Sink Input #"):
            sink_name = pick_from_current()
            if sink_name:
                return sink_name
            current_sink = None
            context_tokens = []
            continue
        if line.startswith("Sink:"):
            current_sink = line.split(":", 1)[1].strip()
            continue
        if (
            "application.name" in line
            or "application.process.binary" in line
            or "media.name" in line
            or "media.title" in line
        ):
            value = _extract_prop_value(line)
            if value:
                context_tokens.append(value)

    return pick_from_current()


def _build_audio_source_info(
    default_sink: Optional[str],
    default_source: Optional[str],
    monitor_sources: List[str],
    mic_sources: List[str],
    browser_sink: Optional[str] = None,
) -> AudioSourceInfo:
    default_monitor = f"{default_sink}.monitor" if default_sink else None
    browser_monitor = f"{browser_sink}.monitor" if browser_sink else None
    preferred_monitor = browser_monitor if browser_monitor in monitor_sources else None
    if not preferred_monitor and default_monitor in monitor_sources:
        preferred_monitor = default_monitor
    if not preferred_monitor and monitor_sources:
        preferred_monitor = monitor_sources[0]
    preferred_mic = default_source if default_source in mic_sources else None
    if not preferred_mic and mic_sources:
        preferred_mic = mic_sources[0]
    return AudioSourceInfo(
        default_sink=default_sink,
        default_source=default_source,
        default_monitor=default_monitor,
        preferred_monitor=preferred_monitor,
        preferred_mic=preferred_mic,
        monitor_sources=monitor_sources,
        mic_sources=mic_sources,
    )


def _discover_audio_sources_from_pactl() -> AudioSourceInfo:
    default_sink = get_default_sink()
    default_source = get_default_source()
    monitor_sources = list_monitor_sources()
    mic_sources = list_mic_sources()
    browser_sink = get_active_browser_sink()
    return _build_audio_source_info(
        default_sink=default_sink,
        default_source=default_source,
        monitor_sources=monitor_sources,
        mic_sources=mic_sources,
        browser_sink=browser_sink,
    )


def _discover_audio_sources_from_pw_dump() -> AudioSourceInfo:
    try:
        output = _run_command(["pw-dump"])
    except Exception:
        return AudioSourceInfo(
            default_sink=None,
            default_source=None,
            default_monitor=None,
            preferred_monitor=None,
            preferred_mic=None,
            monitor_sources=[],
            mic_sources=[],
        )
    sinks, monitor_sources, mic_sources = _parse_pw_dump_audio_nodes(output)
    return _build_audio_source_info(
        default_sink=sinks[0] if sinks else None,
        default_source=mic_sources[0] if mic_sources else None,
        monitor_sources=monitor_sources,
        mic_sources=mic_sources,
    )


def discover_audio_sources() -> AudioSourceInfo:
    pactl_available = shutil.which("pactl") is not None
    pw_dump_available = shutil.which("pw-dump") is not None

    if pactl_available:
        pactl_sources = _discover_audio_sources_from_pactl()
        if pactl_sources.monitor_sources or pactl_sources.mic_sources:
            return pactl_sources
    if pw_dump_available:
        pw_sources = _discover_audio_sources_from_pw_dump()
        if pw_sources.monitor_sources or pw_sources.mic_sources:
            return pw_sources
    if pactl_available:
        return _discover_audio_sources_from_pactl()
    if pw_dump_available:
        return _discover_audio_sources_from_pw_dump()
    return AudioSourceInfo(
        default_sink=None,
        default_source=None,
        default_monitor=None,
        preferred_monitor=None,
        preferred_mic=None,
        monitor_sources=[],
        mic_sources=[],
    )


def _build_parec_command(source_name: Optional[str]) -> List[str]:
    cmd = [
        "parec",
        "--format=s16le",
        "--rate=16000",
        "--channels=1",
    ]
    if source_name:
        cmd.extend(["-d", source_name])
    return cmd


def _build_pwcat_command(source_name: Optional[str]) -> List[str]:
    cmd = ["pw-cat", "--record", "--rate", "16000", "--channels", "1", "--format", "s16le"]
    if source_name:
        cmd.extend(["--target", source_name])
    return cmd


def _candidate_commands(source_name: Optional[str]) -> Iterable[List[str]]:
    if shutil.which("parec"):
        yield _build_parec_command(source_name)
    if shutil.which("pw-cat"):
        yield _build_pwcat_command(source_name)


class AudioCapture:
    def __init__(self, source_name: Optional[str], chunk_bytes: int) -> None:
        self.source_name = source_name
        self.chunk_bytes = chunk_bytes
        self._process: Optional[asyncio.subprocess.Process] = None

    async def start(self) -> None:
        last_error: Optional[str] = None
        for cmd in _candidate_commands(self.source_name):
            try:
                self._process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await asyncio.sleep(0.2)
                if self._process.returncode is not None:
                    stderr = await self._process.stderr.read()
                    last_error = stderr.decode().strip() or "Capture process exited"
                    continue
                return
            except FileNotFoundError as exc:
                last_error = str(exc)
            except Exception as exc:
                last_error = str(exc)
        raise RuntimeError(
            last_error
            or "No audio capture command available. Install 'parec' or 'pw-cat'."
        )

    async def stop(self) -> None:
        if not self._process:
            return
        self._process.terminate()
        try:
            await asyncio.wait_for(self._process.wait(), timeout=1.5)
        except asyncio.TimeoutError:
            self._process.kill()
            await self._process.wait()
        self._process = None

    async def stream(self):
        if not self._process or not self._process.stdout:
            raise RuntimeError("Audio capture not started")
        while True:
            chunk = await self._process.stdout.read(self.chunk_bytes)
            if not chunk:
                break
            yield chunk
