import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import face


class TestBacklight:
    def __init__(self):
        self.applied = []

    @property
    def value(self):
        return self.applied[-1] / 100

    @value.setter
    def value(self, value):
        # GPIO Zero's LGPIO backend truncates rather than rounds.
        self.applied.append(int(value * 100))


class HatBrightnessTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.eye_request = root / "eye.json"
        self.mouth_request = root / "mouth.json"
        self.status = root / "brightness.json"
        self.enterContext(patch.object(face, "EYE_BRIGHTNESS_FILE", self.eye_request))
        self.enterContext(patch.object(face, "MOUTH_BRIGHTNESS_FILE", self.mouth_request))
        self.enterContext(patch.object(face, "BRIGHTNESS_STATUS_FILE", self.status))

    def test_live_changes_apply_independently_and_report_hardware_levels(self):
        eyes = [Mock(), Mock()]
        backlight = TestBacklight()
        current = face.apply_brightness(eyes, backlight, None)
        self.assertEqual(json.loads(self.status.read_text()), {"eyes": 50, "mouth": 50})
        for display in eyes:
            display.contrast.assert_called_once_with(128)

        self.mouth_request.write_text("29")
        current = face.apply_brightness(eyes, backlight, current)
        self.assertEqual(backlight.applied, [50, 29])
        for display in eyes:
            display.contrast.assert_called_once_with(128)

        self.eye_request.write_text("20")
        face.apply_brightness(eyes, backlight, current)
        self.assertEqual(json.loads(self.status.read_text()), {"eyes": 20, "mouth": 29})
        for display in eyes:
            display.contrast.assert_called_with(51)
        self.assertEqual(backlight.applied, [50, 29])

    def test_service_restart_reapplies_requests_and_empty_run_uses_defaults(self):
        self.eye_request.write_text("1")
        self.mouth_request.write_text("58")
        for _ in range(2):
            eyes = [Mock(), Mock()]
            backlight = TestBacklight()
            face.apply_brightness(eyes, backlight, None)
            self.assertEqual(json.loads(self.status.read_text()), {"eyes": 1, "mouth": 58})
            for display in eyes:
                display.contrast.assert_called_once_with(3)
            self.assertEqual(backlight.applied, [58])

        self.eye_request.unlink()
        self.mouth_request.unlink()
        face.apply_brightness([Mock(), Mock()], TestBacklight(), None)
        self.assertEqual(json.loads(self.status.read_text()), {"eyes": 50, "mouth": 50})


if __name__ == "__main__":
    unittest.main()
