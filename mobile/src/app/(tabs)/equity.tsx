import { NotPortedScreen } from '@/screens/NotPortedScreen';

export default function Equity() {
  return (
    <NotPortedScreen
      title="Equity calculator"
      summary="Exact or Monte Carlo equity for 2–6 hands or ranges. Available in the web app today."
      plan={['Card picker sheet', 'Range input with the matrix', 'Background computation so long enumerations do not freeze the screen']}
    />
  );
}
