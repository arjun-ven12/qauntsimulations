import io
import json

from fastapi.testclient import TestClient
from PIL import Image

from app import app


client = TestClient(app)


def png(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (32, 32), color)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def manifest() -> str:
    return json.dumps({
        "provider": "NOSANA",
        "invariantType": "NO_DUPLICATE_PAYMENT",
        "expectedBehavior": "One checkout creates one payment.",
        "observedOutcome": "FAIL",
        "worldDimensions": {"paymentDelayMs": 1200, "doubleSubmit": True},
        "screenshots": [
            {"evidenceId": "evidence_before", "role": "BEFORE"},
            {"evidenceId": "evidence_failure", "role": "FAILURE"},
        ],
    })


def test_health_returns_provider_status():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["provider"] == "NOSANA"
    assert isinstance(body["gpuAvailable"], bool)


def test_analyze_accepts_multipart_images():
    response = client.post(
        "/analyze",
        data={"manifest": manifest()},
        files=[
            ("images", ("before.png", png((255, 255, 255)), "image/png")),
            ("images", ("failure.png", png((0, 0, 0)), "image/png")),
        ],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "NOSANA"
    assert body["status"] == "COMPLETED"
    assert body["sourceEvidenceIds"] == ["evidence_before", "evidence_failure"]
    assert body["visualChanges"]


def test_rejects_unsupported_mime_and_too_many_images():
    response = client.post(
        "/analyze",
        data={"manifest": manifest()},
        files=[("images", ("bad.gif", b"bad", "image/gif"))],
    )
    assert response.status_code in {400, 415}

    response = client.post(
        "/analyze",
        data={"manifest": manifest().replace('"screenshots": [', '"screenshots": [')},
        files=[
            ("images", ("1.png", png((1, 1, 1)), "image/png")),
            ("images", ("2.png", png((2, 2, 2)), "image/png")),
            ("images", ("3.png", png((3, 3, 3)), "image/png")),
            ("images", ("4.png", png((4, 4, 4)), "image/png")),
        ],
    )
    assert response.status_code == 400
