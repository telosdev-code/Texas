import { NotPortedScreen } from '@/screens/NotPortedScreen';

export default function Learn() {
  return (
    <NotPortedScreen
      title="Learn the math"
      summary="Lessons with live calculators and a CFR solver demo. Available in the web app today."
      plan={['Pot odds, EV, combinatorics, bluffing and range lessons', 'Live Kuhn poker CFR run with convergence chart']}
    />
  );
}
