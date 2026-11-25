import { useQuery } from '@tanstack/react-query';
import { getHealth, getReadiness, statusKeys } from '../api/status.js';
import { Button } from '../components/ui/Button.jsx';
import { Spinner } from '../components/ui/states.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../components/ui/surfaces.jsx';

function probeResult(query, successMessage) {
  if (query.isError) {
    if (
      query.error.status === 503 &&
      query.error.code === 'DEPENDENCY_UNAVAILABLE'
    ) {
      return { message: 'Database unavailable', tone: 'warning' };
    }
    if (['NETWORK_ERROR', 'TIMEOUT'].includes(query.error.code)) {
      return { message: 'Backend unreachable', tone: 'danger' };
    }
    return { message: query.error.message, tone: 'danger' };
  }
  return { message: successMessage, tone: 'success' };
}

function Probe({ title, query, successMessage }) {
  const { message, tone } = probeResult(query, successMessage);

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {query.isPending ? (
        <Spinner label="Checking" />
      ) : (
        <div role="status">
          <Badge tone={tone}>{message}</Badge>
        </div>
      )}
    </Card>
  );
}

export default function ApiDiagnostics() {
  const health = useQuery({
    queryKey: statusKeys.health,
    queryFn: getHealth,
    retry: false,
    staleTime: 0,
  });
  const readiness = useQuery({
    queryKey: statusKeys.readiness,
    queryFn: getReadiness,
    retry: false,
    staleTime: 0,
  });

  return (
    <Container className="grid gap-5 py-12">
      <SectionHeading as="h1">API diagnostics</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Probe
          title="Liveness"
          query={health}
          successMessage="Backend available"
        />
        <Probe
          title="Readiness"
          query={readiness}
          successMessage="Backend and database ready"
        />
      </div>
      <div>
        <Button
          onClick={() => {
            void health.refetch();
            void readiness.refetch();
          }}
          loading={health.isFetching || readiness.isFetching}
        >
          Run checks again
        </Button>
      </div>
    </Container>
  );
}
