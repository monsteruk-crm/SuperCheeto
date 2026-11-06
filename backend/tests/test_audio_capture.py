import unittest
from unittest.mock import patch

from app.audio_capture import discover_audio_sources, _parse_pw_dump_audio_nodes, _parse_short_sources


PW_DUMP_SAMPLE = """
[
  {
    "type": "PipeWire:Interface:Node",
    "info": {
      "props": {
        "media.class": "Audio/Sink",
        "node.name": "alsa_output.pci-0000_00_1f.3.analog-stereo"
      }
    }
  },
  {
    "type": "PipeWire:Interface:Node",
    "info": {
      "props": {
        "media.class": "Audio/Source",
        "node.name": "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor"
      }
    }
  },
  {
    "type": "PipeWire:Interface:Node",
    "info": {
      "props": {
        "media.class": "Audio/Source",
        "node.name": "alsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo"
      }
    }
  },
  {
    "type": "PipeWire:Interface:Node",
    "info": {
      "props": {
        "media.class": "Video/Source",
        "node.name": "ignored.video"
      }
    }
  }
]
""".strip()


class AudioCaptureDiscoveryTests(unittest.TestCase):
    def test_parse_short_sources_splits_monitors_and_mics(self) -> None:
        monitor_sources, mic_sources = _parse_short_sources(
            "0\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tmodule-null-sink\n"
            "1\talsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo\tmodule-alsa-card\n"
        )

        self.assertEqual(monitor_sources, ["alsa_output.pci-0000_00_1f.3.analog-stereo.monitor"])
        self.assertEqual(mic_sources, ["alsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo"])

    def test_parse_pw_dump_audio_nodes_extracts_sources(self) -> None:
        sinks, monitor_sources, mic_sources = _parse_pw_dump_audio_nodes(PW_DUMP_SAMPLE)

        self.assertEqual(sinks, ["alsa_output.pci-0000_00_1f.3.analog-stereo"])
        self.assertEqual(monitor_sources, ["alsa_output.pci-0000_00_1f.3.analog-stereo.monitor"])
        self.assertEqual(mic_sources, ["alsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo"])

    @patch("app.audio_capture.shutil.which")
    @patch("app.audio_capture._run_command")
    def test_discover_audio_sources_falls_back_to_pw_dump_when_pactl_missing(self, run_command, which) -> None:
        def which_side_effect(command_name: str):
            if command_name == "pactl":
                return None
            if command_name == "pw-dump":
                return "/usr/bin/pw-dump"
            return None

        def run_command_side_effect(command):
            if command[0] == "pw-dump":
                return PW_DUMP_SAMPLE
            raise AssertionError(f"Unexpected command: {command}")

        which.side_effect = which_side_effect
        run_command.side_effect = run_command_side_effect

        info = discover_audio_sources()

        self.assertEqual(info.default_sink, "alsa_output.pci-0000_00_1f.3.analog-stereo")
        self.assertEqual(info.default_monitor, "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor")
        self.assertEqual(info.preferred_monitor, "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor")
        self.assertEqual(info.default_source, "alsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo")
        self.assertEqual(info.preferred_mic, "alsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo")
        self.assertEqual(info.monitor_sources, ["alsa_output.pci-0000_00_1f.3.analog-stereo.monitor"])
        self.assertEqual(info.mic_sources, ["alsa_input.usb-Logitech_Logitech_HD_Pro_Webcam_C920-00.analog-stereo"])


if __name__ == "__main__":
    unittest.main()
