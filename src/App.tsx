/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import WatermarkRemover from './components/WatermarkRemover';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <WatermarkRemover />
    </div>
  );
}

