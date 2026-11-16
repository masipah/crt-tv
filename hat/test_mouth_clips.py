import json
from pathlib import Path
import random
from tempfile import TemporaryDirectory
from threading import Event
import unittest
from unittest.mock import patch

import face


class MouthClipsTests(unittest.TestCase):
    def test_random_uses_every_variant_before_refilling_each_bag(self):
        clips = {kind: [f"{kind}-{i}" for i in range(3)] for kind in face.MOUTH_KINDS}
        player = face.MouthClips(clips)
        with patch.object(face, "random", random.Random(553)):
            played = [player.choose("random") for _ in range(1200)]
        for kind, variants in clips.items():
            draws = [name for name in played if name.startswith(kind + "-")]
            self.assertGreater(len(draws), len(variants))
            self.assertTrue(all(first != second for first, second in zip(draws, draws[1:])))
            for start in range(0, len(draws) - len(variants) + 1, len(variants)):
                self.assertCountEqual(draws[start:start + len(variants)], variants)
        joins = {(a.split("-")[0], b.split("-")[0]) for a, b in zip(played, played[1:])}
        self.assertIn(("lick", "lick"), joins)
        self.assertIn(("closed", "closed"), joins)

    def test_less_idle_plays_only_licking_and_talking_clips(self):
        clips = {kind: [f"{kind}-{i}" for i in range(3)] for kind in face.MOUTH_KINDS}
        player = face.MouthClips(clips)
        with patch.object(face, "random", random.Random(553)):
            played = [player.choose("less-idle") for _ in range(120)]
        self.assertEqual(set(played), set(clips["lick"] + clips["talk"]))
        self.assertTrue(all(first != second for first, second in zip(played, played[1:])))

    def test_mode_changes_at_clip_boundary_and_fallback_hides_selector(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            original = root / "mouth.mp4"
            original.touch()
            pack = root / "mouth-clips"
            pack.mkdir()
            for kind in face.MOUTH_KINDS:
                (pack / f"{kind}-01.mp4").touch()
            mode = root / "mode.json"
            status = root / "mouth.json"
            stop = Event()
            played = []

            def finish_clip(_lcd, path, stop, _eyes, *, loop=False):
                self.assertEqual(json.loads(status.read_text()), not loop)
                played.append((path.name, loop))
                if len(played) == 1:
                    mode.write_text('"more-talking"')
                else:
                    stop.set()

            def choose_most_likely(kinds, weights):
                return [kinds[weights.index(max(weights))]]

            with (
                patch.object(face, "MOUTH_SELECTION_FILE", mode),
                patch.object(face, "MOUTH_STATUS_FILE", status),
                patch.object(face.random, "choices", side_effect=choose_most_likely),
                patch.object(face, "play_mouth_clip", side_effect=finish_clip),
            ):
                face.animate_mouth(None, original, stop, None)
                (pack / "talk-01.mp4").unlink()
                stop.clear()
                face.animate_mouth(None, original, stop, None)
            self.assertEqual(played, [("closed-01.mp4", False), ("talk-01.mp4", False), ("mouth.mp4", True)])


if __name__ == "__main__":
    unittest.main()
