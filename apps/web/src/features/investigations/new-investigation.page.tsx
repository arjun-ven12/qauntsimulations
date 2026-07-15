import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { Button } from '@taskos/ui';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { investigationApi } from '../../services/api/index.js';

export function NewInvestigationPage() {
  const { projectId = 'project_demo_checkout' } = useParams();
  const navigate = useNavigate();
  return (
    <>
      <PageHeading
        eyebrow="World design"
        title="New investigation"
        description="Describe the behaviour to challenge. The runtime turns it into bounded worlds."
      />
      <form
        className="card max-w-3xl space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          const item = await investigationApi.createInvestigation({
            ...demoCreateInvestigationInput,
            projectId,
          });
          navigate(`/investigations/${item.id}/plan`);
        }}
      >
        <label className="block">
          Objective
          <textarea
            className="mt-1 min-h-28 w-full"
            defaultValue={demoCreateInvestigationInput.scenario.prompt}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            Browser
            <select className="mt-1 w-full">
              <option>Chromium</option>
            </select>
          </label>
          <label>
            Journey
            <select className="mt-1 w-full">
              <option>Complete checkout</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" defaultChecked /> Single checkout submission
        </label>
        <Button>Queue investigation</Button>
      </form>
    </>
  );
}
