import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { PersistedArtifactInput } from '../../investigations/investigations.types.js';

export interface FinalFindingReportEvidenceItem {
  id: string;
  type: string;
  worldId?: string;
  experimentId?: string;
  description?: string;
}

export interface FinalFindingReport {
  reportVersion: '2026-07-17.prompt8.v1';
  investigationId: string;
  findingId: string;
  title: string;
  generatedAt: string;
  summary: string;
  businessImpact: string;
  environment: {
    projectId: string;
    environmentId: string;
    journeyId: string;
  };
  originalObservation: {
    worldId: string;
    experimentId: string;
    configuration: Record<string, unknown>;
    invariantIds: string[];
  };
  reproduction: {
    reproductionRunId: string;
    exactReproductionWorldId?: string;
    reproductionCount: number;
    outcome: string;
  };
  minimisation: {
    minimisationRunId: string;
    retainedConditions: Record<string, unknown>;
    removedConditions: Record<string, unknown>;
    inconclusiveConditions: Record<string, unknown>;
    boundedRange?: Record<string, unknown>;
    confirmationWorldId?: string;
    confirmed: boolean;
    claimLevel: 'MINIMAL_TESTED_SET';
  };
  confidence: {
    initial: number;
    final: number;
    explanation: string[];
  };
  reproductionSteps: string[];
  evidence: FinalFindingReportEvidenceItem[];
  limitations: string[];
  provenance: {
    plannerProvider: string;
    workerProvider: string;
    runtimeVersion?: string;
    reportGenerator: 'DETERMINISTIC';
  };
}

export interface FinalReportWriteResult {
  jsonPath: string;
  markdownPath: string;
  jsonArtifact: PersistedArtifactInput;
  markdownArtifact: PersistedArtifactInput;
  jsonChecksum: string;
  markdownChecksum: string;
}

export class FinalEvidenceReportService {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  async write(report: FinalFindingReport): Promise<FinalReportWriteResult> {
    const directory = this.insideRoot('reports', report.investigationId, report.findingId);
    await mkdir(directory, { recursive: true });
    const jsonPath = this.insideRoot('reports', report.investigationId, report.findingId, 'final-report.json');
    const markdownPath = this.insideRoot('reports', report.investigationId, report.findingId, 'final-report.md');
    await writeFile(jsonPath, `${JSON.stringify(this.redact(report), null, 2)}\n`, 'utf8');
    await writeFile(markdownPath, this.markdown(report), 'utf8');
    const [jsonArtifact, markdownArtifact] = await Promise.all([
      this.artifact(jsonPath, 'application/json'),
      this.artifact(markdownPath, 'text/markdown'),
    ]);
    return {
      jsonPath,
      markdownPath,
      jsonArtifact,
      markdownArtifact,
      jsonChecksum: jsonArtifact.checksum ?? '',
      markdownChecksum: markdownArtifact.checksum ?? '',
    };
  }

  markdown(report: FinalFindingReport): string {
    const range = report.minimisation.boundedRange
      ? `\nObserved bounded range: \`${JSON.stringify(report.minimisation.boundedRange)}\``
      : '\nNo bounded delay range was established.';
    return [
      `# ${report.title}`,
      '',
      '## Executive summary',
      report.summary,
      '',
      '## Finding overview',
      `Finding ID: \`${report.findingId}\``,
      `Investigation ID: \`${report.investigationId}\``,
      '',
      '## Business impact',
      report.businessImpact,
      '',
      '## Environment',
      `Project: \`${report.environment.projectId}\``,
      `Environment: \`${report.environment.environmentId}\``,
      `Journey: \`${report.environment.journeyId}\``,
      '',
      '## Initial observation',
      `World: \`${report.originalObservation.worldId}\``,
      `Experiment: \`${report.originalObservation.experimentId}\``,
      '',
      '## Exact reproduction',
      `Run: \`${report.reproduction.reproductionRunId}\``,
      `Outcome: ${report.reproduction.outcome}`,
      '',
      '## Controlled comparisons',
      'Candidate trials are indexed in the evidence section and minimisation metadata.',
      '',
      '## Minimisation process',
      `Run: \`${report.minimisation.minimisationRunId}\``,
      `Confirmed: ${report.minimisation.confirmed ? 'yes' : 'no'}`,
      '',
      '## Minimal tested triggering conditions',
      `Retained: \`${JSON.stringify(report.minimisation.retainedConditions)}\``,
      `Removed: \`${JSON.stringify(report.minimisation.removedConditions)}\``,
      `Inconclusive: \`${JSON.stringify(report.minimisation.inconclusiveConditions)}\``,
      '',
      '## Bounded failure range',
      range,
      '',
      '## Reproduction steps',
      ...report.reproductionSteps.map((step, index) => `${index + 1}. ${step}`),
      '',
      '## Invariant results',
      `Invariant IDs: ${report.originalObservation.invariantIds.map((id) => `\`${id}\``).join(', ')}`,
      '',
      '## Evidence index',
      ...report.evidence.map((item) => `- \`${item.id}\` ${item.type}${item.description ? ` — ${item.description}` : ''}`),
      '',
      '## Confidence and causal status',
      `Confidence: ${report.confidence.initial} → ${report.confidence.final}`,
      ...report.confidence.explanation.map((line) => `- ${line}`),
      '',
      '## Contradictory or inconclusive evidence',
      Object.keys(report.minimisation.inconclusiveConditions).length
        ? `Inconclusive conditions: \`${JSON.stringify(report.minimisation.inconclusiveConditions)}\``
        : 'No inconclusive minimisation conditions were recorded.',
      '',
      '## Limitations',
      ...report.limitations.map((line) => `- ${line}`),
      '',
      '## Runtime provenance',
      `Planner provider: ${report.provenance.plannerProvider}`,
      `Worker provider: ${report.provenance.workerProvider}`,
      `Report generator: ${report.provenance.reportGenerator}`,
      '',
    ].join('\n');
  }

  private insideRoot(...parts: string[]): string {
    const path = resolve(this.root, ...parts);
    const storageKey = relative(this.root, path);
    if (storageKey.startsWith('..') || isAbsolute(storageKey)) {
      throw new Error('Final report path escaped the configured evidence root');
    }
    return path;
  }

  private async artifact(path: string, mimeType: string): Promise<PersistedArtifactInput> {
    const storageKey = relative(this.root, path);
    if (storageKey.startsWith('..') || isAbsolute(storageKey)) {
      throw new Error('Final report path escaped the configured evidence root');
    }
    const [details, bytes] = await Promise.all([stat(path), readFile(path)]);
    return {
      type: 'FINAL_REPORT',
      storageKey,
      mimeType,
      sizeBytes: BigInt(details.size),
      checksum: createHash('sha256').update(bytes).digest('hex'),
      metadata: { filename: storageKey.split('/').at(-1) ?? 'final-report', reportVersion: '2026-07-17.prompt8.v1' },
    };
  }

  private redact(report: FinalFindingReport): FinalFindingReport {
    const text = JSON.stringify(report);
    if (/authorization|cookie|set-cookie|x-api-key|password|token|postgresql:\/\//i.test(text)) {
      return {
        ...report,
        limitations: [
          ...report.limitations,
          'Potential secret-like text was detected and omitted from generated narrative fields.',
        ],
        summary: report.summary.replace(/authorization|cookie|set-cookie|x-api-key|password|token/gi, '[redacted]'),
      };
    }
    return report;
  }
}
