import { resolve, join } from 'path';
import { existsSync, statSync } from 'fs';
import { pathToFileURL } from 'url';
import type { ToolModule } from './registry.js';

/**
 * Load tool modules from file paths.
 */
export async function loadToolModules(paths: string[]): Promise<ToolModule[]> {
  const modules: ToolModule[] = [];

  for (const path of paths) {
    try {
      const fullPath = resolve(process.cwd(), path);
      
      if (!existsSync(fullPath)) {
        console.error(`Warning: Tool file not found: ${fullPath}`);
        continue;
      }

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        console.error(`Warning: Tool path must be a file, not a directory: ${fullPath}`);
        continue;
      }

      // Dynamic import requires file URL for Windows compatibility and ESM consistency
      const fileUrl = pathToFileURL(fullPath).href;
      const mod = await import(fileUrl);

      if (isValidToolModule(mod)) {
        modules.push(mod);
      } else if (mod.default && isValidToolModule(mod.default)) {
        modules.push(mod.default);
      } else {
        console.error(`Warning: Invalid tool module at ${path}. Must export 'tools' array and 'handlers' object.`);
      }
    } catch (error) {
      console.error(`Error loading tool module from ${path}:`, error);
    }
  }

  return modules;
}

function isValidToolModule(mod: any): mod is ToolModule {
  return (
    mod &&
    Array.isArray(mod.tools) &&
    typeof mod.handlers === 'object' &&
    mod.handlers !== null
  );
}
