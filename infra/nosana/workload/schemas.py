from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ScreenshotManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidenceId: str = Field(min_length=1, max_length=200)
    role: Literal["BEFORE", "AFTER", "FAILURE"]


class AnalysisManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["NOSANA"] = "NOSANA"
    invariantType: str = Field(min_length=1, max_length=2000)
    expectedBehavior: str = Field(min_length=1, max_length=2000)
    observedOutcome: Literal["FAIL", "INCONCLUSIVE"]
    worldDimensions: dict[str, str | int | float | bool] = Field(default_factory=dict)
    screenshots: list[ScreenshotManifest] = Field(min_length=1, max_length=3)

    @field_validator("invariantType", "expectedBehavior")
    @classmethod
    def no_secret_or_path(cls, value: str) -> str:
        lowered = value.lower()
        forbidden = ["/users/", "/private/", "/home/daytona/", "authorization", "bearer ", "cookie", "api_key", "secret"]
        if any(item in lowered for item in forbidden):
            raise ValueError("manifest contains unsafe text")
        return value


class VisualChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region: str = Field(min_length=1, max_length=200)
    observation: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(ge=0, le=1)


class AnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["NOSANA"] = "NOSANA"
    providerJobId: str = Field(min_length=1, max_length=200)
    status: Literal["COMPLETED", "FAILED", "TIMED_OUT"]
    summary: str | None = Field(default=None, max_length=2000)
    visualChanges: list[VisualChange] = Field(default_factory=list, max_length=10)
    likelyFailureMechanism: str | None = Field(default=None, max_length=2000)
    sourceEvidenceIds: list[str] = Field(min_length=1, max_length=3)
    confidence: float | None = Field(default=None, ge=0, le=1)
    model: str | None = Field(default=None, max_length=200)
    gpuName: str | None = Field(default=None, max_length=200)
    durationMs: int | None = Field(default=None, ge=0)
    errorCategory: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    provider: Literal["NOSANA"]
    gpuAvailable: bool
    gpuName: str
