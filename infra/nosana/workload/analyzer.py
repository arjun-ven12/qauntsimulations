from __future__ import annotations

import time
from io import BytesIO
from subprocess import run

import cv2
import numpy as np
from PIL import Image

from schemas import AnalysisManifest, AnalysisResult, VisualChange


MODEL_NAME = "taskos-opencv-diff-v1"


def gpu_status() -> tuple[bool, str]:
    try:
        result = run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            check=False,
            text=True,
            timeout=2,
        )
        gpu_name = result.stdout.splitlines()[0].strip() if result.stdout.splitlines() else ""
        if result.returncode == 0 and gpu_name:
            return True, gpu_name
    except Exception:
        pass
    return False, "CPU fallback"


def analyze_images(manifest: AnalysisManifest, files: list[tuple[str, bytes]]) -> AnalysisResult:
    started = time.time()
    _, gpu_name = gpu_status()
    decoded = [(role, decode_image(content)) for role, content in files]
    baseline = next((image for role, image in decoded if role == "BEFORE"), decoded[0][1])
    target = next((image for role, image in reversed(decoded) if role in {"FAILURE", "AFTER"}), decoded[-1][1])

    diff_score, bbox = visual_difference(baseline, target)
    confidence = float(max(0.45, min(0.94, 0.45 + diff_score)))
    region = bbox_region(bbox, target.shape)
    outcome = manifest.observedOutcome.lower()

    summary = (
        f"Supplemental GPU visual analysis compared {len(decoded)} checkout screenshot(s) for "
        f"{manifest.invariantType}. The deterministic TaskOS outcome remains {outcome} and authoritative."
    )
    observation = (
        f"Detected visual delta score {diff_score:.2f} around {region}; this is supplemental context for the "
        "stored invariant evidence, not a replacement for it."
    )
    likely = "Repeated checkout submission during delayed payment response is visually consistent with duplicate-submit risk."
    if manifest.observedOutcome == "INCONCLUSIVE":
        likely = "Visual evidence was available, but deterministic execution did not produce a conclusive invariant result."

    return AnalysisResult(
        providerJobId="taskos-nosana-deployment",
        status="COMPLETED",
        summary=summary,
        visualChanges=[VisualChange(region=region, observation=observation, confidence=confidence)],
        likelyFailureMechanism=likely,
        sourceEvidenceIds=[screenshot.evidenceId for screenshot in manifest.screenshots],
        confidence=confidence,
        model=MODEL_NAME,
        gpuName=gpu_name,
        durationMs=int((time.time() - started) * 1000),
        errorCategory=None,
    )


def decode_image(content: bytes) -> np.ndarray:
    image = Image.open(BytesIO(content))
    image.verify()
    image = Image.open(BytesIO(content)).convert("RGB")
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def visual_difference(left: np.ndarray, right: np.ndarray) -> tuple[float, tuple[int, int, int, int] | None]:
    height = min(left.shape[0], right.shape[0])
    width = min(left.shape[1], right.shape[1])
    left = cv2.resize(left[:height, :width], (width, height))
    right = cv2.resize(right[:height, :width], (width, height))
    gray_left = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY)
    gray_right = cv2.cvtColor(right, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(gray_left, gray_right)
    _, threshold = cv2.threshold(diff, 24, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    changed = float(np.count_nonzero(threshold)) / float(width * height)
    if not contours:
        return changed, None
    x, y, w, h = cv2.boundingRect(np.vstack(contours))
    return changed, (int(x), int(y), int(w), int(h))


def bbox_region(bbox: tuple[int, int, int, int] | None, shape: tuple[int, ...]) -> str:
    if not bbox:
        return "overall checkout viewport"
    x, y, w, h = bbox
    height, width = shape[:2]
    horizontal = "left" if x + w / 2 < width / 3 else "right" if x + w / 2 > 2 * width / 3 else "center"
    vertical = "top" if y + h / 2 < height / 3 else "bottom" if y + h / 2 > 2 * height / 3 else "middle"
    return f"{vertical}-{horizontal} viewport"
