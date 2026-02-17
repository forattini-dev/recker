import type { Plugin } from '../types/index.js';

export type PluginScope = 'request' | 'protocol' | 'transport' | 'runtime';

export interface PluginManifest {
  /** Logical plugin name (used for diagnostics and dependency resolution) */
  name: string;
  /** Plugin version (kept for future compatibility checks) */
  version: string;
  /** Plugin lifetime scope */
  scope: PluginScope;
  /** Priority for stable deterministic ordering */
  priority: number;
  /** Optional dependencies for deterministic topological ordering */
  dependsOn: string[];
  /** Optional metadata for lifecycle hooks */
  setup?: string;
  /** Optional metadata for lifecycle hooks */
  teardown?: string;
}

export interface PluginRegistration {
  plugin: Plugin;
  manifest: PluginManifest;
  registrationIndex: number;
}

const MANIFEST_KEY = '__reckerManifest';
const DEFAULT_SCOPE: PluginScope = 'request';
const DEFAULT_PRIORITY = 0;

export function attachPluginManifest(plugin: Plugin, manifest: Partial<PluginManifest>) {
  (plugin as Plugin & { [MANIFEST_KEY]?: PluginManifest }).__reckerManifest = normalizeManifest(plugin, manifest);
  return plugin;
}

export function normalizePluginManifest(plugin: Plugin, options: Partial<PluginManifest> = {}): PluginManifest {
  return normalizeManifest(plugin, options);
}

export function getPluginManifest(plugin: Plugin): PluginManifest | undefined {
  return (plugin as Plugin & { [MANIFEST_KEY]?: PluginManifest }).__reckerManifest;
}

function normalizeManifest(plugin: Plugin, manifest?: Partial<PluginManifest>): PluginManifest {
  const pluginId = manifest?.name || inferPluginName(plugin);
  return {
    name: pluginId,
    version: manifest?.version || '1',
    scope: manifest?.scope || DEFAULT_SCOPE,
    priority: manifest?.priority ?? DEFAULT_PRIORITY,
    dependsOn: manifest?.dependsOn || [],
    setup: manifest?.setup,
    teardown: manifest?.teardown,
  };
}

function inferPluginName(plugin: Plugin): string {
  return plugin.name && plugin.name !== 'anonymous'
    ? plugin.name
    : `plugin-${Math.random().toString(16).slice(2, 10)}`;
}

function assertUniqueName(name: string, existing: Set<string>, source: string) {
  if (existing.has(name)) {
    throw new Error(`Invalid plugin manifest: duplicate plugin name '${name}'. ${source}`);
  }
  existing.add(name);
}

function buildDependencyError(path: string[], target: string): string {
  return `${target} -> ${path.join(' -> ')} -> ${target}`;
}

function formatSortState(names: string[]): string {
  return names.join(' -> ');
}

export function toSortedPlugins(plugins: Plugin[]): PluginRegistration[] {
  return plugins.map((plugin, registrationIndex) => ({
    plugin,
    manifest: normalizePluginManifest(plugin, getPluginManifest(plugin)),
    registrationIndex
  }));
}

export function normalizePlugins(
  registrations: PluginRegistration[]
): {
  ordered: PluginRegistration[];
  debugOrder: string[];
} {
  const byName = new Map<string, PluginRegistration>();
  const seenNames = new Set<string>();

  registrations.forEach((entry) => {
    const manifest = entry.manifest;
    const name = manifest.name;
    assertUniqueName(name, seenNames, 'Use explicit `manifest.name` to avoid collisions for anonymous plugin factories.');
    byName.set(name, entry);
  });

  const edges = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  registrations.forEach((entry) => {
    const { name, dependsOn } = entry.manifest;
    indegree.set(name, 0);
    edges.set(name, new Set<string>());

    for (const dependency of dependsOn) {
      if (!byName.has(dependency)) {
        throw new Error(
          `Invalid plugin dependency for '${name}': missing plugin '${dependency}'. ` +
          'Available plugins: ' +
          Array.from(byName.keys()).sort().join(', ')
        );
      }

      edges.get(dependency)!.add(name);
      indegree.set(name, (indegree.get(name) || 0) + 1);
    }
  });

  const queue: string[] = [];
  byName.forEach((_entry, name) => {
    if ((indegree.get(name) || 0) === 0) {
      queue.push(name);
    }
  });

  const ordered: PluginRegistration[] = [];

  const nextReady = (names: string[]) => names.sort((a, b) => {
    const aMeta = byName.get(a)!;
    const bMeta = byName.get(b)!;

    const priorityDiff = bMeta.manifest.priority - aMeta.manifest.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return aMeta.registrationIndex - bMeta.registrationIndex;
  });

  while (queue.length > 0) {
    const current = nextReady(queue).splice(0, 1)[0];

    const index = queue.indexOf(current);
    if (index >= 0) {
      queue.splice(index, 1);
    }

    const currentEntry = byName.get(current);
    if (!currentEntry) {
      continue;
    }

    ordered.push(currentEntry);

    const dependents = edges.get(current);
    if (!dependents) {
      continue;
    }

    for (const dependentName of dependents) {
      const currentDegree = (indegree.get(dependentName) || 0) - 1;
      indegree.set(dependentName, currentDegree);
      if (currentDegree === 0) {
        queue.push(dependentName);
      }
    }
  }

  if (ordered.length !== registrations.length) {
    const unresolved = Array.from(indegree.entries())
      .filter(([, degree]) => degree > 0)
      .map(([name]) => name);

    const cycle = detectCycle(unresolved, edges);
    throw new Error(
      'Invalid plugin manifest: circular dependency detected. ' +
      `Unresolved nodes: ${formatSortState(unresolved)}. ` +
      (cycle ? `Detected cycle: ${cycle}.` : 'Refactor dependency graph to a DAG.')
    );
  }

  const debugOrder = ordered.map((entry) => `${entry.manifest.name}:${entry.manifest.scope}:${entry.manifest.priority}`);
  return { ordered, debugOrder };
}

function detectCycle(nodes: string[], edges: Map<string, Set<string>>): string | null {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (node: string, stack: string[]): string | null => {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart >= 0) {
        return buildDependencyError(stack.slice(cycleStart), node);
      }
      return null;
    }

    if (visited.has(node)) {
      return null;
    }

    visited.add(node);
    inStack.add(node);

    const nextNodes = edges.get(node) || new Set<string>();
    for (const next of nextNodes) {
      const hit = dfs(next, [...stack, next]);
      if (hit) {
        return hit;
      }
    }

    inStack.delete(node);
    return null;
  };

  for (const node of nodes) {
    const cycle = dfs(node, [node]);
    if (cycle) {
      return cycle;
    }
  }

  return null;
}
