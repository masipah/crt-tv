import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import face


class EyeRotationTests(unittest.TestCase):
    def setUp(self):
        folder = self.enterContext(TemporaryDirectory())
        self.status_file = Path(folder) / "eyes.json"
        self.selection_file = Path(folder) / "selection.json"
        self.enterContext(patch.object(face, "EYE_STATUS_FILE", self.status_file))
        self.enterContext(patch.object(face, "EYE_SELECTION_FILE", self.selection_file))

    def test_random_pair_changes_every_ten_minutes(self):
        state = face.initial_eye_rotation("Original", 20)
        self.assertEqual(state["current"], "Original")
        self.assertIs(face.update_eye_rotation(state, None, "Original", 619.99), state)
        first = face.update_eye_rotation(state, None, "Original", 620)
        self.assertNotEqual(first["current"], state["current"])
        self.assertEqual(first["switchAt"], 1220)
        second = face.update_eye_rotation(first, None, "Original", 1220)
        self.assertNotEqual(second["current"], first["current"])

    def test_manual_pick_takes_priority_and_starts_a_new_interval(self):
        boot_style = "Original"
        state = face.initial_eye_rotation(boot_style, 20)
        request = {"style": "Spirals", "id": "first"}
        manual = face.update_eye_rotation(state, request, boot_style, 620)
        self.assertEqual(manual["current"], "Spirals")
        repeated = {"style": "Spirals", "id": "second"}
        manual = face.update_eye_rotation(manual, repeated, boot_style, 900)
        self.assertEqual(manual["switchAt"], 1500)
        self.assertIs(face.update_eye_rotation(manual, repeated, boot_style, 1499), manual)
        expired = face.update_eye_rotation(manual, repeated, boot_style, 1500)
        self.assertNotEqual(expired["current"], "Spirals")
        self.assertEqual(expired["selection"], "auto")
        self.assertIs(face.update_eye_rotation(expired, repeated, boot_style, 1501), expired)

    def test_service_restart_uses_the_existing_timer_and_request(self):
        self.selection_file.write_text('"Spirals"')
        request = face.requested_eye_style()
        self.assertEqual(request["style"], "Spirals")
        state = face.initial_eye_rotation("Original", 20)
        manual = face.update_eye_rotation(state, request, "Original", 50)
        face.publish_eye_style(manual)
        resumed = face.initial_eye_rotation("Original", 500)
        self.assertEqual(resumed["switchAt"], 650)
        expired = face.update_eye_rotation(resumed, request, "Original", 650)
        face.publish_eye_style(expired)
        rebooted_service = face.initial_eye_rotation("Original", 700)
        self.assertIs(
            face.update_eye_rotation(rebooted_service, request, "Original", 700),
            rebooted_service,
        )
        self.assertNotEqual(rebooted_service["current"], "Spirals")


if __name__ == "__main__":
    unittest.main()
