import { NotPortedScreen } from '@/screens/NotPortedScreen';

export default function Ranges() {
  return (
    <NotPortedScreen
      title="Range matrix"
      summary="The interactive 13×13 starting-hand matrix. Available in the web app today."
      plan={['Drag-to-paint with gesture handling', 'Weighted brushes, top-X% slider, presets', 'Text import/export']}
    />
  );
}
