import json
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from analyzer import analyze_images, gpu_status
from schemas import AnalysisManifest, AnalysisResult, HealthResponse

MAX_IMAGES = 3
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}

app = FastAPI(title="TaskOS Nosana Evidence Intelligence", version="1.0.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    available, name = gpu_status()
    return HealthResponse(status="ok", provider="NOSANA", gpuAvailable=available, gpuName=name)


@app.post("/analyze", response_model=AnalysisResult)
async def analyze(
    manifest: Annotated[str, Form()],
    images: Annotated[list[UploadFile], File()],
) -> AnalysisResult:
    if not images or len(images) > MAX_IMAGES:
        raise HTTPException(status_code=400, detail="One to three images are required.")
    try:
        parsed = AnalysisManifest.model_validate_json(manifest)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Manifest JSON is invalid.") from error
    if len(parsed.screenshots) != len(images):
        raise HTTPException(status_code=400, detail="Image count must match manifest screenshots.")

    file_payloads: list[tuple[str, bytes]] = []
    for screenshot, image in zip(parsed.screenshots, images, strict=True):
        content_type = (image.content_type or "").split(";")[0].lower()
        if content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=415, detail="Only PNG, JPEG, and WebP images are supported.")
        content = await read_bounded(image)
        file_payloads.append((screenshot.role, content))

    result = analyze_images(parsed, file_payloads)
    # Round-trip through Pydantic JSON to enforce strict serialisable output.
    return AnalysisResult.model_validate(json.loads(result.model_dump_json()))


async def read_bounded(file: UploadFile) -> bytes:
    content = await file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds five MiB limit.")
    if not content:
        raise HTTPException(status_code=400, detail="Image is empty.")
    return content
