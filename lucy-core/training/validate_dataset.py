import csv
import sys
import wave
from pathlib import Path


def main(manifest_name: str) -> None:
    manifest = Path(manifest_name).resolve()
    failures: list[str] = []
    counts = {"0": 0, "1": 0}
    with manifest.open(newline="", encoding="utf-8") as handle:
        for row_number, row in enumerate(csv.DictReader(handle), start=2):
            label = row.get("label", "")
            counts[label] = counts.get(label, 0) + 1
            if label not in {"0", "1"}: failures.append(f"row {row_number}: invalid label")
            if not row.get("license"): failures.append(f"row {row_number}: missing license")
            audio = (manifest.parent / row.get("path", "")).resolve()
            if not audio.is_file():
                failures.append(f"row {row_number}: missing {audio}")
                continue
            try:
                with wave.open(str(audio), "rb") as wav:
                    if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 16000:
                        failures.append(f"row {row_number}: audio must be mono PCM16 at 16 kHz")
            except wave.Error as error:
                failures.append(f"row {row_number}: invalid WAV ({error})")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        raise SystemExit(1)
    print(f"Dataset valid: {counts.get('1', 0)} positive, {counts.get('0', 0)} negative")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_dataset.py DATASET.csv")
    main(sys.argv[1])
