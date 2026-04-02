const fs = require('fs');
const path = require('path');
const { expect } = require('@jest/globals');

/**
 * Holocron Logic Validation
 * 
 * Unit tests for the critical regex and parsing logic used in the 
 * self-healing and sidecar services.
 */

describe('Config Parsing Logic', () => {
  const mockYaml = `
sectors:
  archives:
    name: "Test"
    port: 9999
  living_force:
    port: 2187
`;

  test('extracts archives port correctly', () => {
    const match = mockYaml.match(/archives:\s+name:.*?\s+port:\s+(\d+)/s);
    expect(match).not.toBeNull();
    expect(parseInt(match[1])).toBe(9999);
  });
});

describe('Sector Healer Patching Logic', () => {
  test('correctly identifies and replaces LinkedIn selectors', () => {
    const mockContentJs = "const list = '.msg-conversations-container__conversations-list';";
    const newSelector = ".new-linkedin-class";
    const pattern = /'\.msg-conversations-container__conversations-list'/;
    
    const patched = mockContentJs.replace(pattern, `'${newSelector}'`);
    expect(patched).toBe("const list = '.new-linkedin-class';");
  });

  test('does not patch if pattern is missing', () => {
    const mockContentJs = "const list = '.already-patched';";
    const pattern = /'\.msg-conversations-container__conversations-list'/;
    const patched = mockContentJs.replace(pattern, "'.new'");
    expect(patched).toBe(mockContentJs);
  });
});
