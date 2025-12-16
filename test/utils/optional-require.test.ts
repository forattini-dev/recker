import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireOptional, OPTIONAL_DEPENDENCIES, getInstallCommand } from '../../src/utils/optional-require.js';

describe('optional-require', () => {
  it('should have cardinal dependency info', () => {
    expect(OPTIONAL_DEPENDENCIES['cardinal']).toBeDefined();
  });
});
