ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'FINAL_REPORT';

ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_plan_created';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_candidate_generated';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_candidate_started';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_candidate_completed';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_condition_removed';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_condition_retained';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_range_updated';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimal_reproduction_found';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'final_report_started';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'final_report_completed';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_completed';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_inconclusive';
ALTER TYPE "InvestigationEventType" ADD VALUE IF NOT EXISTS 'minimisation_cancelled';
