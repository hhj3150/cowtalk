import { COWTALK_VERSION } from '@cowtalk/shared';

export function App(): React.JSX.Element {
  return (
    <div>
      <h1>CowTalk v{COWTALK_VERSION}</h1>
      <p>축산 디지털 운영체제 — Phase 7에서 본격 구현</p>
    </div>
  );
}
