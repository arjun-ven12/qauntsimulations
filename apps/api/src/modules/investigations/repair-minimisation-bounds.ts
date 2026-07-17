import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@taskos/database';
import { FinalEvidenceReportService, type FinalFindingReport } from '../experiments/services/final-evidence-report.service.js';
import { aggregateMinimisationDelayBounds, boundedRangeFromAggregatedBounds } from './minimisation-bounds.js';

type ParsedArgs = {
  runId: string;
  apply: boolean;
  evidenceRoot?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const runIndex = argv.indexOf('--run');
  if (runIndex === -1 || !argv[runIndex + 1]) {
    throw new Error('Usage: tsx repair-minimisation-bounds.ts --run <minimisation-run-id> [--apply] [--evidence-root <path>]');
  }
  const evidenceRootIndex = argv.indexOf('--evidence-root');
  return {
    runId: argv[runIndex + 1]!,
    apply: argv.includes('--apply'),
    ...(evidenceRootIndex !== -1 && argv[evidenceRootIndex + 1] ? { evidenceRoot: argv[evidenceRootIndex + 1] } : {}),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const database = new PrismaClient();
  try {
    const run = await database.minimisationRun.findUnique({
      where: { id: args.runId },
      include: {
        candidates: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            variableName: true,
            candidateValue: true,
            result: true,
            conditionDecision: true,
            worldId: true,
            experimentId: true,
          },
        },
        finding: {
          select: {
            id: true,
            causalConditions: true,
            evidence: { include: { artifact: true } },
          },
        },
      },
    });
    if (!run) throw new Error(`Minimisation run not found: ${args.runId}`);

    const bounds = aggregateMinimisationDelayBounds({
      existingPassingDelayMs: run.knownPassingDelayMs,
      existingFailingDelayMs: run.knownFailingDelayMs,
      candidates: run.candidates,
    });
    const before = {
      knownPassingDelayMs: run.knownPassingDelayMs,
      knownFailingDelayMs: run.knownFailingDelayMs,
      finalBoundedRange: run.finalBoundedRange,
    };
    const finalBoundedRangeRecord = record(run.finalBoundedRange);
    const targetPrecisionMs = typeof finalBoundedRangeRecord.targetPrecisionMs === 'number'
      ? finalBoundedRangeRecord.targetPrecisionMs
      : undefined;
    const afterRange = boundedRangeFromAggregatedBounds(bounds, targetPrecisionMs);
    const after = {
      knownPassingDelayMs: bounds.knownPassingDelayMs ?? null,
      knownFailingDelayMs: bounds.knownFailingDelayMs ?? null,
      finalBoundedRange: afterRange,
    };

    console.log(JSON.stringify({
      runId: run.id,
      mode: args.apply ? 'apply' : 'dry-run',
      before,
      after,
      evidence: run.candidates.map((candidate) => ({
        candidateId: candidate.id,
        variableName: candidate.variableName,
        candidateValue: candidate.candidateValue,
        result: candidate.result,
        conditionDecision: candidate.conditionDecision,
        worldId: candidate.worldId,
        experimentId: candidate.experimentId,
      })),
      contradictory: bounds.contradictory,
    }, null, 2));

    if (bounds.contradictory) {
      throw new Error('Refusing repair because structured candidate evidence is contradictory');
    }
    if (!args.apply) return;

    const causalConditions = record(run.finding.causalConditions);
    const minimalTestedConditions = record(causalConditions.minimalTestedConditions);
    const finalMinimalTestedConditions = record(run.finalMinimalTestedConditions);
    await database.$transaction(async (transaction) => {
      await transaction.minimisationRun.update({
        where: { id: run.id },
        data: {
          ...(bounds.knownPassingDelayMs !== undefined ? { knownPassingDelayMs: bounds.knownPassingDelayMs } : {}),
          ...(bounds.knownFailingDelayMs !== undefined ? { knownFailingDelayMs: bounds.knownFailingDelayMs } : {}),
          finalBoundedRange: json(afterRange),
          finalMinimalTestedConditions: json({
            ...finalMinimalTestedConditions,
            timingRange: afterRange,
          }),
        },
      });
      await transaction.finding.update({
        where: { id: run.findingId },
        data: {
          causalConditions: json({
            ...causalConditions,
            minimalTestedConditions: {
              ...minimalTestedConditions,
              timingRange: afterRange,
            },
          }),
        },
      });
    });

    if (args.evidenceRoot) {
      const root = resolve(args.evidenceRoot);
      const jsonArtifact = run.finding.evidence.map(({ artifact }) => artifact).find((artifact) => artifact.type === 'FINAL_REPORT' && artifact.mimeType === 'application/json');
      const markdownArtifact = run.finding.evidence.map(({ artifact }) => artifact).find((artifact) => artifact.type === 'FINAL_REPORT' && artifact.mimeType === 'text/markdown');
      if (jsonArtifact && markdownArtifact) {
        const reportPath = resolve(root, jsonArtifact.storageKey);
        const report = JSON.parse(await readFile(reportPath, 'utf8')) as FinalFindingReport;
        report.minimisation.boundedRange = afterRange;
        const writer = new FinalEvidenceReportService(root);
        const rewritten = await writer.write(report);
        await database.evidenceArtifact.update({ where: { id: jsonArtifact.id }, data: {
          sizeBytes: rewritten.jsonArtifact.sizeBytes,
          ...(rewritten.jsonArtifact.checksum !== undefined ? { checksum: rewritten.jsonArtifact.checksum } : {}),
          metadata: json({ ...record(jsonArtifact.metadata), checksum: rewritten.jsonChecksum }),
        } });
        await database.evidenceArtifact.update({ where: { id: markdownArtifact.id }, data: {
          sizeBytes: rewritten.markdownArtifact.sizeBytes,
          ...(rewritten.markdownArtifact.checksum !== undefined ? { checksum: rewritten.markdownArtifact.checksum } : {}),
          metadata: json({ ...record(markdownArtifact.metadata), checksum: rewritten.markdownChecksum }),
        } });
        console.log(JSON.stringify({ reportsRewritten: true, jsonArtifactId: jsonArtifact.id, markdownArtifactId: markdownArtifact.id }, null, 2));
      } else {
        console.log(JSON.stringify({ reportsRewritten: false, reason: 'Final report artifacts were not both present.' }, null, 2));
      }
    }
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
