/**
 * RekHeader - Branded header component for rek shell
 *
 * Features:
 * - 3-column layout using SplitBox
 * - Column 1: Logo + version
 * - Column 2: FPS + CPU/RAM sparklines
 * - Column 3: Jobs count + base URL
 */

import {
  Box,
  Text,
  SplitBox,
  Sparkline,
  useFps,
} from 'tuiuiu.js';
import { themeColor } from './theme-helper.js';
import type { VNode } from 'tuiuiu.js';
import { getVersionSync } from '../../../version.js';
import {
  useSystemMetrics,
  getUsageColor,
  startMetricsMonitoring,
} from '../hooks/useSystemMetrics.js';

// =============================================================================
// Types
// =============================================================================

export interface RekHeaderProps {
  /** App mode (e.g., "shell", "chat", "watch") */
  mode?: string;
  /** Optional subtitle/description (base URL) */
  subtitle?: string;
  /** Optional status text (e.g., "loading...", "3 jobs") */
  status?: string;
  /** Number of active jobs */
  activeJobs?: number;
  /** Output directory for recordings */
  outputDir?: string;
  /** Show FPS counter (default: true) */
  showFps?: boolean;
  /** Custom width (default: terminal width) */
  width?: number;
  /** Compact mode - single line (default: false) */
  compact?: boolean;
}

// =============================================================================
// ASCII Art Logos
// =============================================================================

// Medium ASCII art logo (2 lines tall) - clean and modern
const LOGO_LINES = [
  '█▀█ █▀▀ █▄▀',
  '█▀▄ ██▄ █ █',
];

// Column widths
const LOGO_COL_WIDTH = 15;
const METRICS_COL_WIDTH = 23;

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Column 1: Logo + Version
 */
function LogoColumn(): VNode {
  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');
  const version = getVersionSync();

  return Box(
    { flexDirection: 'column', alignItems: 'center' },
    Text({ color: primaryColor, bold: true }, LOGO_LINES[0]),
    Text({ color: primaryColor, bold: true }, LOGO_LINES[1]),
    Text({ color: mutedFg, dim: true }, `v${version}`),
  );
}

/**
 * Column 2: FPS + CPU/RAM Sparklines
 */
function MetricsColumn(props: { showFps: boolean }): VNode {
  const { showFps } = props;
  const mutedFg = themeColor('mutedForeground');

  // Start monitoring if not already
  startMetricsMonitoring();

  // Get metrics
  const { fps, color: fpsColor } = useFps();
  const { cpu, ram, cpuHistory, ramHistory } = useSystemMetrics();

  const cpuColor = getUsageColor(cpu);
  const ramColor = getUsageColor(ram);

  return Box(
    { flexDirection: 'column' },
    // Row 1: FPS
    showFps
      ? Box(
          { flexDirection: 'row' },
          Text({ color: fpsColor, bold: true }, `${fps} `),
          Text({ color: mutedFg, dim: true }, 'FPS'),
        )
      : Box({ height: 1 }),
    // Row 2: CPU with sparkline
    Box(
      { flexDirection: 'row', gap: 1 },
      Text({ color: mutedFg, dim: true }, 'CPU'),
      cpuHistory.length > 0
        ? Sparkline({ data: cpuHistory, width: 10, color: cpuColor })
        : Text({ color: mutedFg, dim: true }, '──────────'),
      Text({ color: cpuColor }, `${cpu.toString().padStart(2)}%`),
    ),
    // Row 3: RAM with sparkline
    Box(
      { flexDirection: 'row', gap: 1 },
      Text({ color: mutedFg, dim: true }, 'RAM'),
      ramHistory.length > 0
        ? Sparkline({ data: ramHistory, width: 10, color: ramColor })
        : Text({ color: mutedFg, dim: true }, '──────────'),
      Text({ color: ramColor }, `${ram.toString().padStart(2)}%`),
    ),
  );
}

/**
 * Column 3: Jobs + Base URL + Output Dir
 */
function InfoColumn(props: {
  activeJobs: number;
  subtitle?: string;
  outputDir?: string;
}): VNode {
  const { activeJobs, subtitle, outputDir } = props;

  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');
  const successColor = themeColor('success');
  const warningColor = themeColor('warning');

  const baseLabel = subtitle || '(no base URL)';
  const shortOutputDir = outputDir
    ? outputDir.replace(process.env.HOME || '', '~')
    : '';

  // Jobs color based on count
  const jobsColor = activeJobs > 0 ? (activeJobs > 5 ? warningColor : successColor) : mutedFg;

  return Box(
    { flexDirection: 'column' },
    // Row 1: Jobs
    Box(
      { flexDirection: 'row' },
      Text({ color: mutedFg, dim: true }, '⚡ '),
      activeJobs > 0
        ? Text({ color: jobsColor, bold: true }, `${activeJobs} jobs`)
        : Text({ color: mutedFg, dim: true }, '0 jobs'),
    ),
    // Row 2: Base URL
    Box(
      { flexDirection: 'row' },
      Text({ color: mutedFg, dim: true }, '📡 '),
      Text({ color: subtitle ? primaryColor : mutedFg, dim: !subtitle }, baseLabel),
    ),
    // Row 3: Output dir (if set)
    shortOutputDir
      ? Box(
          { flexDirection: 'row' },
          Text({ color: mutedFg, dim: true }, '📁 '),
          Text({ color: primaryColor }, shortOutputDir),
        )
      : Box({ height: 1 }),
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * RekHeader - A beautiful header using SplitBox with 3 columns
 */
export function RekHeader(props: RekHeaderProps): VNode {
  const {
    mode = 'shell',
    subtitle,
    status,
    activeJobs = 0,
    outputDir,
    showFps = true,
    width = process.stdout.columns || 80,
    compact = false,
  } = props;

  const primaryColor = themeColor('primary');

  // Compact mode - single line without SplitBox
  if (compact || width < 60) {
    const { fps, color: fpsColor } = useFps();
    const title = `◆ REK ${mode.toUpperCase()}`;
    const info = subtitle ? ` │ ${subtitle}` : '';
    const jobsStr = activeJobs > 0 ? ` │ ⚡${activeJobs}` : '';
    const fpsStr = showFps ? `${fps}fps` : '';

    return Box(
      { flexDirection: 'row', backgroundColor: primaryColor, width },
      Text({ color: '#000000', bold: true }, ` ${title}`),
      Text({ color: '#000000' }, info),
      Text({ color: '#000000' }, jobsStr),
      Box({ flexGrow: 1 }),
      Text({ color: '#000000' }, `${fpsStr} `),
    );
  }

  // Full header using SplitBox for connected borders with 3 columns
  return SplitBox({
    borderStyle: 'round',
    borderColor: primaryColor,
    width,
    minHeight: 3,
    paddingX: 1,
    sections: [
      {
        width: LOGO_COL_WIDTH,
        content: LogoColumn(),
        valign: 'middle',
        align: 'center',
      },
      {
        width: METRICS_COL_WIDTH,
        content: MetricsColumn({ showFps }),
        valign: 'top',
        align: 'left',
      },
      {
        flexGrow: 1,
        content: InfoColumn({
          activeJobs,
          subtitle,
          outputDir,
        }),
        valign: 'top',
        align: 'left',
      },
    ],
  });
}

// =============================================================================
// Compact Header (for backward compatibility)
// =============================================================================

export function RekHeaderCompact(props: Omit<RekHeaderProps, 'compact'>): VNode {
  return RekHeader({ ...props, compact: true });
}
